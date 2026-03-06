import { useCallback } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useFactory } from '../hooks/useFactory'

const NAV_ITEMS = [
    { path: '/', label: 'Overview', preload: () => import('../pages/OverviewPage') },
    { path: '/factory-map', label: 'Factory Map', preload: () => import('../pages/FactoryMapPage') },
    { path: '/forecast', label: 'Forecast', preload: () => import('../pages/ForecastPage') },
    { path: '/maintenance', label: 'Maintenance', preload: () => import('../pages/MaintenancePage') },
    { path: '/copilot', label: 'AI Copilot', preload: () => import('../pages/CopilotPage') },
]

export default function Layout({ children }) {
    const { riskSummary } = useFactory()
    const location = useLocation()

    const handleMouseEnter = useCallback((preload) => {
        // Preload page chunk on hover
        preload()
    }, [])

    return (
        <>
            <nav className="navbar">
                <div className="navbar-brand">
                    <span>⚡</span> Cascade<span>Guard</span>
                </div>

                <div className="navbar-links">
                    {NAV_ITEMS.map(item => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            end={item.path === '/'}
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

            <main className="page" key={location.pathname}>
                {children}
            </main>
        </>
    )
}
