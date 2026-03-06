/**
 * RootCausePanel — Explains why a machine is predicted to fail.
 * Shows top sensor contributors, anomaly indicators, probable causes,
 * and AI-powered engineering explanations.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { getRiskColor, formatPercent } from '../utils/colors';

export default function RootCausePanel({ machineId, onClose }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [aiExplanation, setAiExplanation] = useState(null);
    const [aiLoading, setAiLoading] = useState(false);
    const chartRef = useRef(null);

    useEffect(() => {
        if (!machineId) return;
        setLoading(true);
        setAiExplanation(null);
        fetch(`http://localhost:8000/api/machines/${machineId}/root-cause`)
            .then(r => r.json())
            .then(res => { setData(res.root_cause); setLoading(false); })
            .catch(err => { console.error(err); setLoading(false); });
    }, [machineId]);

    const fetchAiExplanation = useCallback(async () => {
        if (!machineId) return;
        setAiLoading(true);
        try {
            const res = await fetch(`http://localhost:8000/api/machines/${machineId}/root-cause?explain=true`);
            const json = await res.json();
            const rc = json.root_cause;
            setAiExplanation({
                primary_cause: rc.primary_cause,
                secondary_causes: rc.secondary_causes || [],
                recommended_action: rc.recommended_action,
                ai_explanation: rc.ai_explanation,
            });
            // Update data with AI-enriched values
            setData(prev => ({ ...prev, ...rc }));
        } catch (err) {
            console.error('AI explanation failed:', err);
        } finally {
            setAiLoading(false);
        }
    }, [machineId]);

    // Draw sensor importance bar chart
    const drawChart = useCallback(() => {
        if (!data || !chartRef.current) return;
        const container = chartRef.current;
        const width = container.clientWidth;
        const barHeight = 26;
        const margin = { top: 8, right: 50, bottom: 8, left: 120 };
        const sensors = data.top_sensors || [];
        const height = margin.top + margin.bottom + sensors.length * barHeight;

        d3.select(container).selectAll('*').remove();

        const svg = d3.select(container)
            .append('svg')
            .attr('width', width)
            .attr('height', height);

        const innerW = width - margin.left - margin.right;
        const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

        const maxImp = d3.max(sensors, d => d.importance) || 0.01;
        const x = d3.scaleLinear().domain([0, maxImp]).range([0, innerW]);

        sensors.forEach((s, i) => {
            const y = i * barHeight;
            const barW = x(s.importance);

            // Bar background
            g.append('rect')
                .attr('x', 0).attr('y', y + 3)
                .attr('width', innerW).attr('height', barHeight - 6)
                .attr('fill', 'rgba(255,255,255,0.03)')
                .attr('rx', 3);

            // Bar fill - color based on anomaly severity
            const barColor = s.anomaly_severity === 'severe' ? '#ff1744'
                : s.anomaly_severity === 'moderate' ? '#ff6d00'
                    : '#6366f1';

            g.append('rect')
                .attr('x', 0).attr('y', y + 3)
                .attr('width', 0).attr('height', barHeight - 6)
                .attr('fill', barColor)
                .attr('opacity', s.is_anomalous ? 0.8 : 0.5)
                .attr('rx', 3)
                .transition().duration(600).delay(i * 60)
                .attr('width', barW);

            // Anomaly indicator
            if (s.is_anomalous) {
                const indicatorColor = s.anomaly_severity === 'severe' ? '#ff1744' : '#ff6d00';
                g.append('circle')
                    .attr('cx', barW + 8).attr('cy', y + barHeight / 2)
                    .attr('r', 4)
                    .attr('fill', indicatorColor)
                    .attr('opacity', 0)
                    .transition().duration(300).delay(i * 60 + 400)
                    .attr('opacity', 1);
            }

            // Importance value
            g.append('text')
                .attr('x', barW + (s.is_anomalous ? 18 : 6))
                .attr('y', y + barHeight / 2 + 1)
                .attr('fill', '#94a3b8')
                .attr('font-size', '9px')
                .attr('font-family', "'JetBrains Mono', monospace")
                .attr('dominant-baseline', 'middle')
                .text(`${(s.importance * 100).toFixed(1)}%`);

            // Label — color by severity
            const labelColor = s.anomaly_severity === 'severe' ? '#ff1744'
                : s.anomaly_severity === 'moderate' ? '#ff6d00'
                    : '#94a3b8';

            g.append('text')
                .attr('x', -4).attr('y', y + barHeight / 2 + 1)
                .attr('fill', labelColor)
                .attr('font-size', '10px')
                .attr('font-weight', s.is_anomalous ? '600' : '400')
                .attr('text-anchor', 'end')
                .attr('dominant-baseline', 'middle')
                .text(s.display_name.length > 18 ? s.display_name.slice(0, 16) + '…' : s.display_name);
        });
    }, [data]);

    useEffect(() => {
        drawChart();
    }, [drawChart]);

    if (!machineId) return null;

    if (loading) {
        return (
            <div className="panel rootcause-panel">
                <div className="panel-header">
                    <h2 className="panel-title">Root Cause Analysis</h2>
                    <button className="rootcause-close" onClick={onClose}>✕</button>
                </div>
                <div className="panel-empty">Analyzing {machineId}...</div>
            </div>
        );
    }

    if (!data) return null;

    const confidence = data.confidence || 0;
    const causes = data.probable_causes || [];
    const trends = data.trend_summary || [];

    return (
        <div className="panel rootcause-panel">
            <div className="panel-header">
                <h2 className="panel-title">Root Cause — {data.machine_id}</h2>
                <button className="rootcause-close" onClick={onClose}>✕</button>
            </div>

            {/* Confidence Header */}
            <div className="rootcause-confidence">
                <div className="rootcause-conf-bar">
                    <div
                        className="rootcause-conf-fill"
                        style={{
                            width: `${confidence * 100}%`,
                            background: confidence >= 0.7
                                ? 'linear-gradient(90deg, #00e676, #00c853)'
                                : confidence >= 0.4
                                    ? 'linear-gradient(90deg, #ffab00, #ff6d00)'
                                    : 'linear-gradient(90deg, #ff6d00, #ff1744)',
                        }}
                    />
                </div>
                <div className="rootcause-conf-meta">
                    <span className="rootcause-conf-value">{(confidence * 100).toFixed(0)}%</span>
                    <span className="rootcause-conf-label">Analysis Confidence</span>
                    <span className="rootcause-anomaly-count">
                        {data.anomalous_count}/{data.total_sensors_analyzed} sensors anomalous
                    </span>
                </div>
            </div>

            {/* Primary Cause + Recommended Action (from analysis) */}
            {data.primary_cause && (
                <div className="rca-primary-section">
                    <div className="rca-primary-cause">
                        <span className="rca-primary-icon"></span>
                        <div>
                            <div className="rca-primary-label">Primary Cause</div>
                            <div className="rca-primary-text">{data.primary_cause}</div>
                        </div>
                    </div>
                    {data.secondary_causes?.length > 0 && (
                        <div className="rca-secondary">
                            <span className="rca-secondary-label">Contributing Factors:</span>
                            {data.secondary_causes.map((c, i) => (
                                <span key={i} className="rca-secondary-tag"> {c}</span>
                            ))}
                        </div>
                    )}
                    {data.recommended_action && (
                        <div className="rca-recommendation">
                            <span className="rca-rec-icon"></span>
                            <div>
                                <div className="rca-rec-label">Recommended Action</div>
                                <div className="rca-rec-text">{data.recommended_action}</div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* AI Explanation Button + Section */}
            <div className="rca-ai-section">
                {!aiExplanation ? (
                    <button
                        className="rca-ai-btn"
                        onClick={fetchAiExplanation}
                        disabled={aiLoading}
                    >
                        {aiLoading ? (
                            <><span className="rca-ai-spinner" /> Analyzing with AI...</>
                        ) : (
                            <> Explain with AI</>
                        )}
                    </button>
                ) : (
                    <div className="rca-ai-card">
                        <div className="rca-ai-header">
                            <span></span> AI Root Cause Explanation
                        </div>
                        <div className="rca-ai-body">
                            {aiExplanation.primary_cause && (
                                <div className="rca-ai-row">
                                    <span className="rca-ai-label">Primary Cause</span>
                                    <span className="rca-ai-value">{aiExplanation.primary_cause}</span>
                                </div>
                            )}
                            {aiExplanation.secondary_causes?.length > 0 && (
                                <div className="rca-ai-row">
                                    <span className="rca-ai-label">Secondary Signals</span>
                                    <div className="rca-ai-tags">
                                        {aiExplanation.secondary_causes.map((c, i) => (
                                            <span key={i} className="rca-ai-tag">{c}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {aiExplanation.ai_explanation && (
                                <div className="rca-ai-explanation">
                                    {aiExplanation.ai_explanation}
                                </div>
                            )}
                            {aiExplanation.recommended_action && (
                                <div className="rca-ai-maintenance">
                                    <span className="rca-ai-maint-label"> Recommended Maintenance</span>
                                    <span className="rca-ai-maint-text">{aiExplanation.recommended_action}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Sensor Importance Chart */}
            <div className="rootcause-sensors">
                <h3 className="rootcause-section-title">Top Contributing Sensors</h3>
                <div className="rootcause-chart" ref={chartRef}></div>
                <div className="rootcause-legend">
                    <span className="rootcause-legend-item">
                        <span className="rootcause-legend-dot" style={{ background: '#6366f1' }}></span> Normal
                    </span>
                    <span className="rootcause-legend-item">
                        <span className="rootcause-legend-dot" style={{ background: '#ff6d00' }}></span> Moderate
                    </span>
                    <span className="rootcause-legend-item">
                        <span className="rootcause-legend-dot rootcause-legend-alert" style={{ background: '#ff1744' }}></span> Severe
                    </span>
                </div>
            </div>

            {/* Probable Causes */}
            {causes.length > 0 && (
                <div className="rootcause-causes">
                    <h3 className="rootcause-section-title">Probable Failure Causes</h3>
                    <div className="rootcause-causes-list">
                        {causes.map((c, i) => (
                            <div key={i} className="rootcause-cause-item" style={{ animationDelay: `${i * 0.06}s` }}>
                                <span className="rootcause-cause-icon">
                                    {c.relevance === 'high' ? '' : ''}
                                </span>
                                <div className="rootcause-cause-info">
                                    <span className="rootcause-cause-name">{c.cause}</span>
                                    <span className="rootcause-cause-rel">
                                        {c.relevance === 'high' ? 'High relevance' : 'Moderate relevance'} · {c.frequency} sensor{c.frequency > 1 ? 's' : ''}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Trend Summary */}
            {trends.length > 0 && (
                <div className="rootcause-trends">
                    <h3 className="rootcause-section-title">Sensor Trend Analysis</h3>
                    <ul className="rootcause-trend-list">
                        {trends.map((t, i) => (
                            <li key={i} className="rootcause-trend-item">{t}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
