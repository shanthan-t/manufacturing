import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { FactoryProvider } from './hooks/useFactory'
import Layout from './components/Layout'

// Lazy load pages
const LandingPage = lazy(() => import('./pages/LandingPage'))
const OverviewPage = lazy(() => import('./pages/OverviewPage'))
const FactoryMapPage = lazy(() => import('./pages/FactoryMapPage'))
const MaintenancePage = lazy(() => import('./pages/MaintenancePage'))
const ForecastPage = lazy(() => import('./pages/ForecastPage'))
const CopilotPage = lazy(() => import('./pages/CopilotPage'))
const SimulatorPage = lazy(() => import('./pages/SimulatorPage'))

const DASHBOARD_PAGES = [
    { path: '/dashboard', Component: OverviewPage },
    { path: '/dashboard/factory-map', Component: FactoryMapPage },
    { path: '/dashboard/forecast', Component: ForecastPage },
    { path: '/dashboard/maintenance', Component: MaintenancePage },
    { path: '/dashboard/copilot', Component: CopilotPage },
    { path: '/dashboard/simulator', Component: SimulatorPage },
]

function PageFallback() {
    return (
        <div className="loading-screen">
            <div className="loading-spinner" />
        </div>
    )
}

// Persistent dashboard pages — all mounted, shown/hidden via CSS
function PersistentDashboardPages() {
    const location = useLocation()
    const currentPath = location.pathname

    return (
        <>
            {DASHBOARD_PAGES.map(({ path, Component }) => (
                <div
                    key={path}
                    style={{
                        display: currentPath === path ? 'block' : 'none',
                        height: currentPath === path ? 'auto' : 0,
                        overflow: currentPath === path ? 'visible' : 'hidden',
                    }}
                >
                    <Suspense fallback={<PageFallback />}>
                        <Component />
                    </Suspense>
                </div>
            ))}
        </>
    )
}

export default function App() {
    return (
        <FactoryProvider>
            <Routes>
                {/* Landing page — no Layout/navbar */}
                <Route
                    path="/"
                    element={
                        <Suspense fallback={<PageFallback />}>
                            <LandingPage />
                        </Suspense>
                    }
                />
                {/* Dashboard pages — with Layout/navbar */}
                <Route
                    path="/dashboard/*"
                    element={
                        <Layout>
                            <PersistentDashboardPages />
                        </Layout>
                    }
                />
                {/* Redirect any unknown to landing */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </FactoryProvider>
    )
}
