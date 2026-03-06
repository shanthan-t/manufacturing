import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useFactory } from '../hooks/useFactory'

const API_BASE = 'http://localhost:8000/api'

const pageTransition = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.3 },
}

function riskColor(prob) {
    if (prob >= 0.7) return '#FF453A'
    if (prob >= 0.4) return '#FFD60A'
    return '#30D158'
}

function statusLabel(prob) {
    if (prob >= 0.8) return 'Critical'
    if (prob >= 0.5) return 'Degraded'
    if (prob >= 0.3) return 'Warning'
    return 'Healthy'
}

function statusClass(prob) {
    if (prob >= 0.8) return 'fm-status-critical'
    if (prob >= 0.5) return 'fm-status-degraded'
    if (prob >= 0.3) return 'fm-status-warning'
    return 'fm-status-healthy'
}

/* ── Level 1: Production Line Card ───────────────────────── */
function ProductionLineCard({ lineName, machines, isExpanded, onToggle }) {
    const avgHealth = machines.length > 0
        ? machines.reduce((s, m) => s + (1 - (m.failure_prob || 0)), 0) / machines.length
        : 1
    const criticalCount = machines.filter(m => (m.failure_prob || 0) >= 0.7).length
    const warningCount = machines.filter(m => (m.failure_prob || 0) >= 0.3 && (m.failure_prob || 0) < 0.7).length
    const healthyCount = machines.length - criticalCount - warningCount
    const avgPct = (avgHealth * 100).toFixed(0)
    const color = riskColor(1 - avgHealth)

    return (
        <div
            className={`fm-line-card ${isExpanded ? 'fm-line-card-active' : ''}`}
            onClick={onToggle}
        >
            <div className="fm-lc-top">
                <div className="fm-lc-name">{lineName}</div>
                <div className="fm-lc-health" style={{ color }}>{avgPct}%</div>
            </div>

            <div className="fm-lc-bar">
                <div className="fm-lc-bar-fill" style={{ width: `${avgPct}%`, background: color }} />
            </div>

            <div className="fm-lc-stats">
                <span className="fm-lc-stat">{machines.length} machines</span>
                {criticalCount > 0 && <span className="fm-lc-stat fm-lc-stat-critical">{criticalCount} critical</span>}
                {warningCount > 0 && <span className="fm-lc-stat fm-lc-stat-warning">{warningCount} warning</span>}
                {healthyCount > 0 && <span className="fm-lc-stat fm-lc-stat-healthy">{healthyCount} healthy</span>}
            </div>

            <div className="fm-lc-expand-hint">
                {isExpanded ? 'Click to collapse' : 'Click to expand'}
            </div>
        </div>
    )
}

/* ── Level 2: Machine Card ───────────────────────────────── */
function MachineCard({ machine, isSelected, onClick }) {
    const healthPct = ((1 - (machine.failure_prob || 0)) * 100).toFixed(0)
    const color = riskColor(machine.failure_prob || 0)

    return (
        <div
            className={`fm-machine-card ${isSelected ? 'fm-card-selected' : ''}`}
            style={{ '--risk-color': color }}
            onClick={() => onClick(machine)}
            data-machine-id={machine.id}
        >
            <div className="fm-card-header">
                <span className={`fm-card-status-dot ${statusClass(machine.failure_prob || 0)}`} />
                <span className="fm-card-id">{machine.id}</span>
            </div>
            <div className="fm-card-type">{machine.machine_type || '—'}</div>
            <div className="fm-card-health-bar">
                <div className="fm-card-health-fill" style={{ width: `${healthPct}%`, background: color }} />
            </div>
            <div className="fm-card-health-label" style={{ color }}>{healthPct}%</div>
        </div>
    )
}

/* ── Flow Arrow ──────────────────────────────────────────── */
function FlowArrow() {
    return (
        <div className="fm-flow-arrow">
            <svg width="28" height="14" viewBox="0 0 28 14">
                <line x1="0" y1="7" x2="20" y2="7" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
                <polygon points="20,2 28,7 20,12" fill="rgba(255,255,255,0.12)" />
            </svg>
        </div>
    )
}

