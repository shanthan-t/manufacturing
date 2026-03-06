/**
 * SimulationControls — Controls for cascade failure simulation.
 */
import { useState } from 'react';
import { formatPercent, formatHours, getRiskColor } from '../utils/colors';
import { getMachineDisplayLabel, getMachineShortLabel } from '../utils/machineNames';

export default function SimulationControls({ machines, onSimulate, onReset, cascadeResult, isSimulating }) {
    const [selectedMachineId, setSelectedMachineId] = useState('');
    const [failureProb, setFailureProb] = useState(1.0);

    const handleSimulate = () => {
        if (selectedMachineId) {
            onSimulate(selectedMachineId, failureProb);
        }
    };

    const affectedMachines = cascadeResult?.simulation?.affected_machines || [];

    return (
        <div className="panel simulation-panel">
            <div className="panel-header">
                <h2 className="panel-title">Cascade Simulator</h2>
                <span className="panel-badge">⚡ Propagation</span>
            </div>

            <div className="sim-controls">
                <div className="sim-field">
                    <label className="sim-label">Failure Source</label>
                    <select
                        className="sim-select"
                        value={selectedMachineId}
                        onChange={e => setSelectedMachineId(e.target.value)}
                    >
                        <option value="">Select a machine...</option>
                        {machines?.map(m => (
                            <option key={m.id} value={m.id}>
                                {getMachineDisplayLabel(m.id)}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="sim-field">
                    <label className="sim-label">
                        Failure Intensity: {formatPercent(failureProb)}
                    </label>
                    <input
                        type="range"
                        className="sim-slider"
                        min="0"
                        max="1"
                        step="0.05"
                        value={failureProb}
                        onChange={e => setFailureProb(parseFloat(e.target.value))}
                    />
                </div>

                <div className="sim-buttons">
                    <button
                        className="btn btn-danger"
                        onClick={handleSimulate}
                        disabled={!selectedMachineId || isSimulating}
                    >
                        {isSimulating ? (
                            <><span className="spinner" /> Simulating...</>
                        ) : (
                            '⚡ Simulate Cascade'
                        )}
                    </button>
                    <button className="btn btn-secondary" onClick={onReset}>
                        ↺ Reset
                    </button>
                </div>
            </div>

            {cascadeResult && (
                <div className="sim-results">
                    <h3 className="sim-results-title">Simulation Results</h3>

                    <div className="sim-result-stats">
                        <div className="sim-result-stat">
                            <span className="sim-result-value" style={{ color: '#ff1744' }}>
                                {cascadeResult.simulation?.affected_count || 0}
                            </span>
                            <span className="sim-result-label">Affected</span>
                        </div>
                        <div className="sim-result-stat">
                            <span className="sim-result-value" style={{ color: '#ff6d00' }}>
                                {cascadeResult.simulation?.max_cascade_depth || 0}
                            </span>
                            <span className="sim-result-label">Max Depth</span>
                        </div>
                        <div className="sim-result-stat">
                            <span className="sim-result-value" style={{ color: '#ffab00' }}>
                                {formatHours(cascadeResult.simulation?.total_downtime_hours || 0)}
                            </span>
                            <span className="sim-result-label">Est. Downtime</span>
                        </div>
                    </div>

                    {affectedMachines.length > 0 && (
                        <div className="sim-cascade-list">
                            <h4 className="sim-cascade-title">Cascade Chain</h4>
                            {affectedMachines.map((m, i) => (
                                <div key={m.machine_id} className="sim-cascade-item" style={{ animationDelay: `${i * 0.1}s` }}>
                                    <div className="sim-cascade-depth">
                                        {'→'.repeat(m.depth)}
                                    </div>
                                    <div className="sim-cascade-info">
                                        <span className="sim-cascade-id">{getMachineShortLabel(m.machine_id)}</span>
                                        <span className="sim-cascade-type">{m.machine_id}</span>
                                    </div>
                                    <div className="sim-cascade-risk" style={{ color: getRiskColor(m.combined_risk) }}>
                                        {formatPercent(m.combined_risk)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
