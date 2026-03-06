import { useCallback, useRef } from 'react'

/**
 * GlassCard — A reusable glassmorphism container with liquid glass hover lighting.
 * Tracks mouse position and renders a soft radial gradient following the cursor.
 */
export default function GlassCard({ children, className = '', style, onClick, ...props }) {
    const lightRef = useRef(null)

    const handleMouseMove = useCallback((e) => {
        if (!lightRef.current) return
        const rect = e.currentTarget.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        lightRef.current.style.background =
            `radial-gradient(400px circle at ${x}px ${y}px, rgba(255,255,255,0.06), transparent 60%)`
    }, [])

    const handleMouseEnter = useCallback(() => {
        if (lightRef.current) lightRef.current.style.opacity = '1'
    }, [])

    const handleMouseLeave = useCallback(() => {
        if (lightRef.current) lightRef.current.style.opacity = '0'
    }, [])

    return (
        <div
            className={`glass ${className}`}
            style={style}
            onClick={onClick}
            onMouseMove={handleMouseMove}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            {...props}
        >
            <div ref={lightRef} className="glass-light" />
            {children}
        </div>
    )
}