/* ── Level 2: Expanded Machine List (virtualized windowing) ── */
function MachineFlowPanel({ lineName, machines, selectedId, onMachineClick, onClose }) {
    const BATCH_SIZE = 50
    const [visibleCount, setVisibleCount] = useState(BATCH_SIZE)
    const scrollRef = useRef(null)

    // Reset visible count when line changes
    useEffect(() => { setVisibleCount(BATCH_SIZE) }, [lineName])

    // Load more on scroll
    const handleScroll = useCallback(() => {
        const el = scrollRef.current
        if (!el) return
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
            setVisibleCount(prev => Math.min(prev + BATCH_SIZE, machines.length))
        }
    }, [machines.length])

    const visibleMachines = machines.slice(0, visibleCount)

    return (
        <motion.div
            className="fm-machine-panel"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
        >
            <div className="fm-mp-header">
                <div className="fm-mp-header-left">
                    <button className="fm-mp-back" onClick={onClose}>← Back</button>
                    <h3 className="fm-mp-title">{lineName}</h3>
                    <span className="fm-mp-count">{machines.length} machines</span>
                </div>
            </div>

            <div className="fm-mp-scroll" ref={scrollRef} onScroll={handleScroll}>
                <div className="fm-flow-track">
                    {visibleMachines.map((machine, i) => (
                        <div key={machine.id} className="fm-flow-item">
                            <MachineCard
                                machine={machine}
                                isSelected={machine.id === selectedId}
                                onClick={onMachineClick}
                            />
                            {i < visibleMachines.length - 1 && <FlowArrow />}
                        </div>
                    ))}
                </div>
                {visibleCount < machines.length && (
                    <div className="fm-load-more">
                        Showing {visibleCount} of {machines.length} — scroll for more
                    </div>
                )}
            </div>
        </motion.div>
    )
}

