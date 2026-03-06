/**
 * CopilotPanel — GenAI Factory Reliability Copilot
 * Conversational chat interface with SSE streaming support.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { postApi } from '../hooks/useApi';

/**
 * Very lightweight markdown-to-JSX renderer.
 * Handles: **bold**, headings (#), bullet lists, tables, newlines.
 */
function renderMarkdown(text) {
    if (!text) return null;

    const lines = text.split('\n');
    const elements = [];
    let tableRows = [];
    let inTable = false;

    const processInline = (line) => {
        // Bold
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={i}>{part.slice(2, -2)}</strong>;
            }
            return part;
        });
    };

    const flushTable = () => {
        if (tableRows.length > 0) {
            const headerCells = tableRows[0];
            const bodyRows = tableRows.slice(2); // skip separator
            elements.push(
                <table key={`table-${elements.length}`} className="copilot-table">
                    <thead>
                        <tr>{headerCells.map((c, i) => <th key={i}>{processInline(c.trim())}</th>)}</tr>
                    </thead>
                    <tbody>
                        {bodyRows.map((row, ri) => (
                            <tr key={ri}>{row.map((c, ci) => <td key={ci}>{processInline(c.trim())}</td>)}</tr>
                        ))}
                    </tbody>
                </table>
            );
            tableRows = [];
        }
        inTable = false;
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Table detection
        if (line.includes('|') && line.trim().startsWith('|')) {
            const cells = line.split('|').filter(c => c.trim() !== '');
            if (cells.length > 0) {
                inTable = true;
                tableRows.push(cells);
                continue;
            }
        } else if (inTable) {
            flushTable();
        }

        // Empty line
        if (!line.trim()) {
            if (!inTable) elements.push(<br key={`br-${i}`} />);
            continue;
        }

        // Heading
        if (line.startsWith('###')) {
            elements.push(<h5 key={i} className="copilot-h3">{processInline(line.replace(/^###\s*/, ''))}</h5>);
        } else if (line.startsWith('##')) {
            elements.push(<h4 key={i} className="copilot-h2">{processInline(line.replace(/^##\s*/, ''))}</h4>);
        } else if (line.startsWith('#')) {
            elements.push(<h3 key={i} className="copilot-h1">{processInline(line.replace(/^#\s*/, ''))}</h3>);
        }
        // Bullet list
        else if (line.match(/^[•\-\*]\s/)) {
            elements.push(
                <div key={i} className="copilot-bullet">
                    <span className="copilot-bullet-dot">•</span>
                    <span>{processInline(line.replace(/^[•\-\*]\s/, ''))}</span>
                </div>
            );
        }
        // Numbered list
        else if (line.match(/^\d+\.\s/)) {
            const num = line.match(/^(\d+)\./)[1];
            elements.push(
                <div key={i} className="copilot-numbered">
                    <span className="copilot-num">{num}.</span>
                    <span>{processInline(line.replace(/^\d+\.\s/, ''))}</span>
                </div>
            );
        }
        // Indented sub-item
        else if (line.match(/^\s{2,}/)) {
            elements.push(
                <div key={i} className="copilot-subitem">{processInline(line.trim())}</div>
            );
        }
        // Regular paragraph
        else {
            elements.push(<p key={i} className="copilot-p">{processInline(line)}</p>);
        }
    }

    if (inTable) flushTable();
    return elements;
}


export default function CopilotPanel() {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [hasGreeted, setHasGreeted] = useState(false);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const sessionIdRef = useRef(crypto.randomUUID());

    // Load suggestions
    useEffect(() => {
        fetch('http://localhost:8000/api/copilot/suggestions')
            .then(r => r.json())
            .then(data => setSuggestions(data.suggestions || []))
            .catch(() => { });
    }, []);

    // Auto-greet with factory summary
    useEffect(() => {
        if (hasGreeted) return;
        setHasGreeted(true);
        setLoading(true);

        postApi('/copilot/chat', { message: 'How is the factory doing?', session_id: sessionIdRef.current })
            .then(result => {
                setMessages([{
                    role: 'assistant',
                    content: result.response,
                    intent: result.intent,
                    timestamp: Date.now(),
                }]);
            })
            .catch(() => {
                setMessages([{
                    role: 'assistant',
                    content: ' Hi! I\'m the Factory Reliability Copilot. Ask me anything about machine health, cascade risks, or maintenance priorities.',
                    timestamp: Date.now(),
                }]);
            })
            .finally(() => setLoading(false));
    }, [hasGreeted]);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    const sendMessage = useCallback(async (text) => {
        const msg = (text || input).trim();
        if (!msg || loading) return;

        const userMsg = { role: 'user', content: msg, timestamp: Date.now() };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        // Try streaming first, fall back to regular POST
        try {
            const streamSuccess = await sendStreaming(msg);
            if (!streamSuccess) {
                // Fallback to non-streaming
                const result = await postApi('/copilot/chat', { message: msg, session_id: sessionIdRef.current });
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: result.response,
                    intent: result.intent,
                    timestamp: Date.now(),
                }]);
            }
        } catch (err) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: 'Sorry, I wasn\'t able to process that request. Please try again.',
                timestamp: Date.now(),
            }]);
        } finally {
            setLoading(false);
            inputRef.current?.focus();
        }
    }, [input, loading]);

    /**
     * Stream response via SSE. Returns true if successful, false to use fallback.
     */
    const sendStreaming = async (msg) => {
        try {
            const response = await fetch('http://localhost:8000/api/copilot/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: msg, session_id: sessionIdRef.current }),
            });

            if (!response.ok) return false;

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let accumulated = '';
            let assistantIdx = null;

            // Add empty assistant message that we'll fill
            setMessages(prev => {
                assistantIdx = prev.length;
                return [...prev, {
                    role: 'assistant',
                    content: '',
                    intent: 'genai',
                    timestamp: Date.now(),
                    streaming: true,
                }];
            });

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const text = decoder.decode(value, { stream: true });
                const lines = text.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') continue;
                        accumulated += data;

                        // Update the assistant message in-place
                        setMessages(prev => {
                            const updated = [...prev];
                            const lastAssistant = updated.length - 1;
                            if (lastAssistant >= 0 && updated[lastAssistant].role === 'assistant') {
                                updated[lastAssistant] = {
                                    ...updated[lastAssistant],
                                    content: accumulated,
                                };
                            }
                            return updated;
                        });
                    }
                }
            }

            // Mark streaming complete
            setMessages(prev => {
                const updated = [...prev];
                const lastAssistant = updated.length - 1;
                if (lastAssistant >= 0 && updated[lastAssistant].role === 'assistant') {
                    updated[lastAssistant] = {
                        ...updated[lastAssistant],
                        streaming: false,
                    };
                }
                return updated;
            });

            return true;
        } catch (e) {
            console.warn('Streaming failed, using fallback:', e);
            return false;
        }
    };

    const resetChat = useCallback(async () => {
        try {
            await fetch('http://localhost:8000/api/copilot/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionIdRef.current }),
            });
        } catch { /* ignore */ }
        sessionIdRef.current = crypto.randomUUID();
        setMessages([]);
        setHasGreeted(false);
        setInput('');
    }, []);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <div className="panel copilot-panel">
            {/* Header */}
            <div className="panel-header">
                <h2 className="panel-title">AI Factory Copilot</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                        className="copilot-suggestion-chip"
                        onClick={resetChat}
                        disabled={loading || messages.length === 0}
                        style={{ fontSize: '11px', padding: '4px 10px', whiteSpace: 'nowrap' }}
                    >
                        ✦ New Chat
                    </button>
                    <span className="panel-badge copilot-badge"> GenAI</span>
                </div>
            </div>

            {/* Messages */}
            <div className="copilot-messages">
                {messages.map((msg, i) => (
                    <div key={i} className={`copilot-msg copilot-msg--${msg.role}`}>
                        {msg.role === 'assistant' && (
                            <div className="copilot-avatar"></div>
                        )}
                        <div className={`copilot-bubble copilot-bubble--${msg.role}`}>
                            {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
                            {msg.streaming && (
                                <span className="copilot-cursor">▊</span>
                            )}
                        </div>
                    </div>
                ))}

                {/* Typing indicator */}
                {loading && !messages.some(m => m.streaming) && (
                    <div className="copilot-msg copilot-msg--assistant">
                        <div className="copilot-avatar"></div>
                        <div className="copilot-bubble copilot-bubble--assistant copilot-typing">
                            <span className="copilot-dot" />
                            <span className="copilot-dot" />
                            <span className="copilot-dot" />
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Suggestions */}
            {messages.length <= 1 && suggestions.length > 0 && (
                <div className="copilot-suggestions">
                    {suggestions.slice(0, 4).map((s, i) => (
                        <button
                            key={i}
                            className="copilot-suggestion-chip"
                            onClick={() => sendMessage(s)}
                            disabled={loading}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            )}

            {/* Input */}
            <div className="copilot-input-row">
                <input
                    ref={inputRef}
                    className="copilot-input"
                    type="text"
                    placeholder="Ask about factory health, risks, maintenance..."
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={loading}
                />
                <button
                    className="copilot-send"
                    onClick={() => sendMessage()}
                    disabled={loading || !input.trim()}
                >
                    ↑
                </button>
            </div>
        </div>
    );
}
