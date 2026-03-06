/**
 * AIInsightPanel — executive summary of factory risk with narrative and recommendations.
 */
import { useState, useEffect } from 'react';

const SEVERITY_STYLES = {
    critical: { color: '#ff1744', bg: 'rgba(255, 23, 68, 0.08)', border: 'rgba(255, 23, 68, 0.3)' },
    high: { color: '#ff6d00', bg: 'rgba(255, 109, 0, 0.08)', border: 'rgba(255, 109, 0, 0.3)' },
    medium: { color: '#ffab00', bg: 'rgba(255, 171, 0, 0.08)', border: 'rgba(255, 171, 0, 0.3)' },
    low: { color: '#00e676', bg: 'rgba(0, 230, 118, 0.08)', border: 'rgba(0, 230, 118, 0.3)' },
};

const URGENCY_BADGE = {
    IMMEDIATE: 'ai-urgency--immediate',
    URGENT: 'ai-urgency--urgent',
    SCHEDULED: 'ai-urgency--scheduled',
    MONITOR: 'ai-urgency--monitor',
};

export default function AIInsightPanel() {
    const [insights, setInsights] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('http://localhost:8000/api/insights/summary')
            .then(r => r.json())
            .then(res => { setInsights(res.insights); setLoading(false); })
            .catch(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="panel ai-insight-panel">
                <div className="panel-header">
                    <h2 className="panel-title">AI Insight</h2>
                    <span className="panel-badge ai-badge"> Analysis</span>
                </div>
                <div className="panel-empty">Generating factory insights...</div>
            </div>
        );
    }

    if (!insights) return null;

    const dist = insights.machine_risk_distribution || {};
    const totalM = (dist.critical || 0) + (dist.high || 0) + (dist.medium || 0) + (dist.low || 0);

    return (
        <div className="panel ai-insight-panel">
            <div className="panel-header">
                <h2 className="panel-title">AI Insight</h2>
                <span className="panel-badge ai-badge"> Analysis</span>
            </div>

            {/* Headline narrative */}
            <div className="ai-headline">
                <p className="ai-headline-text">{insights.headline}</p>
            </div>

            {/* Risk distribution mini bar */}
            {totalM > 0 && (
                <div className="ai-risk-dist">
                    {dist.critical > 0 && (
                        <div className="ai-dist-segment" style={{ width: `${(dist.critical / totalM) * 100}%`, background: '#ff1744' }}
                            title={`${dist.critical} critical`} />
                    )}
                    {dist.high > 0 && (
                        <div className="ai-dist-segment" style={{ width: `${(dist.high / totalM) * 100}%`, background: '#ff6d00' }}
                            title={`${dist.high} high`} />
                    )}
                    {dist.medium > 0 && (
                        <div className="ai-dist-segment" style={{ width: `${(dist.medium / totalM) * 100}%`, background: '#ffab00' }}
                            title={`${dist.medium} medium`} />
                    )}
                    {dist.low > 0 && (
                        <div className="ai-dist-segment" style={{ width: `${(dist.low / totalM) * 100}%`, background: '#00e676' }}
                            title={`${dist.low} low`} />
                    )}
                </div>
            )}
            <div className="ai-dist-legend">
                {dist.critical > 0 && <span style={{ color: '#ff1744' }}>{dist.critical} critical</span>}
                {dist.high > 0 && <span style={{ color: '#ff6d00' }}>{dist.high} high</span>}
                {dist.medium > 0 && <span style={{ color: '#ffab00' }}>{dist.medium} medium</span>}
                {dist.low > 0 && <span style={{ color: '#00e676' }}>{dist.low} low</span>}
            </div>

            {/* Insight Cards */}
            {insights.insight_cards?.length > 0 && (
                <div className="ai-cards">
                    {insights.insight_cards.map((card, i) => {
                        const style = SEVERITY_STYLES[card.severity] || SEVERITY_STYLES.medium;
                        return (
                            <div key={i} className="ai-card"
                                style={{ background: style.bg, borderColor: style.border }}>
                                <div className="ai-card-header">
                                    <span className="ai-card-icon">{card.icon}</span>
                                    <span className="ai-card-title" style={{ color: style.color }}>{card.title}</span>
                                </div>
                                <p className="ai-card-detail">{card.detail}</p>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Recommendations */}
            {insights.recommendations?.length > 0 && (
                <div className="ai-recommendations">
                    <h3 className="ai-rec-title">Recommended Actions</h3>
                    {insights.recommendations.map((rec, i) => (
                        <div key={i} className="ai-rec-item">
                            <span className={`ai-urgency-badge ${URGENCY_BADGE[rec.urgency] || ''}`}>
                                {rec.urgency}
                            </span>
                            <div className="ai-rec-content">
                                <span className="ai-rec-machine">{rec.machine_id}</span>
                                <p className="ai-rec-action">{rec.action}</p>
                                <p className="ai-rec-rationale">{rec.rationale}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
