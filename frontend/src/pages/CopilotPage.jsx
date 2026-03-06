import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { postApi } from '../hooks/useApi'

const pageTransition = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.3 },
}

/**
 * Lightweight markdown → JSX renderer.
 */
function renderMarkdown(text) {
    if (!text) return null
    const lines = text.split('\n')
    const elements = []

    const processInline = (line) => {
        const parts = line.split(/(\*\*[^*]+\*\*)/g)
        return parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**'))
                return <strong key={i} style={{ color: 'var(--color-primary)' }}>{part.slice(2, -2)}</strong>
            return part
        })
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (!line.trim()) { elements.push(<br key={`br-${i}`} />); continue }
        if (line.startsWith('### '))
            elements.push(<h5 key={i} style={{ fontWeight: 600, margin: '10px 0 4px', fontSize: '14px' }}>{processInline(line.slice(4))}</h5>)
        else if (line.startsWith('## '))
            elements.push(<h4 key={i} style={{ fontWeight: 600, margin: '10px 0 4px', fontSize: '15px' }}>{processInline(line.slice(3))}</h4>)
        else if (line.startsWith('# '))
            elements.push(<h3 key={i} style={{ fontWeight: 700, margin: '10px 0 4px', fontSize: '16px' }}>{processInline(line.slice(2))}</h3>)
        else if (line.match(/^[•\-\*]\s/))
            elements.push(
                <div key={i} style={{ display: 'flex', gap: '8px', padding: '2px 0' }}>
                    <span style={{ color: 'var(--color-text-tertiary)' }}>•</span>
                    <span>{processInline(line.replace(/^[•\-\*]\s/, ''))}</span>
                </div>
            )
        else if (line.match(/^\d+\.\s/))
            elements.push(
                <div key={i} style={{ display: 'flex', gap: '8px', padding: '2px 0' }}>
                    <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>{line.match(/^(\d+\.)/)[1]}</span>
                    <span>{processInline(line.replace(/^\d+\.\s/, ''))}</span>
                </div>
            )
        else
            elements.push(<p key={i} style={{ margin: '3px 0' }}>{processInline(line)}</p>)
    }
    return elements
}

