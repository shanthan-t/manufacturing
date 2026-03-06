import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useApi, postApi } from '../hooks/useApi'
import { getMachineShortLabel, getMachineDisplayLabel } from '../utils/machineNames'

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

export default function SimulatorWidget() {
    const { data: graphData } = useApi('/graph')
    const machines = graphData?.nodes || []

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
            setSelectedId('')
        } catch (err) {
            console.error('Reset failed:', err)
        }
    }, [])

    const blastRadius = result?.blast_radius
    const impactBreakdown = blastRadius?.impact_breakdown || {}

    return (
        <div className="glass" style={{ padding: '24px', marginTop: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                    <h3 className="section-title" style={{ margin: 0 }}>💥 Blast Radius Simulator</h3>
                    <p style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', margin: '4px 0 0 0' }}>
                        Simulate failure propagation across the factory floor
                    </p>
                </div>
            </div>

            <div className="grid-2">
                {/* Controls Column */}
                <div>
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ fontSize: '11px', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '6px' }}>
                                TARGET MACHINE
                            </label>
                            <select
                                className="sim-select"
                                style={{ padding: '8px 12px', fontSize: '13px' }}
                                value={selectedId}
                                onChange={e => {
                                    setSelectedId(e.target.value)
                                    setResult(null)
                                }}
                            >
                                <option value="">Select a machine…</option>
                                {sortedLines.map(line => (
                                    <optgroup key={line} label={line}>
                                        {machinesByLine[line].map(m => (
                                            <option key={m.id} value={m.id}>{getMachineDisplayLabel(m.id)}</option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                <label style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>INTENSITY</label>
                                <span style={{ fontSize: '11px', color: 'var(--color-primary)' }}>{(failureProb * 100).toFixed(0)}%</span>
                            </div>
                            <div style={{ padding: '8px 0' }}>
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
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            className="btn-primary"
                            style={{ flex: 1, padding: '8px 16px', fontSize: '13px' }}
                            onClick={handleSimulate}
                            disabled={!selectedId || simulating}
                        >
                            {simulating ? 'Simulating…' : 'Simulate'}
                        </button>
                        {result && (
                            <button
                                className="btn-secondary"
                                style={{ padding: '8px 16px', fontSize: '13px' }}
                                onClick={handleReset}
                            >
                                Reset
                            </button>
                        )}
                    </div>
                </div>

                {/* Results Column */}
                <div>
                    <AnimatePresence mode="wait">
                        {result ? (
                            <motion.div
                                key="blast-radius"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.3 }}
                            >
                                <div className="blast-metrics-grid" style={{ marginTop: 0, gap: '8px' }}>
                                    <div className="blast-metric-card blast-metric-critical" style={{ padding: '12px 10px' }}>
                                        <div className="blast-metric-value" style={{ fontSize: '20px' }}>{result.affected_count}</div>
                                        <div className="blast-metric-label" style={{ fontSize: '9px' }}>Affected</div>
                                    </div>
                                    <div className="blast-metric-card blast-metric-depth" style={{ padding: '12px 10px' }}>
                                        <div className="blast-metric-value" style={{ fontSize: '20px' }}>{result.max_cascade_depth}</div>
                                        <div className="blast-metric-label" style={{ fontSize: '9px' }}>Cascade Depth</div>
                                    </div>
                                    <div className="blast-metric-card blast-metric-downtime" style={{ padding: '12px 10px' }}>
                                        <div className="blast-metric-value" style={{ fontSize: '20px' }}>{result.total_downtime_hours?.toFixed(1)}h</div>
                                        <div className="blast-metric-label" style={{ fontSize: '9px' }}>Est. Downtime</div>
                                    </div>
                                    <div className="blast-metric-card blast-metric-loss" style={{ padding: '12px 10px' }}>
                                        <div className="blast-metric-value" style={{ fontSize: '20px' }}>
                                            {formatCurrency(blastRadius?.estimated_economic_loss || 0)}
                                        </div>
                                        <div className="blast-metric-label" style={{ fontSize: '9px' }}>Econ Loss</div>
                                    </div>
                                </div>
                            </motion.div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-tertiary)', fontSize: '13px', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '12px' }}>
                                Awaiting simulation...
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Cascade Propagation Chain */}
            {result?.affected_machines?.length > 0 && (
                <motion.div
                    style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--color-border)' }}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                >
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Propagation Path
                    </div>
                    <div className="cascade-chain" style={{ padding: 0, gap: '8px' }}>
                        <motion.div className="cascade-node cascade-node-origin" style={{ minWidth: '130px' }}>
                            <div className="cascade-node-ripple" style={{ animationDuration: '3s' }} />
                            <div className="cascade-node-inner" style={{ padding: '8px 12px' }}>
                                <span className="cascade-node-name" style={{ fontSize: '12px' }}>{getMachineShortLabel(result.origin_machine)}</span>
                                <span className="cascade-node-tag" style={{ background: '#ff174430', color: '#ff1744', fontSize: '9px', padding: '1px 6px', marginTop: '4px' }}>
                                    ORIGIN
                                </span>
                            </div>
                        </motion.div>

                        {result.affected_machines.slice(0, 5).map((m, i) => (
                            <motion.div
                                key={m.machine_id}
                                className={`cascade-node cascade-node-${m.impact_level}`}
                                style={{ minWidth: '130px' }}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.1 * i }}
                            >
                                <div className="cascade-node-connector" style={{ marginBottom: '4px' }}>
                                    <div className="cascade-connector-line" style={{ width: '16px' }} />
                                    <span className="cascade-depth-badge" style={{ fontSize: '9px', padding: '1px 4px' }}>D{m.depth}</span>
                                </div>
                                <div className="cascade-node-inner" style={{ padding: '8px 12px' }}>
                                    <div className="cascade-node-header" style={{ marginBottom: '2px' }}>
                                        <span className="cascade-node-name" style={{ fontSize: '12px' }}>{getMachineShortLabel(m.machine_id)}</span>
                                    </div>
                                    <div className="cascade-node-meta" style={{ fontSize: '10px', marginBottom: '4px' }}>
                                        <span style={{ color: impactColor(m.impact_level) }}>{(m.impact_score * 100).toFixed(0)}% impact</span>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                        {result.affected_machines.length > 5 && (
                            <div style={{ display: 'flex', alignItems: 'center', color: 'var(--color-text-tertiary)', fontSize: '11px', paddingLeft: '8px' }}>
                                +{result.affected_machines.length - 5} more
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
        </div>
    )
}
