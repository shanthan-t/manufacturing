import { useCallback, useRef, useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useFactory } from '../hooks/useFactory'

const NAV_ITEMS = [
    { path: '/dashboard', label: 'Overview', preload: () => import('../pages/OverviewPage') },
    { path: '/dashboard/factory-map', label: 'Factory Map', preload: () => import('../pages/FactoryMapPage') },
    { path: '/dashboard/forecast', label: 'Forecast', preload: () => import('../pages/ForecastPage') },
    { path: '/dashboard/maintenance', label: 'Maintenance', preload: () => import('../pages/MaintenancePage') },
    { path: '/dashboard/copilot', label: 'AI Copilot', preload: () => import('../pages/CopilotPage') },
]

export default function Layout({ children }) {
    const { riskSummary } = useFactory()
    const location = useLocation()
    const navLinksRef = useRef(null)
    const [pillStyle, setPillStyle] = useState({ left: 0, width: 0, opacity: 0 })

    const handleMouseEnter = useCallback((preload) => {
        preload()
    }, [])

    // Calculate pill position based on active link
    useEffect(() => {
        if (!navLinksRef.current) return
        const activeEl = navLinksRef.current.querySelector('.nav-link.active')
        if (activeEl) {
            const containerRect = navLinksRef.current.getBoundingClientRect()
            const activeRect = activeEl.getBoundingClientRect()
            setPillStyle({
                left: activeRect.left - containerRect.left,
                width: activeRect.width,
                opacity: 1,
            })
        }
    }, [location.pathname])

    return (
        <>
            <nav className="navbar">
                <div className="navbar-brand">
                    <span>⚡</span> Cascade<span>Guard</span>
                </div>

                <div className="navbar-links" ref={navLinksRef}>
                    <div
                        className="nav-pill-indicator"
                        style={{
                            left: `${pillStyle.left}px`,
                            width: `${pillStyle.width}px`,
                            opacity: pillStyle.opacity,
                        }}
                    />
                    {NAV_ITEMS.map(item => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            end={item.path === '/dashboard'}
                            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                            onMouseEnter={() => handleMouseEnter(item.preload)}
                        >
                            {item.label}
                        </NavLink>
                    ))}
                </div>

                <div className="navbar-status">
                    <span className="status-dot" />
                    <span>
                        {riskSummary ? `${(riskSummary.avg_health_score * 100).toFixed(0)}% Health` : 'Connecting...'}
                    </span>
                </div>
            </nav>

            <main className="page">
                {children}
            </main>
        </>
    )
}
