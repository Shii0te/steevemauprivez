import { useEffect, useRef, useState } from 'react'

export default function MobileControls({ touchRef, mode, onPause }) {
    const joyRef = useRef(null)
    const joyPointerId = useRef(null)

    const joyCenter = useRef({ x: 0, y: 0 })
    const joyRadius = useRef(60)

    const lookPointerId = useRef(null)
    const lookLast = useRef({ x: 0, y: 0 })

    const setFlag = (key, v) => {
        if (!touchRef?.current) return
        touchRef.current[key] = v
    }

    const onJoyDown = (e) => {
        e.preventDefault()
        if (joyPointerId.current !== null) return
        joyPointerId.current = e.pointerId

        const rect = joyRef.current?.getBoundingClientRect()
        if (rect) {
            joyCenter.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
            joyRadius.current = Math.min(rect.width, rect.height) / 2
        }

        onJoyMove(e)
    }

    const onJoyMove = (e) => {
        if (joyPointerId.current !== e.pointerId) return
        e.preventDefault()

        const dx = e.clientX - joyCenter.current.x
        const dy = e.clientY - joyCenter.current.y

        const r = joyRadius.current || 60
        const len = Math.hypot(dx, dy)
        const k = len > r ? r / len : 1

        const nx = (dx * k) / r
        const ny = (dy * k) / r

        touchRef.current.moveX = nx
        touchRef.current.moveY = ny
    }

    const onJoyUp = (e) => {
        if (joyPointerId.current !== e.pointerId) return
        e.preventDefault()
        joyPointerId.current = null
        touchRef.current.moveX = 0
        touchRef.current.moveY = 0
    }

    const onLookDown = (e) => {
        e.preventDefault()
        if (lookPointerId.current !== null) return
        lookPointerId.current = e.pointerId
        lookLast.current = { x: e.clientX, y: e.clientY }
    }

    const onLookMove = (e) => {
        if (lookPointerId.current !== e.pointerId) return
        e.preventDefault()

        const dx = e.clientX - lookLast.current.x
        const dy = e.clientY - lookLast.current.y
        lookLast.current = { x: e.clientX, y: e.clientY }

        touchRef.current.lookDX += dx
        touchRef.current.lookDY += dy
    }

    const onLookUp = (e) => {
        if (lookPointerId.current !== e.pointerId) return
        e.preventDefault()
        lookPointerId.current = null
    }

    const press = (key) => (e) => {
        e.preventDefault()
        setFlag(key, true)
    }

    const release = (key) => (e) => {
        e.preventDefault()
        setFlag(key, false)
    }

    const pulse = (key) => (e) => {
        e.preventDefault()
        e.stopPropagation()
        setFlag(key, true)

        // Impulsion très courte (1 frame)
        requestAnimationFrame(() => {
            setFlag(key, false)
        })
    }

    const interactLabel = mode === 'car' ? 'SORTIR' : 'ENTRER'

    const [runLocked, setRunLocked] = useState(false)
    const [boostLocked, setBoostLocked] = useState(false)

    useEffect(() => {
        // reset quand on change de mode
        setRunLocked(false)
        setBoostLocked(false)
        if (touchRef?.current) {
            touchRef.current.sprint = false
            touchRef.current.boost = false
        }
    }, [mode])


    return (
        <div className="mobile-controls">
            <div className="touch-top">
                <button className="touch-btn small" onClick={onPause}>MENU</button>
            </div>

            <div
                className="look-zone"
                onPointerDown={onLookDown}
                onPointerMove={onLookMove}
                onPointerUp={onLookUp}
                onPointerCancel={onLookUp}
            />

            <div
                ref={joyRef}
                className="joy-zone"
                onPointerDown={onJoyDown}
                onPointerMove={onJoyMove}
                onPointerUp={onJoyUp}
                onPointerCancel={onJoyUp}
            >
                <div className="joy-base" />
            </div>

            <div className="touch-buttons">
                {/* SAUT (à pied uniquement) */}
                {mode !== 'car' && (
                    <button
                        className="touch-btn"
                        onPointerDown={press('jump')}
                        onPointerUp={release('jump')}
                        onPointerCancel={release('jump')}
                    >
                        SAUT
                    </button>
                )}

                {/* RUN en toggle (à pied uniquement) */}
                {mode !== 'car' && (
                    <button
                        className={`touch-btn ${runLocked ? 'active' : ''}`}
                        onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setRunLocked((v) => {
                                const next = !v
                                touchRef.current.sprint = next
                                return next
                            })
                        }}
                    >
                        RUN
                    </button>
                )}

                {/* BOOST en toggle (voiture uniquement) */}
                {mode === 'car' && (
                    <button
                        className={`touch-btn ${boostLocked ? 'active' : ''}`}
                        onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setBoostLocked((v) => {
                                const next = !v
                                touchRef.current.boost = next
                                return next
                            })
                        }}
                    >
                        BOOST
                    </button>
                )}

                {/* DRIFT (voiture uniquement, maintenir) */}
                {mode === 'car' && (
                    <button
                        className="touch-btn"
                        onPointerDown={press('drift')}
                        onPointerUp={release('drift')}
                        onPointerCancel={release('drift')}
                    >
                        DRIFT
                    </button>
                )}

                {/* ENTRER / SORTIR (toujours) */}
                <button className="touch-btn" onClick={pulse('interact')}>
                    {interactLabel}
                </button>

            </div>

        </div>
    )
}
