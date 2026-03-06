/**
 * ForecastPanel — Future risk timeline chart and horizon projections.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { getRiskColor, formatPercent } from '../utils/colors';
import { getMachineShortLabel } from '../utils/machineNames';

export default function ForecastPanel() {
    const [activeHorizon, setActiveHorizon] = useState(24);
    const [timelineData, setTimelineData] = useState(null);
    const [forecastData, setForecastData] = useState(null);
    const [loading, setLoading] = useState(true);
    const chartRef = useRef(null);

    // Fetch timeline data
    useEffect(() => {
        setLoading(true);
        Promise.all([
            fetch('http://localhost:8000/api/forecast/timeline/data').then(r => r.json()),
            fetch(`http://localhost:8000/api/forecast/${activeHorizon}`).then(r => r.json()),
        ])
            .then(([timeline, forecast]) => {
                setTimelineData(timeline);
                setForecastData(forecast);
                setLoading(false);
            })
            .catch(err => { console.error(err); setLoading(false); });
    }, [activeHorizon]);

    // Draw D3 chart
    const drawChart = useCallback(() => {
        if (!timelineData || !chartRef.current) return;

        const container = chartRef.current;
        const width = container.clientWidth;
        const height = 200;
        const margin = { top: 20, right: 20, bottom: 30, left: 45 };

        d3.select(container).selectAll('*').remove();

        const svg = d3.select(container)
            .append('svg')
            .attr('width', width)
            .attr('height', height);

        const data = timelineData.data_points;
        const innerW = width - margin.left - margin.right;
        const innerH = height - margin.top - margin.bottom;

        const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

        // Scales
        const x = d3.scaleLinear().domain([0, timelineData.max_hours]).range([0, innerW]);
        const y = d3.scaleLinear().domain([0, 1]).range([innerH, 0]);

        // Grid lines
        g.selectAll('.grid-line')
            .data([0.25, 0.5, 0.75])
            .enter()
            .append('line')
            .attr('x1', 0).attr('x2', innerW)
            .attr('y1', d => y(d)).attr('y2', d => y(d))
            .attr('stroke', 'rgba(255,255,255,0.06)')
            .attr('stroke-dasharray', '3,3');

        // Risk zone backgrounds
        const zones = [
            { y0: 0.0, y1: 0.3, fill: 'rgba(0,230,118,0.04)' },
            { y0: 0.3, y1: 0.5, fill: 'rgba(255,171,0,0.04)' },
            { y0: 0.5, y1: 0.8, fill: 'rgba(255,109,0,0.04)' },
            { y0: 0.8, y1: 1.0, fill: 'rgba(255,23,68,0.06)' },
        ];
        zones.forEach(z => {
            g.append('rect')
                .attr('x', 0).attr('width', innerW)
                .attr('y', y(z.y1)).attr('height', y(z.y0) - y(z.y1))
                .attr('fill', z.fill);
        });

        // Area for failure probability
        const area = d3.area()
            .x(d => x(d.hour))
            .y0(innerH)
            .y1(d => y(d.avg_failure_prob))
            .curve(d3.curveMonotoneX);

        const gradient = svg.append('defs')
            .append('linearGradient')
            .attr('id', 'failGradient')
            .attr('x1', '0').attr('y1', '0')
            .attr('x2', '0').attr('y2', '1');
        gradient.append('stop').attr('offset', '0%').attr('stop-color', '#ff1744').attr('stop-opacity', 0.4);
        gradient.append('stop').attr('offset', '100%').attr('stop-color', '#ff1744').attr('stop-opacity', 0.02);

        g.append('path')
            .datum(data)
            .attr('fill', 'url(#failGradient)')
            .attr('d', area);

        // Line for failure probability
        const line = d3.line()
            .x(d => x(d.hour))
            .y(d => y(d.avg_failure_prob))
            .curve(d3.curveMonotoneX);

        g.append('path')
            .datum(data)
            .attr('fill', 'none')
            .attr('stroke', '#ff6d00')
            .attr('stroke-width', 2.5)
            .attr('d', line);

        // Health score line
        const healthLine = d3.line()
            .x(d => x(d.hour))
            .y(d => y(d.avg_health_score))
            .curve(d3.curveMonotoneX);

        g.append('path')
            .datum(data)
            .attr('fill', 'none')
            .attr('stroke', '#00e676')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '6,3')
            .attr('d', healthLine);

        // Data points
        g.selectAll('.point-fail')
            .data(data)
            .enter()
            .append('circle')
            .attr('cx', d => x(d.hour))
            .attr('cy', d => y(d.avg_failure_prob))
            .attr('r', 3.5)
            .attr('fill', d => getRiskColor(d.avg_failure_prob))
            .attr('stroke', '#0c1220')
            .attr('stroke-width', 1.5);

        // Horizon indicator
        g.append('line')
            .attr('x1', x(activeHorizon)).attr('x2', x(activeHorizon))
            .attr('y1', 0).attr('y2', innerH)
            .attr('stroke', '#00e5ff')
            .attr('stroke-width', 1.5)
            .attr('stroke-dasharray', '4,4')
            .attr('opacity', 0.6);

        g.append('text')
            .attr('x', x(activeHorizon))
            .attr('y', -6)
            .attr('text-anchor', 'middle')
            .attr('fill', '#00e5ff')
            .attr('font-size', '10px')
            .attr('font-weight', '600')
            .text(`${activeHorizon}h`);

        // Axes
        const xAxis = d3.axisBottom(x).ticks(6).tickFormat(d => `${d}h`);
        g.append('g')
            .attr('transform', `translate(0,${innerH})`)
            .call(xAxis)
            .selectAll('text').attr('fill', '#64748b').attr('font-size', '10px');
        g.selectAll('.domain, .tick line').attr('stroke', 'rgba(255,255,255,0.1)');

        const yAxis = d3.axisLeft(y).ticks(4).tickFormat(d => `${(d * 100).toFixed(0)}%`);
        g.append('g')
            .call(yAxis)
            .selectAll('text').attr('fill', '#64748b').attr('font-size', '10px');

        // Legend
        const legend = g.append('g').attr('transform', `translate(${innerW - 160}, 0)`);
        legend.append('line').attr('x1', 0).attr('x2', 16).attr('y1', 0).attr('y2', 0)
            .attr('stroke', '#ff6d00').attr('stroke-width', 2.5);
        legend.append('text').attr('x', 22).attr('y', 4)
            .attr('fill', '#94a3b8').attr('font-size', '9px').text('Failure Prob');

        legend.append('line').attr('x1', 0).attr('x2', 16).attr('y1', 16).attr('y2', 16)
            .attr('stroke', '#00e676').attr('stroke-width', 2).attr('stroke-dasharray', '6,3');
        legend.append('text').attr('x', 22).attr('y', 20)
            .attr('fill', '#94a3b8').attr('font-size', '9px').text('Health Score');

    }, [timelineData, activeHorizon]);

    useEffect(() => {
        drawChart();
        const handleResize = () => drawChart();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [drawChart]);

    const summary = forecastData?.summary || {};
    const likelyFailures = summary.likely_failures || [];

    if (loading) {
        return (
            <div className="panel forecast-panel">
                <div className="panel-header">
                    <h2 className="panel-title">Future Risk Forecast</h2>
                    <span className="panel-badge"> Prediction</span>
                </div>
                <div className="panel-empty">Computing forecast...</div>
            </div>
        );
    }

    return (
        <div className="panel forecast-panel">
            <div className="panel-header">
                <h2 className="panel-title">Future Risk Forecast</h2>
                <span className="panel-badge"> Prediction</span>
            </div>

            {/* Horizon Selector */}
            <div className="forecast-horizons">
                {[6, 12, 24].map(h => (
                    <button
                        key={h}
                        className={`forecast-horizon-btn ${activeHorizon === h ? 'forecast-horizon-btn--active' : ''}`}
                        onClick={() => setActiveHorizon(h)}
                    >
                        {h}h Forecast
                    </button>
                ))}
            </div>

            {/* Summary Stats */}
            <div className="forecast-summary">
                <div className="forecast-stat">
                    <span className="forecast-stat-value" style={{ color: getRiskColor(summary.avg_failure_prob || 0) }}>
                        {summary.avg_health_score != null ? formatPercent(summary.avg_health_score) : '—'}
                    </span>
                    <span className="forecast-stat-label">Projected Health</span>
                </div>
                <div className="forecast-stat">
                    <span className="forecast-stat-value" style={{ color: '#ff6d00' }}>
                        {summary.estimated_downtime_hours != null ? formatHours(summary.estimated_downtime_hours) : '—'}
                    </span>
                    <span className="forecast-stat-label">Est. Downtime</span>
                </div>
                <div className="forecast-stat">
                    <span className="forecast-stat-value" style={{ color: '#ff1744' }}>
                        {summary.likely_failures_count ?? '—'}
                    </span>
                    <span className="forecast-stat-label">Predicted Failures</span>
                </div>
            </div>

            {/* Timeline Chart */}
            <div className="forecast-chart-container">
                <div className="forecast-chart-title">Factory Health Trajectory (0–24h)</div>
                <div className="forecast-chart" ref={chartRef}></div>
            </div>

            {/* Likely Failures */}
            {likelyFailures.length > 0 && (
                <div className="forecast-failures">
                    <h4 className="forecast-failures-title"> Machines Predicted to Fail</h4>
                    <div className="forecast-failures-list">
                        {likelyFailures.map((m, i) => (
                            <div key={m.machine_id} className="forecast-fail-item" style={{ animationDelay: `${i * 0.06}s` }}>
                                <span className="forecast-fail-icon">{MACHINE_ICONS[m.machine_type] || ''}</span>
                                <div className="forecast-fail-info">
                                    <span className="forecast-fail-id">{getMachineShortLabel(m.machine_id)}</span>
                                    <span className="forecast-fail-type">{m.machine_type}</span>
                                </div>
                                <div className="forecast-fail-stats">
                                    <span className="forecast-fail-prob" style={{ color: getRiskColor(m.future_failure_prob) }}>
                                        {formatPercent(m.future_failure_prob)}
                                    </span>
                                    {m.hours_to_failure < 100 && (
                                        <span className="forecast-fail-countdown">
                                            ~{m.hours_to_failure}h to failure
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Vulnerable Line Callout */}
            {summary.most_vulnerable_line && (
                <div className="forecast-vulnerable">
                     <strong>{summary.most_vulnerable_line.name}</strong> projected at{' '}
                    {formatPercent(summary.most_vulnerable_line.avg_failure_prob)} avg risk in {activeHorizon}h
                </div>
            )}
        </div>
    );
}
