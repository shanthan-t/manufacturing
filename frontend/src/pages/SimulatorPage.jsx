import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useApi, postApi } from '../hooks/useApi'
import { getMachineShortLabel, getMachineDisplayLabel } from '../utils/machineNames'

const pageTransition = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.3 },
}

function impactColor(level) {
    switch (level) {
        case 'critical': return '#ff1744'
        case 'high': return '#ff6d00'
        case 'medium': return '#ffab00'
        case 'low': return '#00e676'
        default: return '#94a3b8'
    }
}

function riskColor(prob) {
    if (prob >= 0.7) return 'var(--color-critical)'
    if (prob >= 0.4) return 'var(--color-warning)'
    return 'var(--color-success)'
}

function formatCurrency(value) {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`
    return `$${value.toFixed(0)}`
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

    const blastRadius = result?.blast_radius
    const impactBreakdown = blastRadius?.impact_breakdown || {}

    return (
        <motion.div className="page-container" {...pageTransition}>
            <div className="page-header">
                <h1 className="page-title">Cascade Simulator</h1>
                <p className="page-subtitle">Simulate machine failures and visualize blast radius propagation</p>
            </div>

            <div className="grid-2">
                {/* Controls */}
                <div className="glass" style={{ padding: '28px' }}>
                    <h3 className="section-title">Simulation Controls</h3>

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
                                    setResult(null)
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
                                {simulating ? 'Simulating…' : 'Simulate Failure'}
                            </button>
                            {result && (
                                <button className="btn-secondary" onClick={handleReset}>
                                    Reset
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Blast Radius Metrics */}
                <div className="glass" style={{ padding: '28px' }}>
                    <h3 className="section-title">Failure Blast Radius</h3>

                    <AnimatePresence mode="wait">
                        {result ? (
                            <motion.div
                                key="blast-radius"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.3 }}
                            >
                                {/* 4-Metric Grid */}
                                <div className="blast-metrics-grid">
                                    <div className="blast-metric-card blast-metric-critical">
                                        <div className="blast-metric-value">{result.affected_count}</div>
                                        <div className="blast-metric-label">Machines Affected</div>
                                    </div>
                                    <div className="blast-metric-card blast-metric-depth">
                                        <div className="blast-metric-value">{result.max_cascade_depth}</div>
                                        <div className="blast-metric-label">Max Cascade Depth</div>
                                    </div>
                                    <div className="blast-metric-card blast-metric-downtime">
                                        <div className="blast-metric-value">{result.total_downtime_hours?.toFixed(1)}h</div>
                                        <div className="blast-metric-label">Est. Downtime</div>
                                    </div>
                                    <div className="blast-metric-card blast-metric-loss">
                                        <div className="blast-metric-value">
                                            {formatCurrency(blastRadius?.estimated_economic_loss || 0)}
                                        </div>
                                        <div className="blast-metric-label">Economic Loss</div>
                                    </div>
                                </div>

                                {/* Impact Breakdown Bar */}
                                <div className="blast-breakdown">
                                    <div className="blast-breakdown-header">
                                        <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Impact Distribution</span>
                                    </div>
                                    <div className="blast-breakdown-bar">
                                        {['critical', 'high', 'medium', 'low'].map(level => {
                                            const count = impactBreakdown[level] || 0
                                            const total = result.affected_count || 1
                                            const pct = (count / total) * 100
                                            if (pct === 0) return null
                                            return (
                                                <div
                                                    key={level}
                                                    className="blast-breakdown-segment"
                                                    style={{
                                                        width: `${pct}%`,
                                                        background: impactColor(level),
                                                    }}
                                                    title={`${level}: ${count} machines`}
                                                />
                                            )
                                        })}
                                    </div>
                                    <div className="blast-breakdown-legend">
                                        {['critical', 'high', 'medium', 'low'].map(level => (
                                            <span key={level} className="blast-legend-item">
                                                <span className="blast-legend-dot" style={{ background: impactColor(level) }} />
                                                {level.charAt(0).toUpperCase() + level.slice(1)}: {impactBreakdown[level] || 0}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                {/* Affected Lines */}
                                {blastRadius?.affected_lines?.length > 0 && (
                                    <div style={{ marginTop: '16px' }}>
                                        <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Affected Lines: </span>
                                        {blastRadius.affected_lines.map((line, i) => (
                                            <span key={i} className="blast-line-tag">{line}</span>
                                        ))}
                                    </div>
                                )}
                            </motion.div>
                        ) : (
                            <motion.div
                                key="empty"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-tertiary)' }}
                            >

                                <p style={{ fontSize: '15px' }}>Run a simulation to see the failure blast radius</p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Cascade Propagation Chain */}
            {result?.affected_machines?.length > 0 && (
                <motion.div
                    className="glass"
                    style={{ padding: '28px', marginTop: '24px' }}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    <h3 className="section-title">Cascade Propagation Chain</h3>
                    <div className="cascade-chain">
                        {/* Origin machine */}
                        <motion.div
                            className="cascade-node cascade-node-origin"
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.5, type: 'spring' }}
                        >
                            <div className="cascade-node-ripple" />
                            <div className="cascade-node-inner">
                                <span className="cascade-node-name">{getMachineShortLabel(result.origin_machine)}</span>
                                <span className="cascade-node-tag" style={{ background: '#ff174430', color: '#ff1744' }}>
                                    ORIGIN · {(result.origin_failure_prob * 100).toFixed(0)}%
                                </span>
                            </div>
                        </motion.div>

                        {/* Affected machines with staggered ripple */}
                        {result.affected_machines.map((m, i) => (
                            <motion.div
                                key={m.machine_id}
                                className={`cascade-node cascade-node-${m.impact_level}`}
                                initial={{ opacity: 0, x: -30 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.3 + i * 0.12, duration: 0.5, type: 'spring' }}
                            >
                                <div className="cascade-node-connector">
                                    <div className="cascade-connector-line" />
                                    <span className="cascade-depth-badge">D{m.depth}</span>
                                </div>
                                <div className="cascade-node-inner">
                                    <div className="cascade-node-header">
                                        <span className="cascade-node-name">{getMachineShortLabel(m.machine_id)}</span>
                                        <span
                                            className="cascade-impact-badge"
                                            style={{
                                                background: `${impactColor(m.impact_level)}20`,
                                                color: impactColor(m.impact_level),
                                                borderColor: impactColor(m.impact_level),
                                            }}
                                        >
                                            {m.impact_level.toUpperCase()}
                                        </span>
                                    </div>
                                    <div className="cascade-node-meta">
                                        <span>Risk: <strong style={{ color: impactColor(m.impact_level) }}>{(m.combined_risk * 100).toFixed(0)}%</strong></span>
                                        <span style={{ color: 'var(--color-text-tertiary)' }}>Impact: {(m.impact_score * 100).toFixed(1)}%</span>
                                    </div>
                                    <div className="cascade-risk-bar">
                                        <motion.div
                                            className="cascade-risk-bar-fill"
                                            style={{ background: impactColor(m.impact_level) }}
                                            initial={{ width: 0 }}
                                            animate={{ width: `${m.combined_risk * 100}%` }}
                                            transition={{ delay: 0.5 + i * 0.12, duration: 0.6 }}
                                        />
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            )}
        </motion.div>
    )
}
