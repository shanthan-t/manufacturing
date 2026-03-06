/**
 * MachineCard — Individual machine status card with health gauge.
 * Includes "Explain Failure" button for machines with elevated failure risk.
 */
import { getRiskColor, MACHINE_ICONS, formatPercent, formatHours } from '../utils/colors';
import { getMachineName } from '../utils/machineNames';

export default function MachineCard({ machine, isSelected, onClick, onExplainFailure }) {
    const riskColor = getRiskColor(machine.failure_prob);
    const healthPct = machine.health_score * 100;
    const icon = MACHINE_ICONS[machine.machine_type] || '⚡';
    const showExplain = machine.failure_prob >= 0.3;

    return (
        <div
            className={`machine-card ${isSelected ? 'machine-card--selected' : ''} machine-card--${machine.status || 'operational'}`}
            onClick={() => onClick?.(machine)}
            style={{ '--risk-color': riskColor }}
        >
            <div className="machine-card__header">
                <span className="machine-card__icon">{icon}</span>
                <span className="machine-card__id">{getMachineName(machine.id)} <span style={{ opacity: 0.6, fontSize: '0.85em', fontWeight: 'normal' }}>({machine.id})</span></span>
                <span className={`status-dot status-dot--${machine.status || 'operational'}`} />
            </div>

            <div className="machine-card__type">{machine.production_line}</div>

            <div className="machine-card__gauge">
                <div className="gauge-track">
                    <div
                        className="gauge-fill"
                        style={{
                            width: `${healthPct}%`,
                            background: `linear-gradient(90deg, ${riskColor}, ${riskColor}cc)`,
                        }}
                    />
                </div>
                <div className="gauge-labels">
                    <span style={{ color: riskColor }}>{formatPercent(machine.health_score)}</span>
                    <span className="gauge-label-muted">Health</span>
                </div>
            </div>

            <div className="machine-card__stats">
                <div className="machine-card__stat">
                    <span className="stat-value" style={{ color: riskColor }}>
                        {formatPercent(machine.failure_prob)}
                    </span>
                    <span className="stat-label">Failure Risk</span>
                </div>
                {machine.predicted_rul !== undefined && (
                    <div className="machine-card__stat">
                        <span className="stat-value">{Math.round(machine.predicted_rul)}</span>
                        <span className="stat-label">RUL (cycles)</span>
                    </div>
                )}
            </div>

            {machine.cascade_risk > 0 && (
                <div className="machine-card__cascade">
                    <span className="cascade-tag">⚡ Cascade Risk: {formatPercent(machine.cascade_risk)}</span>
                </div>
            )}

            {showExplain && (
                <button
                    className="machine-card__explain-btn"
                    onClick={(e) => {
                        e.stopPropagation();
                        onExplainFailure?.(machine);
                    }}
                >
                    🔍 Explain Failure
                </button>
            )}
        </div>
    );
}
