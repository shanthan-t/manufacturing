import { motion, useInView } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useCallback, useRef, useState, useEffect } from 'react'

/* ── Animated counter hook ────────────────────────────────────── */
function useCountUp(target, duration = 2000, startOnView = true) {
    const [count, setCount] = useState(0)
    const ref = useRef(null)
    const inView = useInView(ref, { once: true, margin: '-50px' })
    const started = useRef(false)

    useEffect(() => {
        if (startOnView && !inView) return
        if (started.current) return
        started.current = true
        const start = performance.now()
        const tick = (now) => {
            const elapsed = now - start
            const progress = Math.min(elapsed / duration, 1)
            // ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3)
            setCount(Math.floor(eased * target))
            if (progress < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
    }, [inView, target, duration, startOnView])

    return [count, ref]
}

/* ── Floating particle background ─────────────────────────────── */
function Particles() {
    return (
        <div className="landing-particles">
            {Array.from({ length: 20 }).map((_, i) => (
                <motion.div
                    key={i}
                    className="landing-particle"
                    initial={{ opacity: 0 }}
                    animate={{
                        opacity: [0, 0.4, 0],
                        y: [0, -120 - Math.random() * 200],
                        x: [0, (Math.random() - 0.5) * 100],
                    }}
                    transition={{
                        duration: 6 + Math.random() * 6,
                        repeat: Infinity,
                        delay: Math.random() * 8,
                        ease: 'easeInOut',
                    }}
                    style={{
                        left: `${5 + Math.random() * 90}%`,
                        bottom: `${Math.random() * 30}%`,
                        width: `${2 + Math.random() * 3}px`,
                        height: `${2 + Math.random() * 3}px`,
                    }}
                />
            ))}
        </div>
    )
}

/* ── Feature cards ────────────────────────────────────────────── */
const features = [
    { icon: '', title: 'Predictive Maintenance', desc: 'Detect machine degradation using sensor signals and estimate failure probability before breakdowns occur.' },
    { icon: '', title: 'Factory Digital Twin', desc: 'Visualize machine dependencies across production lines using an interactive network map.' },
    { icon: '', title: 'Cascade Failure Simulation', desc: 'Simulate how machine failures propagate through factory systems and quantify economic impact.' },
    { icon: '', title: 'AI Root Cause Analysis', desc: 'Explain why machines are predicted to fail using sensor anomaly detection and AI reasoning.' },
]

function FeatureCard({ icon, title, desc, index }) {
    const lightRef = useRef(null)
    const handleMouseMove = useCallback((e) => {
        if (!lightRef.current) return
        const rect = e.currentTarget.getBoundingClientRect()
        lightRef.current.style.background =
            `radial-gradient(300px circle at ${e.clientX - rect.left}px ${e.clientY - rect.top}px, rgba(255,255,255,0.07), transparent 60%)`
    }, [])

    return (
        <motion.div
            className="landing-feature-card"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ delay: index * 0.12, duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
            whileHover={{ y: -8, transition: { duration: 0.3 } }}
            onMouseMove={handleMouseMove}
            onMouseEnter={() => { if (lightRef.current) lightRef.current.style.opacity = '1' }}
            onMouseLeave={() => { if (lightRef.current) lightRef.current.style.opacity = '0' }}
        >
            <div ref={lightRef} style={{
                position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0,
                transition: 'opacity 0.3s ease', borderRadius: 'inherit',
            }} />
            <motion.div
                className="landing-feature-icon"
                whileHover={{ scale: 1.15, rotate: 5 }}
                transition={{ type: 'spring', stiffness: 300 }}
            >
                {icon}
            </motion.div>
            <div className="landing-feature-title">{title}</div>
            <div className="landing-feature-desc">{desc}</div>
        </motion.div>
    )
}

/* ── Stats section ────────────────────────────────────────────── */
function StatsSection() {
    const stats = [
        { value: 20, suffix: '+', label: 'Machines Monitored' },
        { value: 99, suffix: '%', label: 'Prediction Accuracy' },
        { value: 4, suffix: '', label: 'Production Lines' },
        { value: 24, suffix: '/7', label: 'Real-time Monitoring' },
    ]

    return (
        <div className="landing-stats">
            {stats.map((s, i) => {
                const [count, ref] = useCountUp(s.value, 1800)
                return (
                    <motion.div
                        key={s.label}
                        ref={ref}
                        className="landing-stat-item"
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.1, duration: 0.5 }}
                    >
                        <span className="landing-stat-value">{count}{s.suffix}</span>
                        <span className="landing-stat-label">{s.label}</span>
                    </motion.div>
                )
            })}
        </div>
    )
}

