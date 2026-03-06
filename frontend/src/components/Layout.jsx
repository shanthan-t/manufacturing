import { NavLink, useLocation } from 'react-router-dom'
import { useApi } from '../hooks/useApi'

const NAV_ITEMS = [
    { path: '/', label: 'Overview', icon: '📊' },
    { path: '/factory-map', label: 'Factory Map', icon: '🏭' },
    { path: '/simulator', label: 'Simulator', icon: '⚡' },
    { path: '/maintenance', label: 'Maintenance', icon: '🔧' },
    { path: '/forecast', label: 'Forecast', icon: '📈' },
    { path: '/copilot', label: 'AI Copilot', icon: '🤖' },
]

export default function Layout({ children }) {
    const { data: risk } = useApi('/risk/summary')
    const location = useLocation()

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
                        >
                            <span>{item.icon}</span>
                            <span>{item.label}</span>
                        </NavLink>
                    ))}
                </div>

                <div className="navbar-status">
                    <span className="status-dot" />
                    <span>
                        {risk ? `${(risk.avg_health_score * 100).toFixed(0)}% Health` : 'Connecting...'}
                    </span>
                </div>
            </nav>

            <main className="page" key={location.pathname}>
                {children}
            </main>
        </>
    )
}
