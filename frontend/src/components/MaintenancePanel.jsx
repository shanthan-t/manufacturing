/**
 * MaintenancePanel — Ranked maintenance priorities with recommendations.
 */
import { useState, useEffect } from 'react';
import { getRiskColor, formatPercent, formatHours } from '../utils/colors';
import { getMachineDisplayLabel, getMachineShortLabel } from '../utils/machineNames';

const SEVERITY_ICONS = {
    immediate: { label: 'IMMEDIATE', color: '#ff1744', bg: 'rgba(255, 23, 68, 0.15)', icon: '', timeframe: '< 2 hours' },
    urgent: { label: 'URGENT', color: '#ff6d00', bg: 'rgba(255, 109, 0, 0.15)', icon: '', timeframe: '< 6 hours' },
    scheduled: { label: 'SCHEDULED', color: '#ffab00', bg: 'rgba(255, 171, 0, 0.15)', icon: '', timeframe: '< 24 hours' },
    monitor: { label: 'MONITOR', color: '#00e676', bg: 'rgba(0, 230, 118, 0.15)', icon: '', timeframe: 'Ongoing' },
};

export default function MaintenancePanel() {
    const [priorities, setPriorities] = useState(null);
    const [expandedId, setExpandedId] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('http://localhost:8000/api/maintenance/priorities')
            .then(r => r.json())
            .then(data => { setPriorities(data); setLoading(false); })
            .catch(err => { console.error(err); setLoading(false); });
    }, []);

    if (loading) {
        return (
            <div className="panel maintenance-panel">
                <div className="panel-header">
                    <h2 className="panel-title">Maintenance Priorities</h2>
                    <span className="panel-badge"> Decision Engine</span>
                </div>
                <div className="panel-empty">Loading maintenance analysis...</div>
            </div>
        );
    }

    const items = priorities?.priorities || [];
    const immediateCount = priorities?.immediate_count || 0;
    const urgentCount = priorities?.urgent_count || 0;

    return (
        <div className="panel maintenance-panel">
            <div className="panel-header">
                <h2 className="panel-title">Maintenance Priorities</h2>
                <span className="panel-badge"> Decision Engine</span>
            </div>

            {/* Urgency Summary Bar */}
            <div className="maint-summary">
                <div className="maint-summary-stat">
                    <span className="maint-summary-count" style={{ color: '#ff1744' }}>{immediateCount}</span>
                    <span className="maint-summary-label">Immediate</span>
                </div>
                <div className="maint-summary-stat">
                    <span className="maint-summary-count" style={{ color: '#ff6d00' }}>{urgentCount}</span>
                    <span className="maint-summary-label">Urgent</span>
                </div>
                <div className="maint-summary-stat">
                    <span className="maint-summary-count" style={{ color: '#94a3b8' }}>{items.length}</span>
                    <span className="maint-summary-label">Total</span>
                </div>
            </div>

            {/* Priority List */}
            <div className="maint-list">
                {items.map((item, i) => {
                    const urg = URGENCY_CONFIG[item.urgency] || URGENCY_CONFIG.monitor;
                    const isExpanded = expandedId === item.machine_id;

                    return (
                        <div
                            key={item.machine_id}
                            className={`maint-item ${isExpanded ? 'maint-item--expanded' : ''}`}
                            style={{ animationDelay: `${i * 0.04}s` }}
                        >
                            {/* Header Row */}
                            <div
                                className="maint-item-header"
                                onClick={() => setExpandedId(isExpanded ? null : item.machine_id)}
                            >
                                <div className="maint-item-rank">#{i + 1}</div>
                                <div className="maint-item-icon">{MACHINE_ICONS[item.machine_type] || ''}</div>
                                <div className="maint-item-info">
                                    <div className="maint-item-id">{getMachineDisplayLabel(item.machine_id)}</div>
                                    <div className="maint-item-meta">{item.machine_type} · {item.production_line}</div>
                                </div>
                                <div className="maint-item-right">
                                    <span
                                        className="urgency-badge"
                                        style={{ color: urg.color, background: urg.bg }}
                                    >
                                        {urg.icon} {urg.label}
                                    </span>
                                    <span className="maint-item-score" style={{ color: getRiskColor(item.failure_prob) }}>
                                        {(item.priority_score * 100).toFixed(1)}
                                    </span>
                                </div>
                                <div className="maint-item-chevron">{isExpanded ? '▲' : '▼'}</div>
                            </div>

                            {/* Expanded Details */}
                            {isExpanded && (
                                <div className="maint-item-details">
                                    {/* Stats Row */}
                                    <div className="maint-detail-stats">
                                        <div className="maint-detail-stat">
                                            <span className="maint-detail-value" style={{ color: getRiskColor(item.failure_prob) }}>
                                                {formatPercent(item.failure_prob)}
                                            </span>
                                            <span className="maint-detail-label">Failure Risk</span>
                                        </div>
                                        <div className="maint-detail-stat">
                                            <span className="maint-detail-value" style={{ color: '#00e5ff' }}>
                                                {Math.round(item.predicted_rul)}
                                            </span>
                                            <span className="maint-detail-label">RUL (cycles)</span>
                                        </div>
                                        <div className="maint-detail-stat">
                                            <span className="maint-detail-value" style={{ color: '#a855f7' }}>
                                                {formatPercent(item.cascade_impact_factor)}
                                            </span>
                                            <span className="maint-detail-label">Cascade Impact</span>
                                        </div>
                                        <div className="maint-detail-stat">
                                            <span className="maint-detail-value" style={{ color: '#ffab00' }}>
                                                {formatHours(item.prevented_downtime_hours)}
                                            </span>
                                            <span className="maint-detail-label">Prevented Downtime</span>
                                        </div>
                                    </div>

                                    {/* Reasoning */}
                                    <div className="maint-reasoning">
                                        <p>{item.reasoning}</p>
                                    </div>

                                    {/* Action Items */}
                                    <div className="maint-actions">
                                        <h4 className="maint-actions-title">Recommended Actions</h4>
                                        <ul className="maint-actions-list">
                                            {item.actions.map((action, j) => (
                                                <li key={j} className="maint-action-item">{action}</li>
                                            ))}
                                        </ul>
                                    </div>

                                    {/* Downtime Prevention Callout */}
                                    {item.prevented_downtime_hours >= 1 && (
                                        <div className="maint-prevention-callout">
                                            <span className="maint-prevention-icon"></span>
                                            <span>
                                                Maintaining <strong>{getMachineShortLabel(item.machine_id)}</strong> could prevent{' '}
                                                <strong style={{ color: '#00e676' }}>
                                                    {item.prevented_downtime_hours.toFixed(1)}h
                                                </strong>{' '}
                                                of downstream production loss.
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
