/**
 * HealthPanel — Grid display of all machine health cards.
 */
import MachineCard from './MachineCard';

export default function HealthPanel({ machines, selectedMachine, onSelectMachine }) {
    if (!machines || machines.length === 0) {
        return (
            <div className="panel health-panel">
                <div className="panel-header">
                    <h2 className="panel-title">Machine Health</h2>
                </div>
                <div className="panel-empty">Loading machines...</div>
            </div>
        );
    }

    // Group by production line
    const lines = {};
    machines.forEach(m => {
        const line = m.production_line || 'Unknown';
        if (!lines[line]) lines[line] = [];
        lines[line].push(m);
    });

    return (
        <div className="panel health-panel">
            <div className="panel-header">
                <h2 className="panel-title">Machine Health</h2>
                <span className="panel-badge">{machines.length} machines</span>
            </div>
            <div className="health-grid-scroll">
                {Object.entries(lines).map(([lineName, lineMachines]) => (
                    <div key={lineName} className="health-line-group">
                        <h3 className="health-line-title">{lineName}</h3>
                        <div className="health-grid">
                            {lineMachines.map(machine => (
                                <MachineCard
                                    key={machine.id}
                                    machine={machine}
                                    isSelected={selectedMachine?.id === machine.id}
                                    onClick={onSelectMachine}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
