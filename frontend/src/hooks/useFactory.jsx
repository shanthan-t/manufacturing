/**
 * FactoryContext — Global state cache for factory data.
 * Fetches all shared data once and provides it to all pages.
 */
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'

const API_BASE = 'http://localhost:8000/api'

const FactoryContext = createContext(null)

export function FactoryProvider({ children }) {
    const [riskSummary, setRiskSummary] = useState(null)
    const [criticalMachines, setCriticalMachines] = useState(null)
    const [maintenance, setMaintenance] = useState(null)
    const [graphData, setGraphData] = useState(null)
    const [loading, setLoading] = useState(true)
    const fetchedRef = useRef(false)

    const fetchAll = useCallback(async () => {
        setLoading(true)
        try {
            const [risk, critical, maint, graph] = await Promise.all([
                fetch(`${API_BASE}/risk/summary`).then(r => r.json()),
                fetch(`${API_BASE}/risk/critical`).then(r => r.json()),
                fetch(`${API_BASE}/maintenance/priorities`).then(r => r.json()),
                fetch(`${API_BASE}/graph`).then(r => r.json()),
            ])
            setRiskSummary(risk)
            setCriticalMachines(critical)
            setMaintenance(maint)
            setGraphData(graph)
        } catch (err) {
            console.error('FactoryContext fetch error:', err)
        } finally {
            setLoading(false)
        }
    }, [])

    // Fetch once on mount
    useEffect(() => {
        if (fetchedRef.current) return
        fetchedRef.current = true
        fetchAll()
    }, [fetchAll])

    const value = {
        riskSummary,
        criticalMachines,
        maintenance,
        graphData,
        loading,
        refetchAll: fetchAll,
    }

    return (
        <FactoryContext.Provider value={value}>
            {children}
        </FactoryContext.Provider>
    )
}

export function useFactory() {
    const ctx = useContext(FactoryContext)
    if (!ctx) throw new Error('useFactory must be used within FactoryProvider')
    return ctx
}
