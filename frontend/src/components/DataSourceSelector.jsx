/**
 * DataSourceSelector — Toggle between synthetic demo data and real uploaded machine data.
 * Shows upload zone, validation results, and dataset metadata.
 */
import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const API_BASE = 'http://localhost:8000/api'

export default function DataSourceSelector({ onDataChange }) {
    const [mode, setMode] = useState('synthetic')  // 'synthetic', 'real', or 'live'
    const [uploadState, setUploadState] = useState('idle') // idle, uploading, processing, success, error
    const [uploadInfo, setUploadInfo] = useState(null)
    const [error, setError] = useState(null)
    const [dragOver, setDragOver] = useState(false)
    const fileInputRef = useRef(null)

    const handleModeSwitch = useCallback(async (newMode) => {
        if (newMode === mode) return

        if (newMode === 'synthetic') {
            setUploadState('processing')
            setError(null)
            try {
                const res = await fetch(`${API_BASE}/data/mode`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mode: 'synthetic' }),
                })
                const data = await res.json()
                if (res.ok && data.status === 'success') {
                    setMode('synthetic')
                    setUploadState('idle')
                    setUploadInfo(null)
                    onDataChange?.()
                } else {
                    setError(data.detail || 'Failed to switch mode')
                    setUploadState('error')
                }
            } catch (err) {
                setError('Connection error')
                setUploadState('error')
            }
        } else if (newMode === 'real') {
            setMode('real')
        } else if (newMode === 'live') {
            setMode('live')
        }
    }, [mode, onDataChange])

    const handleFileUpload = useCallback(async (file) => {
        if (!file) return

        const ext = file.name.split('.').pop()?.toLowerCase()
        if (!['csv', 'xlsx', 'xls'].includes(ext)) {
            setError('Please upload a CSV or Excel file.')
            setUploadState('error')
            return
        }

        setUploadState('uploading')
        setError(null)

        const formData = new FormData()
        formData.append('file', file)

        try {
            setUploadState('processing')
            const res = await fetch(`${API_BASE}/data/upload`, {
                method: 'POST',
                body: formData,
            })
            const data = await res.json()

            if (res.ok && data.status === 'success') {
                setUploadState('success')
                const meta = data.validation?.metadata || {}
                const schema = data.validation?.schema || {}
                setUploadInfo({
                    filename: file.name,
                    machines: meta.machines_detected || 0,
                    records: meta.total_records || 0,
                    warnings: data.validation?.warnings || [],
                    mappedFeatures: schema.mapped_features || meta.mapped_features || {},
                    sensorFeatures: schema.sensor_features_detected || meta.sensor_features_detected || [],
                    unmappedColumns: schema.unmapped_columns || meta.unmapped_columns || [],
                    columnsFound: meta.columns_found || [],
                })
                onDataChange?.()
            } else {
                setUploadState('error')
                const errors = data.validation?.errors || [data.error || data.detail || 'Upload failed']
                setError(errors.join('; '))
            }
        } catch (err) {
            setUploadState('error')
            setError('Connection error. Is the backend running?')
        }
    }, [onDataChange])

    const handleDrop = useCallback((e) => {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer.files[0]
        if (file) handleFileUpload(file)
    }, [handleFileUpload])

    const handleDragOver = useCallback((e) => {
        e.preventDefault()
        setDragOver(true)
    }, [])

    const handleDragLeave = useCallback(() => setDragOver(false), [])

    return (
        <motion.div
            className="glass data-source-selector"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
        >
            <div className="ds-header">
                <div className="ds-title-row">
                    <span className="ds-icon"></span>
                    <h3 className="ds-title">Data Source</h3>
                </div>
            </div>

            {/* Radio Toggle */}
            <div className="ds-toggle-group">
                <label
                    className={`ds-toggle-option ${mode === 'synthetic' ? 'active' : ''}`}
                    onClick={() => handleModeSwitch('synthetic')}
                >
                    <span className={`ds-radio ${mode === 'synthetic' ? 'checked' : ''}`} />
                    <div className="ds-toggle-content">
                        <span className="ds-toggle-label">Synthetic Demo Data</span>
                        <span className="ds-toggle-desc">Pre-generated simulation dataset</span>
                    </div>
                </label>

                <label
                    className={`ds-toggle-option ${mode === 'real' ? 'active' : ''}`}
                    onClick={() => handleModeSwitch('real')}
                >
                    <span className={`ds-radio ${mode === 'real' ? 'checked' : ''}`} />
                    <div className="ds-toggle-content">
                        <span className="ds-toggle-label">Upload Real Machine Data</span>
                        <span className="ds-toggle-desc">CSV or Excel with sensor readings</span>
                    </div>
                </label>

                <label
                    className={`ds-toggle-option ${mode === 'live' ? 'active' : ''}`}
                    onClick={() => handleModeSwitch('live')}
                >
                    <span className={`ds-radio ${mode === 'live' ? 'checked' : ''}`} />
                    <div className="ds-toggle-content">
                        <span className="ds-toggle-label">
                            Connect to Live Sensors
                            <span className="ds-live-dot" />
                        </span>
                        <span className="ds-toggle-desc">Real-time MQTT / OPC-UA stream</span>
                    </div>
                </label>
            </div>

            {/* Upload Zone */}
            <AnimatePresence>
                {mode === 'real' && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        style={{ overflow: 'hidden' }}
                    >
                        <div
                            className={`ds-upload-zone ${dragOver ? 'drag-over' : ''} ${uploadState === 'success' ? 'success' : ''}`}
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv,.xlsx,.xls"
                                style={{ display: 'none' }}
                                onChange={(e) => handleFileUpload(e.target.files[0])}
                            />

                            {uploadState === 'idle' && (
                                <>
                                    <span className="ds-upload-icon">⬆</span>
                                    <span className="ds-upload-text">
                                        Drop CSV or Excel file here, or <strong>click to browse</strong>
                                    </span>
                                    <span className="ds-upload-hint">
                                        Auto-detects columns like temperature, vibration, rpm, power, pressure, etc.
                                    </span>
                                </>
                            )}

                            {(uploadState === 'uploading' || uploadState === 'processing') && (
                                <div className="ds-processing">
                                    <div className="loading-spinner" />
                                    <span className="ds-upload-text">
                                        {uploadState === 'uploading' ? 'Uploading...' : 'Processing & re-initializing system...'}
                                    </span>
                                </div>
                            )}

                            {uploadState === 'success' && uploadInfo && (
                                <div className="ds-success-info" onClick={(e) => e.stopPropagation()}>
                                    <span className="ds-success-icon">✅</span>
                                    <span className="ds-upload-text ds-filename">{uploadInfo.filename}</span>
                                    <div className="ds-meta-grid">
                                        <div className="ds-meta-item">
                                            <span className="ds-meta-value">{uploadInfo.machines}</span>
                                            <span className="ds-meta-label">Machines</span>
                                        </div>
                                        <div className="ds-meta-item">
                                            <span className="ds-meta-value">{uploadInfo.records.toLocaleString()}</span>
                                            <span className="ds-meta-label">Records</span>
                                        </div>
                                        <div className="ds-meta-item">
                                            <span className="ds-meta-value">{uploadInfo.sensorFeatures?.length || 0}</span>
                                            <span className="ds-meta-label">Features</span>
                                        </div>
                                        <div className="ds-meta-item">
                                            <span className="ds-meta-value ds-status-ready">Ready</span>
                                            <span className="ds-meta-label">Status</span>
                                        </div>
                                    </div>

                                    {/* Mapped Features */}
                                    {uploadInfo.sensorFeatures?.length > 0 && (
                                        <div className="ds-schema-section">
                                            <span className="ds-schema-title">Mapped Features</span>
                                            <div className="ds-feature-tags">
                                                {uploadInfo.sensorFeatures.map((f) => (
                                                    <span key={f} className="ds-feature-tag">
                                                        {f}
                                                        <span className="ds-feature-arrow">←</span>
                                                        <span className="ds-feature-col">{uploadInfo.mappedFeatures?.[f]}</span>
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Detected Columns */}
                                    {uploadInfo.columnsFound?.length > 0 && (
                                        <div className="ds-schema-section">
                                            <span className="ds-schema-title">Detected Columns</span>
                                            <div className="ds-col-list">
                                                {uploadInfo.columnsFound.map((c) => (
                                                    <span key={c} className="ds-col-badge">{c}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {uploadInfo.warnings?.length > 0 && (
                                        <div className="ds-warnings">
                                            {uploadInfo.warnings.map((w, i) => (
                                                <span key={i} className="ds-warning-text"> {w}</span>
                                            ))}
                                        </div>
                                    )}
                                    <button
                                        className="ds-reupload-btn"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setUploadState('idle')
                                            setUploadInfo(null)
                                            fileInputRef.current.value = ''
                                        }}
                                    >
                                        Upload Different File
                                    </button>
                                </div>
                            )}

                            {uploadState === 'error' && (
                                <div className="ds-error-info" onClick={(e) => e.stopPropagation()}>
                                    <span className="ds-error-icon">❌</span>
                                    <span className="ds-error-text">{error}</span>
                                    <button
                                        className="ds-retry-btn"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setUploadState('idle')
                                            setError(null)
                                            fileInputRef.current.value = ''
                                        }}
                                    >
                                        Try Again
                                    </button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Live Sensors Panel */}
            <AnimatePresence>
                {mode === 'live' && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        style={{ overflow: 'hidden' }}
                    >
                        <div className="ds-live-panel">
                            <div className="ds-live-header">
                                <span className="ds-live-pulse" />
                                <span className="ds-live-title">Live Sensor Connection</span>
                            </div>
                            <div className="ds-live-fields">
                                <div className="ds-live-field">
                                    <label className="ds-live-label">Broker URL</label>
                                    <input
                                        className="ds-live-input"
                                        type="text"
                                        placeholder="mqtt://broker.example.com:1883"
                                        disabled
                                    />
                                </div>
                                <div className="ds-live-field">
                                    <label className="ds-live-label">Topic / Endpoint</label>
                                    <input
                                        className="ds-live-input"
                                        type="text"
                                        placeholder="factory/sensors/#"
                                        disabled
                                    />
                                </div>
                            </div>
                            <div className="ds-live-coming-soon">
                                <span className="badge badge-info">COMING SOON</span>
                                <span className="ds-upload-hint">
                                    Live sensor ingestion via MQTT and OPC-UA is under development.
                                </span>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}
