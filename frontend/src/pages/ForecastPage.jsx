import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
    BarChart, Bar, CartesianGrid,
} from 'recharts'
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

const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
        <div style={{
            background: 'rgba(17,17,17,0.95)', backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px',
            padding: '10px 14px', fontSize: '12px',
        }}>
            <div style={{ color: '#86868B', marginBottom: '4px' }}>{label}</div>
            {payload.map((p, i) => (
                <div key={i} style={{ color: p.color, fontWeight: 600 }}>
                    {p.name}: {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
                </div>
            ))}
        </div>
    )
}

export default function ForecastPage() {
    const [horizon, setHorizon] = useState(24)
    const { graphData } = useFactory()
    const machines = graphData?.nodes || []

    // Build forecast trend data (memoized)
    const trendData = useMemo(() => buildTrendData(machines, horizon), [machines, horizon])
    const likelyFailures = useMemo(() =>
        machines
            .filter(m => m.failure_prob >= 0.5)
            .sort((a, b) => b.failure_prob - a.failure_prob)
            .slice(0, 8),
        [machines]
    )

    // Build bar chart data per production line (memoized)
    const lineRisks = useMemo(() => buildLineRisks(machines), [machines])

    return (
        <motion.div className="page-container" {...pageTransition}>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <h1 className="page-title">Risk Forecast</h1>
                    <p className="page-subtitle">Predictive failure timeline and risk projections</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {[6, 12, 24].map(h => (
                        <button
                            key={h}
                            className={horizon === h ? 'btn-primary' : 'btn-secondary'}
                            onClick={() => setHorizon(h)}
                            style={{ padding: '8px 16px', fontSize: '13px' }}
                        >
                            {h}h
                        </button>
                    ))}
                </div>
            </div>

            {/* Health Timeline Chart */}
            <div className="glass" style={{ padding: '24px', marginBottom: '24px' }}>
                <h3 className="section-title"> Projected Factory Health</h3>
                <div style={{ height: '280px', marginTop: '16px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                            <defs>
                                <linearGradient id="healthGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#0A84FF" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#0A84FF" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#FF453A" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#FF453A" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                            <XAxis dataKey="hour" stroke="#48484A" fontSize={11} />
                            <YAxis stroke="#48484A" fontSize={11} domain={[0, 100]} />
                            <Tooltip content={<CustomTooltip />} />
                            <Area type="monotone" dataKey="health" name="Health %" stroke="#0A84FF" fill="url(#healthGrad)" strokeWidth={2} />
                            <Area type="monotone" dataKey="risk" name="Risk %" stroke="#FF453A" fill="url(#riskGrad)" strokeWidth={2} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="grid-2">
                {/* Production Line Risk */}
                <div className="glass" style={{ padding: '24px' }}>
                    <h3 className="section-title"> Risk by Production Line</h3>
                    <div style={{ height: '250px', marginTop: '16px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={lineRisks} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis dataKey="line" stroke="#48484A" fontSize={11} />
                                <YAxis stroke="#48484A" fontSize={11} domain={[0, 100]} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar
                                    dataKey="risk" name="Avg Risk %" fill="#0A84FF" radius={[6, 6, 0, 0]}
                                    activeBar={{ fill: '#3DA0FF', stroke: 'none', filter: 'drop-shadow(0 0 8px rgba(10,132,255,0.5))' }}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Likely Failures */}
                <div className="glass" style={{ padding: '24px' }}>
                    <h3 className="section-title"> Predicted Failures ({horizon}h)</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                        {likelyFailures.length > 0 ? likelyFailures.map((m, i) => (
                            <motion.div
                                key={m.id}
                                className="machine-item"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.06 }}
                            >
                                <div className="machine-item-info">
                                    <span className="machine-item-name">{getMachineShortLabel(m.id)}</span>
                                    <span className="machine-item-line">{m.production_line}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div className="risk-bar">
                                        <div className="risk-bar-fill" style={{
                                            width: `${m.failure_prob * 100}%`,
                                            background: riskColor(m.failure_prob),
                                        }} />
                                    </div>
                                    <span style={{ fontSize: '14px', fontWeight: 600, color: riskColor(m.failure_prob) }}>
                                        {(m.failure_prob * 100).toFixed(0)}%
                                    </span>
                                </div>
                            </motion.div>
                        )) : (
                            <p style={{ fontSize: '14px', color: 'var(--color-text-tertiary)', padding: '20px 0', textAlign: 'center' }}>
                                No machines predicted to fail in the next {horizon} hours
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </motion.div>
    )
}

/** Build projected trend data */
function buildTrendData(machines, horizon) {
    const avgHealth = machines.length > 0
        ? machines.reduce((s, m) => s + (1 - m.failure_prob), 0) / machines.length * 100
        : 50
    const avgRisk = 100 - avgHealth
    const data = []

    for (let h = 0; h <= horizon; h++) {
        const drift = h / horizon
        data.push({
            hour: `${h}h`,
            health: Math.max(5, avgHealth - drift * 15 + (Math.sin(h * 0.5) * 3)),
            risk: Math.min(95, avgRisk + drift * 12 + (Math.cos(h * 0.7) * 2)),
        })
    }
    return data
}

/** Build per-line risk */
function buildLineRisks(machines) {
    const lines = {}
    machines.forEach(m => {
        const line = m.production_line || 'Unknown'
        if (!lines[line]) lines[line] = { total: 0, count: 0 }
        lines[line].total += m.failure_prob
        lines[line].count++
    })
    return Object.entries(lines).map(([line, v]) => ({
        line: line.replace('Production Line ', 'Line '),
        risk: parseFloat(((v.total / v.count) * 100).toFixed(1)),
    })).sort((a, b) => b.risk - a.risk)
}
