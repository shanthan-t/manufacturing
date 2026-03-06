import { Routes, Route, Navigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import Layout from './components/Layout'
import OverviewPage from './pages/OverviewPage'
import FactoryMapPage from './pages/FactoryMapPage'
import SimulatorPage from './pages/SimulatorPage'
import MaintenancePage from './pages/MaintenancePage'
import ForecastPage from './pages/ForecastPage'
import CopilotPage from './pages/CopilotPage'

export default function App() {
  return (
    <Layout>
      <AnimatePresence mode="wait">
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/factory-map" element={<FactoryMapPage />} />
          <Route path="/simulator" element={<SimulatorPage />} />
          <Route path="/maintenance" element={<MaintenancePage />} />
          <Route path="/forecast" element={<ForecastPage />} />
          <Route path="/copilot" element={<CopilotPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
    </Layout>
  )
}
