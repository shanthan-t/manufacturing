/**
 * Header component for CascadeGuard dashboard.
 */
import { formatPercent } from '../utils/colors';

export default function Header({ riskSummary }) {
    const riskLevel = riskSummary?.factory_risk_level || 'unknown';
    const riskClass = `risk-badge risk-${riskLevel}`;

    return (
        <header className="header">
            <div className="header-brand">
                <div className="header-logo">
                    <svg viewBox="0 0 32 32" width="32" height="32">
                        <defs>
                            <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#00e5ff" />
                                <stop offset="100%" stopColor="#651fff" />
                            </linearGradient>
                        </defs>
                        <path d="M16 2 L28 8 L28 20 L16 30 L4 20 L4 8 Z" fill="none" stroke="url(#logoGrad)" strokeWidth="2" />
                        <circle cx="16" cy="14" r="4" fill="url(#logoGrad)" opacity="0.8" />
                        <line x1="16" y1="18" x2="16" y2="24" stroke="url(#logoGrad)" strokeWidth="1.5" />
                        <line x1="12" y1="10" x2="16" y2="14" stroke="url(#logoGrad)" strokeWidth="1" opacity="0.5" />
                        <line x1="20" y1="10" x2="16" y2="14" stroke="url(#logoGrad)" strokeWidth="1" opacity="0.5" />
                    </svg>
                </div>
                <div>
                    <h1 className="header-title">CascadeGuard</h1>
                    <p className="header-subtitle">AI Failure Propagation Intelligence</p>
                </div>
            </div>

            <div className="header-stats">
                <div className="header-stat">
                    <span className="header-stat-value">{riskSummary?.total_machines || '—'}</span>
                    <span className="header-stat-label">Machines</span>
                </div>
                <div className="header-stat">
                    <span className="header-stat-value">
                        {riskSummary ? formatPercent(riskSummary.avg_health_score) : '—'}
                    </span>
                    <span className="header-stat-label">Avg Health</span>
                </div>
                <div className="header-stat">
                    <span className="header-stat-value">{riskSummary?.estimated_total_downtime_hours?.toFixed(1) || '—'}h</span>
                    <span className="header-stat-label">Est. Downtime</span>
                </div>
                <div className="header-stat">
                    <span className={riskClass}>{riskLevel.toUpperCase()}</span>
                    <span className="header-stat-label">Factory Risk</span>
                </div>
            </div>
        </header>
    );
}
