import { useCallback } from 'react'
import { motion } from 'framer-motion'
import { useFactory } from '../hooks/useFactory'
import { getMachineShortLabel } from '../utils/machineNames'
import DataSourceSelector from '../components/DataSourceSelector'

const pageTransition = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
    transition: { duration: 0.3, ease: 'easeOut' },
}

function riskColor(prob) {
    if (prob >= 0.7) return 'var(--color-critical)'
    if (prob >= 0.4) return 'var(--color-warning)'
    return 'var(--color-success)'
}

export default function OverviewPage() {
    const { riskSummary: risk, criticalMachines: critical, maintenance, loading: riskLoading, refetchAll } = useFactory()

    const handleDataChange = useCallback(() => {
        setTimeout(() => refetchAll(), 500)
    }, [refetchAll])

    if (riskLoading) {
        return (
            <div className="loading-screen">
                <div className="loading-spinner" />
                <p style={{ color: 'var(--color-text-secondary)' }}>Loading factory data…</p>
            </div>
        )
    }

    const health = risk ? (risk.avg_health_score * 100).toFixed(0) : '—'
    const riskLevel = risk?.factory_risk_level?.toUpperCase() || '—'
    const downtime = risk?.estimated_total_downtime_hours?.toFixed(1) || '—'
    const totalMachines = risk?.total_machines || 20
    const topMachines = critical?.critical_machines?.slice(0, 6) || []
    const topMaint = maintenance?.priorities?.slice(0, 5) || []

    return (
        <motion.div className="page-container" {...pageTransition}>
            <div className="page-header">
                <h1 className="page-title">Factory Overview</h1>
                <p className="page-subtitle">Real-time AI-powered reliability intelligence</p>
            </div>

            {/* Data Source Selector */}
            <DataSourceSelector onDataChange={handleDataChange} />

            {/* Metric Cards */}
            <div className="metrics-grid">
                <motion.div
                    className="glass metric-card"
                    whileHover={{ scale: 1.02 }}
                    transition={{ type: 'spring', stiffness: 400 }}
                >
                    <span className="metric-label">Factory Health</span>
                    <span className="metric-value" style={{ color: 'var(--color-success)' }}>{health}%</span>
                    <span className="metric-sub">Across {totalMachines} machines</span>
                </motion.div>

                <motion.div
                    className="glass metric-card"
                    whileHover={{ scale: 1.02 }}
                    transition={{ type: 'spring', stiffness: 400 }}
                >
                    <span className="metric-label">Risk Level</span>
                    <span className="metric-value" style={{ color: riskLevel === 'HIGH' ? 'var(--color-critical)' : riskLevel === 'MEDIUM' ? 'var(--color-warning)' : 'var(--color-success)' }}>
                        {riskLevel}
                    </span>
                    <span className="metric-sub">Overall factory assessment</span>
                </motion.div>

                <motion.div
                    className="glass metric-card"
                    whileHover={{ scale: 1.02 }}
                    transition={{ type: 'spring', stiffness: 400 }}
                >
                    <span className="metric-label">Est. Downtime</span>
                    <span className="metric-value" style={{ color: 'var(--color-warning)' }}>{downtime}h</span>
                    <span className="metric-sub">Predicted total if unaddressed</span>
                </motion.div>

                <motion.div
                    className="glass metric-card"
                    whileHover={{ scale: 1.02 }}
                    transition={{ type: 'spring', stiffness: 400 }}
                >
                    <span className="metric-label">Vulnerable Line</span>
                    <span className="metric-value" style={{ color: 'var(--color-critical)', fontSize: '24px' }}>
                        {risk?.most_vulnerable_line?.name || '—'}
                    </span>
                    <span className="metric-sub">
                        {risk?.most_vulnerable_line ? `${(risk.most_vulnerable_line.avg_failure_prob * 100).toFixed(0)}% avg failure risk` : '—'}
                    </span>
                </motion.div>
            </div>

            {/* Two-column layout */}
            <div className="grid-2">
                {/* Critical Machines */}
                <div className="glass" style={{ padding: '24px' }}>
                    <h3 className="section-title"> Critical Machines</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {topMachines.map((m, i) => (
                            <motion.div
                                key={m.id}
                                className="machine-item"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.08 }}
                            >
                                <div className="machine-item-info">
                                    <span className="machine-item-name">{getMachineShortLabel(m.id)}</span>
                                    <span className="machine-item-line">{m.production_line}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div className="risk-bar">
                                        <div
                                            className="risk-bar-fill"
                                            style={{
                                                width: `${m.failure_prob * 100}%`,
                                                background: riskColor(m.failure_prob),
                                            }}
                                        />
                                    </div>
                                    <span style={{
                                        fontSize: '14px', fontWeight: 600, minWidth: '40px', textAlign: 'right',
                                        color: riskColor(m.failure_prob),
                                    }}>
                                        {(m.failure_prob * 100).toFixed(0)}%
                                    </span>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* Maintenance Priorities */}
                <div className="glass" style={{ padding: '24px' }}>
                    <h3 className="section-title"> Maintenance Priorities</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {topMaint.map((m, i) => (
                            <motion.div
                                key={m.machine_id}
                                className="machine-item"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.08 }}
                            >
                                <div className="machine-item-info">
                                    <span className="machine-item-name">{getMachineShortLabel(m.machine_id)}</span>
                                    <span className="machine-item-line">{m.production_line}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span className={`badge ${m.urgency === 'immediate' ? 'badge-critical' : m.urgency === 'urgent' ? 'badge-warning' : 'badge-success'}`}>
                                        {m.urgency}
                                    </span>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>
        </motion.div>
    )
}
