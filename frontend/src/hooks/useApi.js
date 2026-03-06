/**
 * Custom hooks for API data fetching.
 */
import { useState, useEffect, useCallback } from 'react';

const API_BASE = '/api';

export function useApi(endpoint, options = {}) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await fetch(`${API_BASE}${endpoint}`, options);
            if (!response.ok) throw new Error(`API error: ${response.status}`);
            const json = await response.json();
            setData(json);
        } catch (err) {
            setError(err.message);
            console.error(`API fetch error for ${endpoint}:`, err);
        } finally {
            setLoading(false);
        }
    }, [endpoint]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return { data, loading, error, refetch: fetchData };
}

export async function postApi(endpoint, body) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return response.json();
}

export function useFactoryGraph() {
    return useApi('/graph');
}

export function useMachines() {
    return useApi('/machines');
}

export function useRiskSummary() {
    return useApi('/risk/summary');
}

export function useCriticalMachines() {
    return useApi('/risk/critical');
}

export function useDataStatus() {
    return useApi('/data/status');
}

export async function uploadDataFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${API_BASE}/data/upload`, {
        method: 'POST',
        body: formData,
    });
    if (!response.ok) throw new Error(`Upload error: ${response.status}`);
    return response.json();
}

export async function switchDataMode(mode) {
    const response = await fetch(`${API_BASE}/data/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
    });
    if (!response.ok) throw new Error(`Mode switch error: ${response.status}`);
    return response.json();
}