/* ── About section ────────────────────────────────────────────── */
function AboutSection() {
    const steps = [
        { num: '01', title: 'Ingest Sensor Data', desc: 'Vortex connects to your factory sensor feeds — vibration, temperature, pressure, voltage — and continuously collects machine health signals.' },
        { num: '02', title: 'AI-Powered Analysis', desc: 'Machine learning models analyze multi-dimensional sensor patterns to detect anomalies and predict remaining useful life for each machine.' },
        { num: '03', title: 'Cascade Simulation', desc: 'Our dependency graph engine maps how failures propagate across interconnected production line machines, quantifying blast radius and economic exposure.' },
        { num: '04', title: 'Actionable Intelligence', desc: 'Receive AI-ranked maintenance priorities, root cause explanations, and optimized repair schedules — all before costly downtime strikes.' },
    ]

    return (
        <section className="landing-about">
            <motion.div
                className="landing-about-header"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.6 }}
            >
                <span className="landing-section-badge">How It Works</span>
                <h2 className="landing-about-title">From Sensor Data to <br />Predictive Intelligence</h2>
                <p className="landing-about-subtitle">
                    Vortex transforms raw machine telemetry into actionable maintenance decisions using a four-stage AI pipeline.
                </p>
            </motion.div>

            <div className="landing-about-steps">
                {steps.map((step, i) => (
                    <motion.div
                        key={step.num}
                        className="landing-about-step"
                        initial={{ opacity: 0, x: i % 2 === 0 ? -40 : 40 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true, margin: '-40px' }}
                        transition={{ delay: i * 0.15, duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
                    >
                        <div className="landing-step-num">{step.num}</div>
                        <div className="landing-step-content">
                            <h3 className="landing-step-title">{step.title}</h3>
                            <p className="landing-step-desc">{step.desc}</p>
                        </div>
                    </motion.div>
                ))}
            </div>
        </section>
    )
}

/* ── Tech stack showcase ──────────────────────────────────────── */
function TechSection() {
    const techs = ['Machine Learning', 'Graph Networks', 'Real-time Sensors', 'FastAPI', 'React', 'Digital Twin']
    return (
        <motion.div
            className="landing-tech"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
        >
            <span className="landing-tech-label">Powered by</span>
            <div className="landing-tech-pills">
                {techs.map((t, i) => (
                    <motion.span
                        key={t}
                        className="landing-tech-pill"
                        initial={{ opacity: 0, scale: 0.8 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.08, duration: 0.4 }}
                        whileHover={{ scale: 1.08, borderColor: 'rgba(59,130,246,0.4)' }}
                    >
                        {t}
                    </motion.span>
                ))}
            </div>
        </motion.div>
    )
}

/* ── Main Landing Page ────────────────────────────────────────── */
export default function LandingPage() {
    return (
        <div className="landing-page">
            {/* Background effects */}
            <div className="landing-bg-glow landing-bg-glow-1" />
            <div className="landing-bg-glow landing-bg-glow-2" />
            <Particles />

            {/* ─── Hero ─────────────────────────────────────── */}
            <div className="landing-hero">
                <motion.div
                    className="landing-badge"
                    initial={{ opacity: 0, y: -15, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ delay: 0.1, duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
                >
                    AI-Powered Industrial Intelligence
                </motion.div>

                <motion.h1
                    className="landing-title"
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
                >
                    Vortex
                </motion.h1>

                <motion.p
                    className="landing-subtitle"
                    initial={{ opacity: 0, y: 25 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.6 }}
                >
                    AI-Powered Predictive Maintenance and<br />Factory Intelligence Platform
                </motion.p>

                <motion.p
                    className="landing-desc"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4, duration: 0.6 }}
                >
                    Vortex analyzes machine sensor data to predict failures, simulate cascade
                    impacts across production lines, and provide AI-driven maintenance insights
                    before costly downtime occurs.
                </motion.p>

                <motion.div
                    className="landing-cta-group"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 0.5 }}
                >
                    <Link to="/dashboard" className="landing-cta">
                        View Dashboard
                        <span style={{ fontSize: '18px' }}>→</span>
                    </Link>
                    <a href="#about" className="landing-cta-secondary">
                        Learn More ↓
                    </a>
                </motion.div>

                {/* Scroll indicator */}
                <motion.div
                    className="landing-scroll-hint"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.2, duration: 0.8 }}
                >
                    <motion.div
                        className="landing-scroll-dot"
                        animate={{ y: [0, 8, 0] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                    />
                </motion.div>
            </div>

            {/* ─── Stats ────────────────────────────────────── */}
            <StatsSection />

            {/* ─── Features ─────────────────────────────────── */}
            <section className="landing-features-section">
                <motion.div
                    className="landing-section-header"
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-60px' }}
                    transition={{ duration: 0.6 }}
                >
                    <span className="landing-section-badge">Core Capabilities</span>
                    <h2 className="landing-section-title">Enterprise-Grade Factory Intelligence</h2>
                </motion.div>
                <div className="landing-features">
                    {features.map((f, i) => (
                        <FeatureCard key={f.title} {...f} index={i} />
                    ))}
                </div>
            </section>

            {/* ─── About / How It Works ─────────────────────── */}
            <div id="about">
                <AboutSection />
            </div>

            {/* ─── Tech Stack ───────────────────────────────── */}
            <TechSection />

            {/* ─── Bottom CTA ───────────────────────────────── */}
            <motion.section
                className="landing-bottom-cta"
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7 }}
            >
                <h2 className="landing-bottom-title">Ready to prevent costly downtime?</h2>
                <p className="landing-bottom-desc">
                    Explore the Vortex dashboard to see real-time AI predictions,
                    cascade simulations, and maintenance intelligence in action.
                </p>
                <Link to="/dashboard" className="landing-cta">
                    Launch Dashboard
                    <span style={{ fontSize: '18px' }}>→</span>
                </Link>
            </motion.section>

            {/* ─── Footer ───────────────────────────────────── */}
            <footer className="landing-footer">
                <span>Vortex</span>
                <span className="landing-footer-sep">·</span>
                <span>AI Failure Propagation Intelligence</span>
            </footer>
        </div>
    )
}