export default function CopilotPage() {
    const [messages, setMessages] = useState([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [suggestions, setSuggestions] = useState([])
    const [hasGreeted, setHasGreeted] = useState(false)
    const messagesEndRef = useRef(null)
    const inputRef = useRef(null)
    const sessionIdRef = useRef(crypto.randomUUID())

    // Load suggestions
    useEffect(() => {
        fetch('http://localhost:8000/api/copilot/suggestions')
            .then(r => r.json())
            .then(data => setSuggestions(data.suggestions || []))
            .catch(() => { })
    }, [])

    // Auto-greet
    useEffect(() => {
        if (hasGreeted) return
        setHasGreeted(true)
        setLoading(true)
        postApi('/copilot/chat', { message: 'How is the factory doing?', session_id: sessionIdRef.current })
            .then(result => {
                setMessages([{ role: 'assistant', content: result.response, timestamp: Date.now() }])
            })
            .catch(() => {
                setMessages([{
                    role: 'assistant',
                    content: '👋 I\'m the Factory Reliability Copilot. Ask me anything about machine health, cascade risks, or maintenance.',
                    timestamp: Date.now(),
                }])
            })
            .finally(() => setLoading(false))
    }, [hasGreeted])

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, loading])

    const sendMessage = useCallback(async (text) => {
        const msg = (text || input).trim()
        if (!msg || loading) return
        setMessages(prev => [...prev, { role: 'user', content: msg, timestamp: Date.now() }])
        setInput('')
        setLoading(true)

        try {
            // Try streaming
            const streamOk = await sendStreaming(msg)
            if (!streamOk) {
                const result = await postApi('/copilot/chat', { message: msg, session_id: sessionIdRef.current })
                setMessages(prev => [...prev, { role: 'assistant', content: result.response, timestamp: Date.now() }])
            }
        } catch {
            setMessages(prev => [...prev, {
                role: 'assistant', content: 'Sorry, I couldn\'t process that. Please try again.', timestamp: Date.now(),
            }])
        } finally {
            setLoading(false)
            inputRef.current?.focus()
        }
    }, [input, loading])

    const sendStreaming = async (msg) => {
        try {
            const response = await fetch('http://localhost:8000/api/copilot/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: msg, session_id: sessionIdRef.current }),
            })
            if (!response.ok) return false

            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let accumulated = ''

            setMessages(prev => [...prev, {
                role: 'assistant', content: '', timestamp: Date.now(), streaming: true,
            }])

            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                const text = decoder.decode(value, { stream: true })
                for (const line of text.split('\n')) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6)
                        if (data === '[DONE]') continue
                        accumulated += data
                        setMessages(prev => {
                            const u = [...prev]
                            const last = u.length - 1
                            if (last >= 0 && u[last].role === 'assistant')
                                u[last] = { ...u[last], content: accumulated }
                            return u
                        })
                    }
                }
            }

            setMessages(prev => {
                const u = [...prev]
                const last = u.length - 1
                if (last >= 0) u[last] = { ...u[last], streaming: false }
                return u
            })
            return true
        } catch { return false }
    }

    const resetChat = useCallback(async () => {
        try {
            await fetch('http://localhost:8000/api/copilot/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionIdRef.current }),
            })
        } catch { /* ignore */ }
        sessionIdRef.current = crypto.randomUUID()
        setMessages([])
        setHasGreeted(false)
        setInput('')
    }, [])

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
    }

    return (
        <motion.div className="page-container" {...pageTransition} style={{ maxWidth: '900px' }}>
            <div className="page-header" style={{ textAlign: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 1 }} />
                    <div style={{ textAlign: 'center' }}>
                        <h1 className="page-title">AI Factory Copilot</h1>
                        <p className="page-subtitle">Ask anything about machine health, risks, and maintenance</p>
                    </div>
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            className="copilot-chip"
                            onClick={resetChat}
                            disabled={loading || messages.length === 0}
                            style={{ fontSize: '13px', padding: '6px 14px', whiteSpace: 'nowrap' }}
                        >
                            ✦ New Chat
                        </button>
                    </div>
                </div>
            </div>

            <div className="glass copilot-container">
                {/* Messages */}
                <div className="copilot-messages">
                    {messages.map((msg, i) => (
                        <div key={i} className={`copilot-msg copilot-msg--${msg.role}`}>
                            {msg.role === 'assistant' && <div className="copilot-avatar">🤖</div>}
                            <div className={`copilot-bubble copilot-bubble--${msg.role}`}>
                                {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
                                {msg.streaming && <span className="copilot-cursor">▊</span>}
                            </div>
                        </div>
                    ))}

                    {loading && !messages.some(m => m.streaming) && (
                        <div className="copilot-msg copilot-msg--assistant">
                            <div className="copilot-avatar">🤖</div>
                            <div className="copilot-bubble copilot-bubble--assistant copilot-typing">
                                <span /><span /><span />
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Suggestions */}
                {messages.length <= 1 && suggestions.length > 0 && (
                    <div className="copilot-suggestions">
                        {suggestions.slice(0, 4).map((s, i) => (
                            <button key={i} className="copilot-chip" onClick={() => sendMessage(s)} disabled={loading}>
                                {s}
                            </button>
                        ))}
                    </div>
                )}

                {/* Input */}
                <div className="copilot-input-area">
                    <input
                        ref={inputRef}
                        className="copilot-input"
                        type="text"
                        placeholder="Ask about factory health, risks, maintenance…"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={loading}
                    />
                    <button className="copilot-send" onClick={() => sendMessage()} disabled={loading || !input.trim()}>
                        ↑
                    </button>
                </div>
            </div>
        </motion.div>
    )
}