/* ── Level 3: Detail Panel ───────────────────────────────── */
function DetailPanel({ machine, onClose }) {
    const [sensorData, setSensorData] = useState(null)

    useEffect(() => {
        if (!machine) return
        fetch(`${API_BASE}/machines/${machine.id}`)
            .then(r => r.json())
            .then(d => setSensorData(d))
            .catch(() => setSensorData(null))
    }, [machine?.id])

    if (!machine) return null
    const healthPct = ((1 - (machine.failure_prob || 0)) * 100).toFixed(1)
    const color = riskColor(machine.failure_prob || 0)
    const sensorHistory = sensorData?.sensor_history || []
    const lastReading = sensorHistory.length > 0 ? sensorHistory[sensorHistory.length - 1] : null
    const sensorKeys = lastReading ? Object.keys(lastReading).filter(k => k.startsWith('sensor_')).slice(0, 8) : []

    return (
        <motion.div
            className="fm-detail-panel"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
            transition={{ duration: 0.2 }}
        >
            <div className="fm-detail-header">
                <div>
                    <h3 className="fm-detail-title">{machine.id}</h3>
                    <span className="fm-detail-subtitle">{machine.machine_type}</span>
                </div>
                <button className="fm-detail-close" onClick={onClose}>✕</button>
            </div>

            <div className="fm-detail-health-ring">
                <svg viewBox="0 0 80 80" className="fm-ring-svg">
                    <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
                    <circle
                        cx="40" cy="40" r="34" fill="none" stroke={color} strokeWidth="6"
                        strokeDasharray={`${(1 - (machine.failure_prob || 0)) * 213.6} 213.6`}
                        strokeLinecap="round"
                        transform="rotate(-90 40 40)"
                        style={{ transition: 'stroke-dasharray 0.6s ease' }}
                    />
                </svg>
                <div className="fm-ring-label">
                    <span className="fm-ring-pct" style={{ color }}>{healthPct}%</span>
                    <span className="fm-ring-sub">Health</span>
                </div>
            </div>

            <div className="fm-detail-rows">
                <DetailRow label="Machine ID" value={machine.id} />
                <DetailRow label="Production Line" value={machine.production_line} />
                <DetailRow label="Machine Type" value={machine.machine_type || '—'} />
                <DetailRow label="Health Score" value={`${healthPct}%`} valueColor={color} />
                <DetailRow label="Failure Risk" value={`${((machine.failure_prob || 0) * 100).toFixed(1)}%`} valueColor={color} />
                <DetailRow label="Status" value={statusLabel(machine.failure_prob || 0)} valueColor={color} />
                <DetailRow label="Predicted RUL" value={machine.predicted_rul ? `${machine.predicted_rul} cycles` : '—'} />
            </div>

            {sensorKeys.length > 0 && (
                <div className="fm-detail-sensors">
                    <h4 className="fm-detail-section-title">Latest Sensor Readings</h4>
                    <div className="fm-sensor-grid">
                        {sensorKeys.map(key => (
                            <div key={key} className="fm-sensor-item">
                                <span className="fm-sensor-label">{key.replace('sensor_', 'S')}</span>
                                <span className="fm-sensor-value">{lastReading[key].toFixed(2)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </motion.div>
    )
}

function DetailRow({ label, value, valueColor }) {
    return (
        <div className="fm-detail-row">
            <span className="fm-detail-row-label">{label}</span>
            <span className="fm-detail-row-value" style={valueColor ? { color: valueColor } : undefined}>{value}</span>
        </div>
    )
}

/* ── Filter Bar ──────────────────────────────────────────── */
function FilterBar({ statusFilter, setStatusFilter, lineFilter, setLineFilter, searchQuery, setSearchQuery, lines, totalMachines, expandedLine }) {
    const statuses = ['All', 'Critical', 'Warning', 'Healthy']

    return (
        <div className="fm-filter-bar">
            <div className="fm-search-box">
                <svg className="fm-search-icon" viewBox="0 0 20 20" width="16" height="16">
                    <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
                    <line x1="12.5" y1="12.5" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <input
                    type="text"
                    className="fm-search-input"
                    placeholder={expandedLine ? `Search in ${expandedLine}…` : 'Search machines…'}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                    <button className="fm-search-clear" onClick={() => setSearchQuery('')}>✕</button>
                )}
            </div>

            <div className="fm-filter-group">
                <span className="fm-filter-label">Status</span>
                <div className="fm-filter-pills">
                    {statuses.map(s => (
                        <button
                            key={s}
                            className={`fm-filter-pill ${statusFilter === s ? 'fm-pill-active' : ''}`}
                            onClick={() => setStatusFilter(s)}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            </div>

            {!expandedLine && (
                <div className="fm-filter-group">
                    <span className="fm-filter-label">Line</span>
                    <select
                        className="fm-filter-select"
                        value={lineFilter}
                        onChange={e => setLineFilter(e.target.value)}
                    >
                        <option value="All">All Lines</option>
                        {lines.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                </div>
            )}
        </div>
    )
}

/* ── Main Page ───────────────────────────────────────────── */
export default function FactoryMapPage() {
    const { graphData, loading } = useFactory()
    const [selected, setSelected] = useState(null)
    const [expandedLine, setExpandedLine] = useState(null)
    const [statusFilter, setStatusFilter] = useState('All')
    const [lineFilter, setLineFilter] = useState('All')
    const [searchQuery, setSearchQuery] = useState('')

    // Group machines by production line
    const { lineGroups, allLines } = useMemo(() => {
        if (!graphData?.nodes) return { lineGroups: {}, allLines: [] }
        const groups = {}
        graphData.nodes.forEach(n => {
            const line = n.production_line || 'Unknown'
            if (!groups[line]) groups[line] = []
            groups[line].push(n)
        })
        Object.values(groups).forEach(arr =>
            arr.sort((a, b) => (a.position_in_line || 0) - (b.position_in_line || 0))
        )
        return { lineGroups: groups, allLines: Object.keys(groups).sort() }
    }, [graphData])

    // Filter production lines for Level 1
    const filteredLineCards = useMemo(() => {
        let lines = allLines
        if (lineFilter !== 'All') lines = lines.filter(l => l === lineFilter)

        if (searchQuery.trim() && !expandedLine) {
            const q = searchQuery.toLowerCase()
            lines = lines.filter(l => {
                if (l.toLowerCase().includes(q)) return true
                // Check if any machine in this line matches
                return (lineGroups[l] || []).some(m =>
                    m.id.toLowerCase().includes(q) ||
                    (m.machine_type || '').toLowerCase().includes(q)
                )
            })
        }

        // Apply status filter to line visibility
        if (statusFilter !== 'All') {
            lines = lines.filter(l => {
                const machines = lineGroups[l] || []
                if (statusFilter === 'Critical') return machines.some(m => (m.failure_prob || 0) >= 0.7)
                if (statusFilter === 'Warning') return machines.some(m => (m.failure_prob || 0) >= 0.3 && (m.failure_prob || 0) < 0.7)
                if (statusFilter === 'Healthy') return machines.some(m => (m.failure_prob || 0) < 0.3)
                return true
            })
        }

        return lines
    }, [allLines, lineFilter, searchQuery, expandedLine, statusFilter, lineGroups])

    // Filter machines within expanded line
    const expandedMachines = useMemo(() => {
        if (!expandedLine) return []
        let machines = lineGroups[expandedLine] || []

        if (statusFilter === 'Critical') machines = machines.filter(m => (m.failure_prob || 0) >= 0.7)
        else if (statusFilter === 'Warning') machines = machines.filter(m => (m.failure_prob || 0) >= 0.3 && (m.failure_prob || 0) < 0.7)
        else if (statusFilter === 'Healthy') machines = machines.filter(m => (m.failure_prob || 0) < 0.3)

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase()
            machines = machines.filter(m =>
                m.id.toLowerCase().includes(q) ||
                (m.machine_type || '').toLowerCase().includes(q)
            )
        }

        return machines
    }, [expandedLine, lineGroups, statusFilter, searchQuery])

    const handleLineToggle = useCallback((lineName) => {
        setExpandedLine(prev => prev === lineName ? null : lineName)
        setSelected(null)
    }, [])

    const handleMachineClick = useCallback((machine) => {
        setSelected(prev => prev?.id === machine.id ? null : machine)
    }, [])

    const totalMachines = graphData?.nodes?.length || 0
    const criticalTotal = (graphData?.nodes || []).filter(m => (m.failure_prob || 0) >= 0.7).length

    if (loading) {
        return (
            <div className="loading-screen">
                <div className="loading-spinner" />
                <p style={{ color: 'var(--color-text-secondary)' }}>Loading factory map…</p>
            </div>
        )
    }

    return (
        <motion.div className="page-container" {...pageTransition}>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Factory Map</h1>
                    <p className="page-subtitle">
                        {totalMachines} machines · {allLines.length} production lines
                        {criticalTotal > 0 && <span className="fm-header-critical"> · {criticalTotal} critical</span>}
                    </p>
                </div>
            </div>

            <FilterBar
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                lineFilter={lineFilter}
                setLineFilter={setLineFilter}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                lines={allLines}
                totalMachines={totalMachines}
                expandedLine={expandedLine}
            />

            <div className="fm-layout">
                <div className="fm-main-area">
                    <AnimatePresence mode="wait">
                        {/* Level 1: Production Line Overview */}
                        {!expandedLine && (
                            <motion.div
                                key="lines"
                                className="fm-lines-grid"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                            >
                                {filteredLineCards.length === 0 ? (
                                    <div className="fm-empty-state">
                                        <span className="fm-empty-icon">🔍</span>
                                        <p>No production lines match your filters</p>
                                        <button className="fm-empty-reset" onClick={() => { setStatusFilter('All'); setLineFilter('All'); setSearchQuery('') }}>
                                            Reset Filters
                                        </button>
                                    </div>
                                ) : (
                                    filteredLineCards.map(line => (
                                        <ProductionLineCard
                                            key={line}
                                            lineName={line}
                                            machines={lineGroups[line] || []}
                                            isExpanded={false}
                                            onToggle={() => handleLineToggle(line)}
                                        />
                                    ))
                                )}
                            </motion.div>
                        )}

                        {/* Level 2: Machines in selected production line */}
                        {expandedLine && (
                            <MachineFlowPanel
                                key={`machines-${expandedLine}`}
                                lineName={expandedLine}
                                machines={expandedMachines}
                                selectedId={selected?.id}
                                onMachineClick={handleMachineClick}
                                onClose={() => { setExpandedLine(null); setSelected(null) }}
                            />
                        )}
                    </AnimatePresence>
                </div>

                {/* Level 3: Detail Panel */}
                <AnimatePresence>
                    {selected && (
                        <DetailPanel
                            machine={selected}
                            onClose={() => setSelected(null)}
                        />
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    )
}
