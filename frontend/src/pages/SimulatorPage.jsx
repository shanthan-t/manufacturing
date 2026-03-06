import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useApi, postApi } from '../hooks/useApi'
import { getMachineShortLabel, getMachineDisplayLabel } from '../utils/machineNames'

const pageTransition = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.3 },
}

function riskColor(prob) {
    if (prob >= 0.7) return 'var(--color-critical)'
    if (prob >= 0.4) return 'var(--color-warning)'
    return 'var(--color-success)'
}

export default function SimulatorPage() {
    const { data: graphData } = useApi('/graph')
    const machines = graphData?.nodes || []

    // Group machines by production line
    const machinesByLine = machines.reduce((acc, m) => {
        const line = m.production_line || 'Unknown Line'
        if (!acc[line]) acc[line] = []
        acc[line].push(m)
        return acc
    }, {})

    // Sort lines alphabetically
    const sortedLines = Object.keys(machinesByLine).sort()

    const [selectedId, setSelectedId] = useState('')
    const [failureProb, setFailureProb] = useState(0.9)
    const [result, setResult] = useState(null)
    const [simulating, setSimulating] = useState(false)

    const selectedMachine = machines.find(m => m.id === selectedId)

    const handleSimulate = useCallback(async () => {
        if (!selectedId) return
        setSimulating(true)
        try {
            const res = await postApi('/simulate', {
                machine_id: selectedId,
                failure_prob: failureProb,
            })
            setResult(res.simulation)
        } catch (err) {
            console.error('Simulation failed:', err)
        } finally {
            setSimulating(false)
        }
    }, [selectedId, failureProb])

    const handleReset = useCallback(async () => {
        try {
            await postApi('/simulate/reset', {})
            setResult(null)
        } catch (err) {
            console.error('Reset failed:', err)
        }
    }, [])

    return (
        <motion.div className="page-container" {...pageTransition}>
            <div className="page-header">
                <h1 className="page-title">Cascade Simulator</h1>
                <p className="page-subtitle">Simulate machine failures and visualize cascade propagation</p>
            </div>

            <div className="grid-2">
                {/* Controls */}
                <div className="glass" style={{ padding: '28px' }}>
                    <h3 className="section-title">⚡ Simulation Controls</h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginTop: '16px' }}>
                        {/* Machine Select */}
                        <div>
                            <label style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '8px', display: 'block' }}>
                                Select Machine
                            </label>
                            <select
                                className="sim-select"
                                value={selectedId}
                                onChange={e => {
                                    setSelectedId(e.target.value)
                                    setResult(null) // Reset results when changing machine
                                }}
                            >
                                <option value="">Choose a machine…</option>
                                {sortedLines.map(line => (
                                    <optgroup key={line} label={line}>
                                        {machinesByLine[line].map(m => (
                                            <option key={m.id} value={m.id}>
                                                {getMachineDisplayLabel(m.id)}
                                            </option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
                        </div>

                        {/* Machine Preview Card */}
                        <AnimatePresence>
                            {selectedMachine && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                                    animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
                                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                                    className="glass-sm"
                                    style={{ padding: '16px', overflow: 'hidden' }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                                {getMachineDisplayLabel(selectedMachine.id)}
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                                                {selectedMachine.production_line}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '16px', marginTop: '16px' }}>
                                        <div>
                                            <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>Health Score</div>
                                            <div style={{ fontSize: '14px', fontWeight: 600, color: riskColor(1 - selectedMachine.health_score) }}>
                                                {(selectedMachine.health_score * 100).toFixed(1)}%
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>Current Risk</div>
                                            <div style={{ fontSize: '14px', fontWeight: 600, color: riskColor(selectedMachine.failure_probability) }}>
                                                {(selectedMachine.failure_probability * 100).toFixed(1)}%
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Failure Intensity */}
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <label style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                                    Failure Intensity
                                </label>
                                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-primary)' }}>
                                    {(failureProb * 100).toFixed(0)}%
                                </span>
                            </div>
                            <input
                                type="range"
                                className="sim-slider"
                                min="0.1"
                                max="1.0"
                                step="0.05"
                                value={failureProb}
                                onChange={e => setFailureProb(parseFloat(e.target.value))}
                            />
                        </div>

                        {/* Buttons */}
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button
                                className="btn-primary"
                                onClick={handleSimulate}
                                disabled={!selectedId || simulating}
                                style={{ flex: 1 }}
                            >
                                {simulating ? 'Simulating…' : '⚡ Simulate Failure'}
                            </button>
                            {result && (
                                <button className="btn-secondary" onClick={handleReset}>
                                    Reset
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Results */}
                <div className="glass" style={{ padding: '28px' }}>
                    <h3 className="section-title">🌊 Cascade Impact</h3>

                    <AnimatePresence mode="wait">
                        {result ? (
                            <motion.div
                                key="results"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.3 }}
                            >
                                {/* Impact Summary */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '24px' }}>
                                    <div className="glass-sm" style={{ padding: '16px', textAlign: 'center' }}>
                                        <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-critical)' }}>
                                            {result.affected_count}
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                                            Machines Hit
                                        </div>
                                    </div>
                                    <div className="glass-sm" style={{ padding: '16px', textAlign: 'center' }}>
                                        <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-warning)' }}>
                                            {result.total_downtime_hours?.toFixed(1)}h
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                                            Downtime
                                        </div>
                                    </div>
                                    <div className="glass-sm" style={{ padding: '16px', textAlign: 'center' }}>
                                        <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-primary)' }}>
                                            {result.max_cascade_depth}
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                                            Cascade Depth
                                        </div>
                                    </div>
                                </div>

                                {/* Affected Machines */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {result.affected_machines?.map((m, i) => (
                                        <motion.div
                                            key={m.machine_id}
                                            className={`machine-item ${m.machine_id === selectedId ? 'machine-item-simulated' : ''}`}
                                            initial={{ opacity: 0, x: -20, background: 'var(--color-bg-tertiary)' }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.08, duration: 0.4 }}
                                        >
                                            <div className="machine-item-info">
                                                <span className="machine-item-name">{getMachineShortLabel(m.machine_id)}</span>
                                                <span className="machine-item-line">Depth {m.depth}</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div className="risk-bar">
                                                    <div className="risk-bar-fill" style={{
                                                        width: `${m.combined_risk * 100}%`,
                                                        background: riskColor(m.combined_risk),
                                                    }} />
                                                </div>
                                                <span style={{ fontSize: '13px', fontWeight: 600, color: riskColor(m.combined_risk) }}>
                                                    {(m.combined_risk * 100).toFixed(0)}%
                                                </span>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="empty"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-tertiary)' }}
                            >
                                <div style={{ fontSize: '48px', marginBottom: '12px' }}>⚡</div>
                                <p style={{ fontSize: '15px' }}>Select a machine and run a simulation to see cascade impact</p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </motion.div>
    )
}
