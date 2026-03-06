import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useFactory } from '../hooks/useFactory'
import { getMachineShortLabel } from '../utils/machineNames'

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

export default function MaintenancePage() {
    const { maintenance: priorities, loading } = useFactory()

    if (loading) {
        return (
            <div className="loading-screen">
                <div className="loading-spinner" />
                <p style={{ color: 'var(--color-text-secondary)' }}>Loading maintenance data…</p>
            </div>
        )
    }

    const items = priorities?.priorities || []
    const immediate = items.filter(m => m.urgency === 'immediate')
    const urgent = items.filter(m => m.urgency === 'urgent')
    const scheduled = items.filter(m => m.urgency === 'scheduled')

    return (
        <motion.div className="page-container" {...pageTransition}>
            <div className="page-header">
                <h1 className="page-title">Maintenance Priorities</h1>
                <p className="page-subtitle">AI-ranked repair schedule based on failure risk and cascade impact</p>
            </div>

            {/* Summary Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '32px' }}>
                <div className="glass metric-card" style={{ borderLeft: '3px solid var(--color-critical)' }}>
                    <span className="metric-label">Immediate</span>
                    <span className="metric-value" style={{ color: 'var(--color-critical)' }}>{immediate.length}</span>
                    <span className="metric-sub">Requires shutdown and inspection</span>
                </div>
                <div className="glass metric-card" style={{ borderLeft: '3px solid var(--color-warning)' }}>
                    <span className="metric-label">Urgent</span>
                    <span className="metric-value" style={{ color: 'var(--color-warning)' }}>{urgent.length}</span>
                    <span className="metric-sub">Schedule within 24 hours</span>
                </div>
                <div className="glass metric-card" style={{ borderLeft: '3px solid var(--color-success)' }}>
                    <span className="metric-label">Scheduled</span>
                    <span className="metric-value" style={{ color: 'var(--color-success)' }}>{scheduled.length}</span>
                    <span className="metric-sub">Plan for next maintenance window</span>
                </div>
            </div>

            {/* Priority Sections */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {immediate.length > 0 && (
                    <PrioritySection title=" Immediate Action" items={immediate} />
                )}
                {urgent.length > 0 && (
                    <PrioritySection title=" Urgent" items={urgent} />
                )}
                {scheduled.length > 0 && (
                    <PrioritySection title=" Scheduled" items={scheduled} />
                )}
            </div>
        </motion.div>
    )
}

function PrioritySection({ title, items }) {
    return (
        <div className="glass" style={{ padding: '24px' }}>
            <h3 className="section-title">{title}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {items.map((m, i) => (
                    <motion.div
                        key={m.machine_id}
                        className="machine-item"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06 }}
                        style={{ padding: '16px 20px' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
                            <div style={{
                                width: '40px', height: '40px', borderRadius: '10px',
                                background: `${riskColor(m.failure_prob)}20`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '18px',
                            }}>
                                {m.urgency === 'immediate' ? '' : m.urgency === 'urgent' ? '' : ''}
                            </div>
                            <div className="machine-item-info">
                                <span className="machine-item-name">{getMachineShortLabel(m.machine_id)}</span>
                                <span className="machine-item-line">{m.production_line}</span>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                            {/* Priority Score */}
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '16px', fontWeight: 700, color: riskColor(m.failure_prob) }}>
                                    {m.priority_score?.toFixed(2)}
                                </div>
                                <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>Score</div>
                            </div>

                            {/* Prevented Downtime */}
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-primary)' }}>
                                    {m.prevented_downtime_hours?.toFixed(1)}h
                                </div>
                                <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>Saved</div>
                            </div>

                            {/* Risk Bar */}
                            <div style={{ width: '80px' }}>
                                <div className="risk-bar">
                                    <div className="risk-bar-fill" style={{
                                        width: `${m.failure_prob * 100}%`,
                                        background: riskColor(m.failure_prob),
                                    }} />
                                </div>
                            </div>

                            <span className={`badge ${m.urgency === 'immediate' ? 'badge-critical' : m.urgency === 'urgent' ? 'badge-warning' : 'badge-success'}`}>
                                {m.urgency}
                            </span>
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    )
}
