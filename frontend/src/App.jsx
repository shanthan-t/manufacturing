import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { FactoryProvider } from './hooks/useFactory'
import Layout from './components/Layout'

// Lazy load heavy pages
const OverviewPage = lazy(() => import('./pages/OverviewPage'))
const FactoryMapPage = lazy(() => import('./pages/FactoryMapPage'))
const MaintenancePage = lazy(() => import('./pages/MaintenancePage'))
const ForecastPage = lazy(() => import('./pages/ForecastPage'))
const CopilotPage = lazy(() => import('./pages/CopilotPage'))

const PAGES = [
  { path: '/', Component: OverviewPage },
  { path: '/factory-map', Component: FactoryMapPage },
  { path: '/forecast', Component: ForecastPage },
  { path: '/maintenance', Component: MaintenancePage },
  { path: '/copilot', Component: CopilotPage },
]

// Fallback spinner for Suspense
function PageFallback() {
  return (
    <div className="loading-screen">
      <div className="loading-spinner" />
    </div>
  )
}

// Persistent pages — keep all mounted, show/hide via CSS
function PersistentPages() {
  const location = useLocation()
  const currentPath = location.pathname

  return (
    <>
      {PAGES.map(({ path, Component }) => (
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
      <Layout>
        <Routes>
          <Route path="/*" element={<PersistentPages />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </FactoryProvider>
  )
}
