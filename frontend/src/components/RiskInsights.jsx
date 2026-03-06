/**
 * RiskInsights — Critical machines, highest impact analysis, and factory risk summary.
 */
import { useEffect, useState } from 'react';
import { getRiskColor, formatPercent, formatHours, MACHINE_ICONS } from '../utils/colors';

export default function RiskInsights({ riskSummary }) {
    const [criticalMachines, setCriticalMachines] = useState([]);
    const [impactAnalysis, setImpactAnalysis] = useState([]);
    const [activeTab, setActiveTab] = useState('critical');

    useEffect(() => {
        Promise.all([
            fetch('http://localhost:8000/api/risk/critical').then(r => r.json()),
            fetch('http://localhost:8000/api/risk/impact').then(r => r.json()),
        ]).then(([critical, impact]) => {
            setCriticalMachines(critical.critical_machines || []);
            setImpactAnalysis(impact.highest_impact || []);
        }).catch(console.error);
    }, []);

    return (
        <div className="panel insights-panel">
            <div className="panel-header">
                <h2 className="panel-title">Risk Intelligence</h2>
                <span className="panel-badge">AI Analysis</span>
            </div>

            {/* Factory Summary */}
            {riskSummary && (
                <div className="insight-summary">
                    <div className="insight-summary-row">
                        <div className="insight-metric">
                            <div className="insight-metric-icon">🏭</div>
                            <div>
                                <div className="insight-metric-value" style={{ color: getRiskColor(riskSummary.avg_failure_prob) }}>
                                    {formatPercent(riskSummary.avg_health_score)}
                                </div>
                                <div className="insight-metric-label">Factory Health</div>
                            </div>
                        </div>
                        <div className="insight-metric">
                            <div className="insight-metric-icon">⏱️</div>
                            <div>
                                <div className="insight-metric-value" style={{ color: '#ffab00' }}>
                                    {formatHours(riskSummary.estimated_total_downtime_hours)}
                                </div>
                                <div className="insight-metric-label">Est. Downtime</div>
                            </div>
                        </div>
                    </div>
                    {riskSummary.most_vulnerable_line && (
                        <div className="insight-vulnerable">
                            <span className="insight-vulnerable-label">⚠️ Most Vulnerable:</span>
                            <span className="insight-vulnerable-value">
                                {riskSummary.most_vulnerable_line.name}
                                ({formatPercent(riskSummary.most_vulnerable_line.avg_failure_prob)} avg risk)
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* Tabs */}
            <div className="insight-tabs">
                <button
                    className={`insight-tab ${activeTab === 'critical' ? 'insight-tab--active' : ''}`}
                    onClick={() => setActiveTab('critical')}
                >
                    🔴 Critical Machines
                </button>
                <button
                    className={`insight-tab ${activeTab === 'impact' ? 'insight-tab--active' : ''}`}
                    onClick={() => setActiveTab('impact')}
                >
                    💥 Highest Impact
                </button>
            </div>

            {/* Critical Machines */}
            {activeTab === 'critical' && (
                <div className="insight-list">
                    {criticalMachines.map((m, i) => (
                        <div key={m.id} className="insight-item" style={{ animationDelay: `${i * 0.05}s` }}>
                            <div className="insight-item-rank">#{i + 1}</div>
                            <div className="insight-item-icon">{MACHINE_ICONS[m.machine_type] || '⚡'}</div>
                            <div className="insight-item-info">
                                <div className="insight-item-id">{m.id}</div>
                                <div className="insight-item-meta">{m.machine_type} · {m.production_line}</div>
                            </div>
                            <div className="insight-item-stats">
                                <span className="insight-item-risk" style={{ color: getRiskColor(m.failure_prob) }}>
                                    {formatPercent(m.failure_prob)}
                                </span>
                                <span className="insight-item-downstream">
                                    ↓ {m.downstream_count} downstream
                                </span>
                            </div>
                        </div>
                    ))}
                    {criticalMachines.length === 0 && (
                        <div className="panel-empty">No critical machines detected</div>
                    )}
                </div>
            )}

            {/* Impact Analysis */}
            {activeTab === 'impact' && (
                <div className="insight-list">
                    {impactAnalysis.map((m, i) => (
                        <div key={m.machine_id} className="insight-item" style={{ animationDelay: `${i * 0.05}s` }}>
                            <div className="insight-item-rank">#{i + 1}</div>
                            <div className="insight-item-icon">{MACHINE_ICONS[m.machine_type] || '⚡'}</div>
                            <div className="insight-item-info">
                                <div className="insight-item-id">{m.machine_id}</div>
                                <div className="insight-item-meta">{m.machine_type} · {m.production_line}</div>
                            </div>
                            <div className="insight-item-stats">
                                <span className="insight-item-risk" style={{ color: '#ff6d00' }}>
                                    {m.affected_count} affected
                                </span>
                                <span className="insight-item-downstream">
                                    {formatHours(m.total_downtime_hours)} downtime
                                </span>
                            </div>
                        </div>
                    ))}
                    {impactAnalysis.length === 0 && (
                        <div className="panel-empty">No impact data available</div>
                    )}
                </div>
            )}
        </div>
    );
}
