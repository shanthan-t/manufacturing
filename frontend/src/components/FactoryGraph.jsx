/**
 * FactoryGraph — D3.js Network Visualization with dual view modes
 * Toggle between Factory Layout (grid) and Graph View (force-directed).
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { getRiskColor, getGlowColor, MACHINE_ICONS, formatPercent } from '../utils/colors';
import { getMachineShortLabel } from '../utils/machineNames';

export default function FactoryGraph({ graphData, onSelectMachine, selectedMachine, cascadeResult }) {
    const svgRef = useRef(null);
    const simulationRef = useRef(null);
    const [viewMode, setViewMode] = useState('factory'); // 'factory' | 'graph'

    const renderGraph = useCallback(() => {
        if (!graphData || !svgRef.current) return;

        const container = svgRef.current.parentElement;
        const width = container.clientWidth;
        const height = container.clientHeight || 500;

        // Stop any existing simulation
        if (simulationRef.current) {
            simulationRef.current.stop();
            simulationRef.current = null;
        }

        // Clear previous
        d3.select(svgRef.current).selectAll('*').remove();

        const svg = d3.select(svgRef.current)
            .attr('width', width)
            .attr('height', height);

        // Defs for gradients and filters
        const defs = svg.append('defs');

        // Glow filter
        const glow = defs.append('filter').attr('id', 'glow');
        glow.append('feGaussianBlur').attr('stdDeviation', '4').attr('result', 'coloredBlur');
        const feMerge = glow.append('feMerge');
        feMerge.append('feMergeNode').attr('in', 'coloredBlur');
        feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

        // Arrow marker
        defs.append('marker')
            .attr('id', 'arrowhead')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 28)
            .attr('refY', 0)
            .attr('markerWidth', 8)
            .attr('markerHeight', 8)
            .attr('orient', 'auto')
            .append('path')
            .attr('d', 'M0,-5L10,0L0,5')
            .attr('fill', '#4a5568');

        // Arrow marker for force-directed (shorter refX)
        defs.append('marker')
            .attr('id', 'arrowhead-force')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 32)
            .attr('refY', 0)
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .attr('orient', 'auto')
            .append('path')
            .attr('d', 'M0,-5L10,0L0,5')
            .attr('fill', '#4a5568');

        // Create zoom group
        const g = svg.append('g');

        // Zoom behavior
        const zoom = d3.zoom()
            .scaleExtent([0.3, 3])
            .on('zoom', (event) => g.attr('transform', event.transform));
        svg.call(zoom);

        // Prepare data
        const nodes = graphData.nodes.map(d => ({ ...d }));
        const links = graphData.edges.map(d => ({
            ...d,
            source: d.source,
            target: d.target,
        }));

        if (viewMode === 'factory') {
            renderFactoryLayout(g, svg, zoom, nodes, links, width, height);
        } else {
            renderForceLayout(g, svg, zoom, nodes, links, width, height);
        }
    }, [graphData, selectedMachine, onSelectMachine, viewMode]);

    // Factory layout — fixed grid with production line rows
    function renderFactoryLayout(g, svg, zoom, nodes, links, width, height) {
        const lines = {};
        nodes.forEach(n => {
            if (!lines[n.production_line]) lines[n.production_line] = [];
            lines[n.production_line].push(n);
        });

        const lineNames = Object.keys(lines);
        const lineSpacing = height / (lineNames.length + 1);
        const nodeSpacing = width / 7;

        lineNames.forEach((lineName, lineIdx) => {
            const lineNodes = lines[lineName];
            lineNodes.sort((a, b) => a.position_in_line - b.position_in_line);
            lineNodes.forEach((node, nodeIdx) => {
                node.x = nodeSpacing * (nodeIdx + 1.5);
                node.y = lineSpacing * (lineIdx + 1);
                node.fx = node.x;
                node.fy = node.y;
            });
        });

        // Flow direction arrows between positions
        lineNames.forEach((lineName, lineIdx) => {
            const lineNodes = lines[lineName];
            for (let i = 0; i < lineNodes.length - 1; i++) {
                const a = lineNodes[i];
                const b = lineNodes[i + 1];
                g.append('path')
                    .attr('d', `M${a.x + 26},${a.y} L${b.x - 26},${b.y}`)
                    .attr('stroke', '#334155')
                    .attr('stroke-width', 2)
                    .attr('fill', 'none')
                    .attr('marker-end', 'url(#arrowhead)')
                    .attr('opacity', 0.5);
            }
        });

        // Draw links (dependency edges)
        const link = g.selectAll('.link')
            .data(links)
            .enter()
            .append('line')
            .attr('class', 'link')
            .attr('stroke', d => d.dependency_type === 'cross-line' ? '#6366f180' : '#4a556860')
            .attr('stroke-width', d => d.dependency_type === 'cross-line' ? 1.5 : 2)
            .attr('stroke-dasharray', d => d.dependency_type === 'cross-line' ? '6,4' : 'none')
            .attr('marker-end', 'url(#arrowhead)');

        // Draw line labels
        g.selectAll('.line-label')
            .data(lineNames)
            .enter()
            .append('text')
            .attr('class', 'line-label')
            .attr('x', 12)
            .attr('y', (d, i) => lineSpacing * (i + 1) - 30)
            .attr('fill', '#94a3b8')
            .attr('font-size', '11px')
            .attr('font-weight', '600')
            .attr('letter-spacing', '0.5px')
            .text(d => d.toUpperCase());

        drawNodes(g, nodes);
        positionLinks(link, nodes);

        // Position nodes
        g.selectAll('.node').attr('transform', d => `translate(${d.x}, ${d.y})`);

        // Initial zoom
        svg.call(zoom.transform, d3.zoomIdentity.translate(20, 0).scale(0.95));
    }

    // Force-directed layout — spring physics simulation
    function renderForceLayout(g, svg, zoom, nodes, links, width, height) {
        // Initialize positions near center
        nodes.forEach(n => {
            n.x = width / 2 + (Math.random() - 0.5) * 200;
            n.y = height / 2 + (Math.random() - 0.5) * 200;
            delete n.fx;
            delete n.fy;
        });

        // Create force simulation
        const simulation = d3.forceSimulation(nodes)
            .force('link', d3.forceLink(links).id(d => d.id).distance(90).strength(0.7))
            .force('charge', d3.forceManyBody().strength(-300))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide().radius(35))
            .force('x', d3.forceX(width / 2).strength(0.05))
            .force('y', d3.forceY(height / 2).strength(0.05));

        simulationRef.current = simulation;

        // Draw links
        const link = g.selectAll('.link')
            .data(links)
            .enter()
            .append('line')
            .attr('class', 'link')
            .attr('stroke', d => d.dependency_type === 'cross-line' ? '#6366f180' : '#4a556860')
            .attr('stroke-width', d => d.dependency_type === 'cross-line' ? 1.5 : 2)
            .attr('stroke-dasharray', d => d.dependency_type === 'cross-line' ? '6,4' : 'none')
            .attr('marker-end', 'url(#arrowhead-force)');

        const nodeGroup = drawNodes(g, nodes, true);

        // Add drag behavior
        const drag = d3.drag()
            .on('start', (event, d) => {
                if (!event.active) simulation.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
            })
            .on('drag', (event, d) => {
                d.fx = event.x;
                d.fy = event.y;
            })
            .on('end', (event, d) => {
                if (!event.active) simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
            });

        nodeGroup.call(drag);

        // Update positions on tick
        simulation.on('tick', () => {
            link
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);

            nodeGroup.attr('transform', d => `translate(${d.x}, ${d.y})`);
        });

        // Initial zoom
        svg.call(zoom.transform, d3.zoomIdentity.translate(0, 0).scale(0.85));
    }

    // Shared node rendering
    function drawNodes(g, nodes, isDraggable = false) {
        const node = g.selectAll('.node')
            .data(nodes)
            .enter()
            .append('g')
            .attr('class', 'node')
            .attr('cursor', isDraggable ? 'grab' : 'pointer')
            .on('click', (event, d) => onSelectMachine?.(d));

        // Glow circle
        node.append('circle')
            .attr('class', 'node-glow')
            .attr('r', 28)
            .attr('fill', 'none')
            .attr('stroke', d => getRiskColor(d.failure_prob))
            .attr('stroke-width', 3)
            .attr('opacity', 0.3)
            .attr('filter', 'url(#glow)');

        // Main circle
        node.append('circle')
            .attr('class', 'node-circle')
            .attr('r', 22)
            .attr('fill', d => `${getRiskColor(d.failure_prob)}20`)
            .attr('stroke', d => getRiskColor(d.failure_prob))
            .attr('stroke-width', 2.5);

        // Machine icon
        node.append('text')
            .attr('class', 'node-icon')
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'central')
            .attr('font-size', '16px')
            .text(d => MACHINE_ICONS[d.machine_type] || '⚡');

        // ID label
        node.append('text')
            .attr('class', 'node-label')
            .attr('text-anchor', 'middle')
            .attr('y', 36)
            .attr('fill', '#e2e8f0')
            .attr('font-size', '10px')
            .attr('font-weight', '600')
            .text(d => getMachineShortLabel(d.id));

        // Health percentage
        node.append('text')
            .attr('class', 'node-health')
            .attr('text-anchor', 'middle')
            .attr('y', 48)
            .attr('fill', d => getRiskColor(d.failure_prob))
            .attr('font-size', '9px')
            .attr('font-weight', '500')
            .text(d => formatPercent(d.health_score));

        // Highlight selected
        node.each(function (d) {
            if (selectedMachine && d.id === selectedMachine.id) {
                d3.select(this).select('.node-circle')
                    .attr('stroke-width', 4)
                    .attr('stroke', '#00e5ff');
                d3.select(this).select('.node-glow')
                    .attr('stroke', '#00e5ff')
                    .attr('opacity', 0.6);
            }
        });

        return node;
    }

    function positionLinks(link, nodes) {
        link
            .attr('x1', d => {
                const source = nodes.find(n => n.id === d.source);
                return source ? source.x : 0;
            })
            .attr('y1', d => {
                const source = nodes.find(n => n.id === d.source);
                return source ? source.y : 0;
            })
            .attr('x2', d => {
                const target = nodes.find(n => n.id === d.target);
                return target ? target.x : 0;
            })
            .attr('y2', d => {
                const target = nodes.find(n => n.id === d.target);
                return target ? target.y : 0;
            });
    }

    // Cascade animation effect
    useEffect(() => {
        if (!cascadeResult || !svgRef.current) return;

        const affected = cascadeResult.simulation?.affected_machines || [];
        if (affected.length === 0) return;

        const svg = d3.select(svgRef.current);

        affected.forEach((machine) => {
            const nodeGroup = svg.selectAll('.node')
                .filter(d => d.id === machine.machine_id);

            if (!nodeGroup.empty()) {
                const delay = machine.depth * 400;

                nodeGroup.select('.node-glow')
                    .transition()
                    .delay(delay)
                    .duration(300)
                    .attr('r', 40)
                    .attr('opacity', 0.8)
                    .attr('stroke', '#ff1744')
                    .transition()
                    .duration(500)
                    .attr('r', 28)
                    .attr('opacity', 0.4);

                nodeGroup.select('.node-circle')
                    .transition()
                    .delay(delay)
                    .duration(300)
                    .attr('stroke', getRiskColor(machine.combined_risk))
                    .attr('fill', `${getRiskColor(machine.combined_risk)}30`);

                nodeGroup.select('.node-health')
                    .transition()
                    .delay(delay)
                    .duration(300)
                    .attr('fill', getRiskColor(machine.combined_risk))
                    .text(formatPercent(1 - machine.combined_risk));
            }
        });
    }, [cascadeResult]);

    useEffect(() => {
        renderGraph();
        const handleResize = () => renderGraph();
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            if (simulationRef.current) simulationRef.current.stop();
        };
    }, [renderGraph]);

    return (
        <div className="panel graph-panel">
            <div className="panel-header">
                <h2 className="panel-title">Factory Network</h2>
                <div className="graph-controls">
                    <div className="view-toggle">
                        <button
                            className={`view-toggle-btn ${viewMode === 'factory' ? 'view-toggle-btn--active' : ''}`}
                            onClick={() => setViewMode('factory')}
                            title="Factory Layout"
                        >
                            🏭 Layout
                        </button>
                        <button
                            className={`view-toggle-btn ${viewMode === 'graph' ? 'view-toggle-btn--active' : ''}`}
                            onClick={() => setViewMode('graph')}
                            title="Graph View"
                        >
                            🔗 Graph
                        </button>
                    </div>
                    <span className="panel-badge">{graphData?.nodes?.length || 0} machines</span>
                </div>
            </div>
            <div className="graph-container">
                <svg ref={svgRef}></svg>
            </div>
        </div>
    );
}
