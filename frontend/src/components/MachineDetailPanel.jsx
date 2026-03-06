/**
 * MachineDetailPanel — comprehensive machine intelligence view
 * Shows health metrics, sensor sparklines, root cause, cascade impact, and what-if simulator.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { getRiskColor, formatPercent } from '../utils/colors';
import { postApi } from '../hooks/useApi';
import { getMachineName, getLineLabel, getMachineShortLabel } from '../utils/machineNames';

const URGENCY_COLORS = {
    IMMEDIATE: '#ff1744',
    URGENT: '#ff6d00',
    SCHEDULED: '#ffab00',
    MONITOR: '#00e676',
};

const ACTION_TYPES = [
    { value: 'repair', label: '🔧 Repair' },
    { value: 'replace', label: '🔄 Replace' },
    { value: 'load_reduction', label: '📉 Reduce Load' },
    { value: 'preventive_maintenance', label: '🛠️ Preventive Maint.' },
    { value: 'shutdown', label: '⚠️ Shutdown' },
];

function Sparkline({ sensor, container_width }) {
    const ref = useRef(null);

    useEffect(() => {
        if (!ref.current || !sensor?.values?.length) return;
        const values = sensor.values;
        const width = container_width || 160;
        const height = 36;
        const margin = { top: 4, bottom: 4, left: 0, right: 0 };

        d3.select(ref.current).selectAll('*').remove();

        const svg = d3.select(ref.current)
            .attr('width', width).attr('height', height);

        const x = d3.scaleLinear().domain([0, values.length - 1]).range([margin.left, width - margin.right]);
        const y = d3.scaleLinear().domain([sensor.min, sensor.max]).range([height - margin.bottom, margin.top]);

        const line = d3.line().x((_, i) => x(i)).y(d => y(d)).curve(d3.curveCatmullRom);

        // Area fill
        const area = d3.area().x((_, i) => x(i))
            .y0(height - margin.bottom).y1(d => y(d)).curve(d3.curveCatmullRom);

        const color = sensor.trend === 'rising' ? '#ff6d00' : sensor.trend === 'falling' ? '#00e676' : '#6366f1';

        svg.append('path').datum(values)
            .attr('fill', `${color}18`)
            .attr('d', area);

        svg.append('path').datum(values)
            .attr('fill', 'none')
            .attr('stroke', color)
            .attr('stroke-width', 1.5)
            .attr('d', line);

        // Last value dot
        const lastVal = values[values.length - 1];
        svg.append('circle')
            .attr('cx', x(values.length - 1))
            .attr('cy', y(lastVal))
            .attr('r', 2.5)
            .attr('fill', color);
    }, [sensor, container_width]);

    return <svg ref={ref} />;
}

export default function MachineDetailPanel({ machine, onClose }) {
    const [detail, setDetail] = useState(null);
    const [sensorHistory, setSensorHistory] = useState(null);
    const [rootCause, setRootCause] = useState(null);
    const [loading, setLoading] = useState(true);

    // What-if
    const [selectedAction, setSelectedAction] = useState('repair');
    const [scenarioResult, setScenarioResult] = useState(null);
    const [scenarioLoading, setScenarioLoading] = useState(false);

    const machineId = machine?.id;

    useEffect(() => {
        if (!machineId) return;
        setLoading(true);
        setScenarioResult(null);

        Promise.all([
            fetch(`http://localhost:8000/api/machines/${machineId}/detail`).then(r => r.json()),
            fetch(`http://localhost:8000/api/machines/${machineId}/sensor-history?n_cycles=30`).then(r => r.json()),
            fetch(`http://localhost:8000/api/machines/${machineId}/root-cause`).then(r => r.json()),
        ]).then(([det, hist, rc]) => {
            setDetail(det);
            setSensorHistory(hist);
            setRootCause(rc.root_cause);
        }).catch(console.error)
            .finally(() => setLoading(false));
    }, [machineId]);

    const runScenario = useCallback(async () => {
        setScenarioLoading(true);
        try {
            const result = await postApi('/scenario/simulate', {
                machine_id: machineId,
                action_type: selectedAction,
            });
            setScenarioResult(result.scenario);
        } catch (err) {
            console.error(err);
        } finally {
            setScenarioLoading(false);
        }
    }, [machineId, selectedAction]);

    if (!machine) return null;

    const m = machine;
    const fp = m.failure_prob || 0;
    const riskColor = getRiskColor(fp);

    return (
        <div className="panel machine-detail-panel">
            {/* Header */}
            <div className="panel-header">
                <div className="mdet-header-left">
                    <span className="mdet-machine-id">{getMachineName(m.id)}</span>
                    <span className="mdet-machine-type">{m.id}</span>
                </div>
                <div className="mdet-header-right">
                    <span className="mdet-line-badge">{getLineLabel(m.id)}</span>
                    <button className="rootcause-close" onClick={onClose}>✕</button>
                </div>
            </div>

            {/* Health Metrics Row */}
            <div className="mdet-metrics">
                <div className="mdet-metric">
                    <span className="mdet-metric-value" style={{ color: riskColor }}>
                        {(fp * 100).toFixed(1)}%
                    </span>
                    <span className="mdet-metric-label">Failure Risk</span>
                </div>
                <div className="mdet-metric">
                    <span className="mdet-metric-value" style={{ color: getRiskColor(1 - (m.health_score || 0)) }}>
                        {((m.health_score || 0) * 100).toFixed(1)}%
                    </span>
                    <span className="mdet-metric-label">Health Score</span>
                </div>
                <div className="mdet-metric">
                    <span className="mdet-metric-value">{m.predicted_rul ?? '—'}</span>
                    <span className="mdet-metric-label">RUL (cycles)</span>
                </div>
                <div className="mdet-metric">
                    <span className="mdet-metric-status" style={{ background: `${riskColor}20`, borderColor: riskColor, color: riskColor }}>
                        {m.status?.toUpperCase() || m.risk_level?.toUpperCase() || 'UNKNOWN'}
                    </span>
                    <span className="mdet-metric-label">Status</span>
                </div>
            </div>

            {loading ? (
                <div className="panel-empty" style={{ padding: '2rem' }}>Analyzing {machineId}...</div>
            ) : (
                <>
                    {/* Sensor Sparklines */}
                    {sensorHistory?.sensor_history?.length > 0 && (
                        <div className="mdet-section">
                            <h3 className="mdet-section-title">Sensor Trends (last 30 cycles)</h3>
                            <div className="mdet-sparklines">
                                {sensorHistory.sensor_history.slice(0, 6).map(s => (
                                    <div key={s.sensor} className="mdet-sparkline-item">
                                        <div className="mdet-sparkline-header">
                                            <span className="mdet-sparkline-name">{s.sensor}</span>
                                            <span className={`mdet-sparkline-trend mdet-sparkline-trend--${s.trend}`}>
                                                {s.trend === 'rising' ? '↑' : s.trend === 'falling' ? '↓' : '→'}
                                                {' '}{s.trend}
                                            </span>
                                        </div>
                                        <Sparkline sensor={s} container_width={140} />
                                        <div className="mdet-sparkline-range">
                                            <span>{s.min.toFixed(2)}</span>
                                            <span>{s.max.toFixed(2)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Root Cause Summary + AI Explanation */}
                    {rootCause && (
                        <div className="mdet-section">
                            <h3 className="mdet-section-title">
                                Root Cause Analysis
                                <span className="mdet-section-badge">
                                    {(rootCause.confidence * 100).toFixed(0)}% confidence
                                </span>
                            </h3>

                            {/* Primary cause */}
                            {rootCause.primary_cause && (
                                <div className="mdet-primary-cause">
                                    <span>🔴</span>
                                    <span className="mdet-cause-name">{rootCause.primary_cause}</span>
                                </div>
                            )}

                            <div className="mdet-causes">
                                {(rootCause.probable_causes || []).slice(0, 3).map((c, i) => (
                                    <div key={i} className="mdet-cause-item">
                                        <span>{c.relevance === 'high' ? '🔴' : '🟡'}</span>
                                        <span className="mdet-cause-name">{c.cause}</span>
                                    </div>
                                ))}
                            </div>
                            {rootCause.trend_summary?.[0] && (
                                <p className="mdet-trend-note">{rootCause.trend_summary[0]}</p>
                            )}

                            {/* Recommended action */}
                            {rootCause.recommended_action && (
                                <div className="mdet-rec-action">
                                    <span>🔧</span>
                                    <span>{rootCause.recommended_action}</span>
                                </div>
                            )}

                            {/* AI Explanation */}
                            {rootCause.ai_explanation ? (
                                <div className="mdet-ai-card">
                                    <div className="mdet-ai-header">🤖 AI Analysis</div>
                                    <div className="mdet-ai-text">{rootCause.ai_explanation}</div>
                                </div>
                            ) : (
                                <button
                                    className="mdet-ai-btn"
                                    onClick={async () => {
                                        try {
                                            const res = await fetch(`http://localhost:8000/api/machines/${machineId}/root-cause?explain=true`);
                                            const json = await res.json();
                                            setRootCause(json.root_cause);
                                        } catch (err) {
                                            console.error(err);
                                        }
                                    }}
                                >
                                    🤖 Get AI Explanation
                                </button>
                            )}
                        </div>
                    )}

                    {/* Cascade Impact */}
                    {detail?.cascade && (
                        <div className="mdet-section">
                            <h3 className="mdet-section-title">Cascade Impact</h3>
                            <div className="mdet-cascade-stats">
                                <div className="mdet-cascade-stat">
                                    <span className="mdet-cascade-value" style={{ color: '#ff6d00' }}>
                                        {detail.cascade.affected_count}
                                    </span>
                                    <span className="mdet-cascade-label">Downstream machines</span>
                                </div>
                                <div className="mdet-cascade-stat">
                                    <span className="mdet-cascade-value" style={{ color: '#ff1744' }}>
                                        {detail.cascade.total_downtime_hours.toFixed(1)}h
                                    </span>
                                    <span className="mdet-cascade-label">Potential downtime</span>
                                </div>
                                <div className="mdet-cascade-stat">
                                    <span className="mdet-cascade-value">{detail.cascade.max_depth}</span>
                                    <span className="mdet-cascade-label">Max cascade depth</span>
                                </div>
                            </div>
                            {detail.cascade.affected_machines?.length > 0 && (
                                <div className="mdet-cascade-chain">
                                    {detail.cascade.affected_machines.slice(0, 4).map((am, i) => (
                                        <span key={i} className="mdet-cascade-node"
                                            style={{ background: `${getRiskColor(am.combined_risk)}18`, borderColor: getRiskColor(am.combined_risk), color: getRiskColor(am.combined_risk) }}>
                                            {getMachineShortLabel(am.machine_id)}
                                        </span>
                                    ))}
                                    {detail.cascade.affected_machines.length > 4 && (
                                        <span className="mdet-cascade-more">+{detail.cascade.affected_machines.length - 4} more</span>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* What-If Simulator */}
                    <div className="mdet-section mdet-whatif">
                        <h3 className="mdet-section-title">What-If Simulator</h3>
                        <div className="mdet-whatif-controls">
                            <select
                                className="mdet-action-select"
                                value={selectedAction}
                                onChange={e => { setSelectedAction(e.target.value); setScenarioResult(null); }}
                            >
                                {ACTION_TYPES.map(a => (
                                    <option key={a.value} value={a.value}>{a.label}</option>
                                ))}
                            </select>
                            <button
                                className="mdet-scenario-btn"
                                onClick={runScenario}
                                disabled={scenarioLoading}
                            >
                                {scenarioLoading ? 'Simulating...' : '⚡ Simulate'}
                            </button>
                        </div>

                        {scenarioResult && (
                            <div className="mdet-scenario-result">
                                <div className="mdet-scenario-delta">
                                    <div className="mdet-scenario-col">
                                        <span className="mdet-scenario-label">BEFORE</span>
                                        <span className="mdet-scenario-downtime">
                                            {scenarioResult.before.cascade_downtime_hours.toFixed(1)}h
                                        </span>
                                        <span className="mdet-scenario-risk">
                                            {(scenarioResult.before.failure_prob * 100).toFixed(0)}% risk
                                        </span>
                                    </div>
                                    <div className="mdet-scenario-arrow">→</div>
                                    <div className="mdet-scenario-col mdet-scenario-col--after">
                                        <span className="mdet-scenario-label">AFTER</span>
                                        <span className="mdet-scenario-downtime">
                                            {scenarioResult.after.cascade_downtime_hours.toFixed(1)}h
                                        </span>
                                        <span className="mdet-scenario-risk">
                                            {(scenarioResult.after.failure_prob * 100).toFixed(0)}% risk
                                        </span>
                                    </div>
                                    <div className="mdet-scenario-saving">
                                        <span className="mdet-saving-value">
                                            −{scenarioResult.improvement.downtime_reduction_hours.toFixed(1)}h
                                        </span>
                                        <span className="mdet-saving-label">saved</span>
                                    </div>
                                </div>
                                <p className="mdet-scenario-narrative">{scenarioResult.narrative}</p>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
