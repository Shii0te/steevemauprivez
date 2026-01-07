import { useEffect, useRef } from 'react'

export default function MobileControls({ touchRef, mode = 'player' }) {
  const joyId = useRef(null)
  const lookId = useRef(null)

  const joyCenter = useRef({ x: 0, y: 0 })
  const lookPrev = useRef({ x: 0, y: 0 })

  const JOY_RADIUS = 50

  // Reset quand on quitte la page / etc.
  useEffect(() => {
    return () => {
      if (!touchRef?.current) return
      Object.assign(touchRef.current, {
        moveX: 0, moveY: 0, lookDX: 0, lookDY: 0,
        jump: false, sprint: false, interact: false, boost: false, drift: false
      })
    }
  }, [touchRef])

  const setBtn = (key, val) => {
    if (!touchRef?.current) return
    touchRef.current[key] = val
  }

  // --- JOYSTICK (bas gauche) ---
  const onJoyDown = (e) => {
    if (!touchRef?.current) return
    joyId.current = e.pointerId
    e.currentTarget.setPointerCapture(e.pointerId)
    joyCenter.current = { x: e.clientX, y: e.clientY }
  }

  const onJoyMove = (e) => {
    if (!touchRef?.current) return
    if (joyId.current !== e.pointerId) return

    const dx = e.clientX - joyCenter.current.x
    const dy = e.clientY - joyCenter.current.y

    const len = Math.hypot(dx, dy)
    const k = len > JOY_RADIUS ? JOY_RADIUS / len : 1

    const nx = (dx * k) / JOY_RADIUS
    const ny = (dy * k) / JOY_RADIUS

    touchRef.current.moveX = nx
    touchRef.current.moveY = ny
  }

  const onJoyUp = (e) => {
    if (!touchRef?.current) return
    if (joyId.current !== e.pointerId) return
    joyId.current = null
    touchRef.current.moveX = 0
    touchRef.current.moveY = 0
  }

  // --- LOOK ZONE (moitié droite) ---
  const onLookDown = (e) => {
    if (!touchRef?.current) return
    lookId.current = e.pointerId
    e.currentTarget.setPointerCapture(e.pointerId)
    lookPrev.current = { x: e.clientX, y: e.clientY }
  }

  const onLookMove = (e) => {
    if (!touchRef?.current) return
    if (lookId.current !== e.pointerId) return

    const dx = e.clientX - lookPrev.current.x
    const dy = e.clientY - lookPrev.current.y

    lookPrev.current = { x: e.clientX, y: e.clientY }

    // On accumule des deltas, Player les consommera chaque frame
    touchRef.current.lookDX += dx
    touchRef.current.lookDY += dy
  }

  const onLookUp = (e) => {
    if (!touchRef?.current) return
    if (lookId.current !== e.pointerId) return
    lookId.current = null
  }

  return (
    <div className="mobile-controls">
      {/* Zone look (droite) */}
      <div
        className="look-zone"
        onPointerDown={onLookDown}
        onPointerMove={onLookMove}
        onPointerUp={onLookUp}
        onPointerCancel={onLookUp}
      />

      {/* Joystick (gauche) */}
      <div
        className="joy-zone"
        onPointerDown={onJoyDown}
        onPointerMove={onJoyMove}
        onPointerUp={onJoyUp}
        onPointerCancel={onJoyUp}
      >
        <div className="joy-base" />
      </div>

      {/* Boutons (droite) */}
      <div className="touch-buttons">
        {mode === 'player' ? (
          <>
            <button
              className="touch-btn"
              onPointerDown={() => setBtn('jump', true)}
              onPointerUp={() => setBtn('jump', false)}
              onPointerCancel={() => setBtn('jump', false)}
            >
              JUMP
            </button>

            <button
              className="touch-btn"
              onPointerDown={() => setBtn('sprint', true)}
              onPointerUp={() => setBtn('sprint', false)}
              onPointerCancel={() => setBtn('sprint', false)}
            >
              RUN
            </button>

            <button
              className="touch-btn"
              onPointerDown={() => setBtn('interact', true)}
              onPointerUp={() => setBtn('interact', false)}
              onPointerCancel={() => setBtn('interact', false)}
            >
              E
            </button>
          </>
        ) : (
          <>
            <button
              className="touch-btn"
              onPointerDown={() => setBtn('boost', true)}
              onPointerUp={() => setBtn('boost', false)}
              onPointerCancel={() => setBtn('boost', false)}
            >
              BOOST
            </button>

            <button
              className="touch-btn"
              onPointerDown={() => setBtn('drift', true)}
              onPointerUp={() => setBtn('drift', false)}
              onPointerCancel={() => setBtn('drift', false)}
            >
              DRIFT
            </button>

            <button
              className="touch-btn"
              onPointerDown={() => setBtn('interact', true)}
              onPointerUp={() => setBtn('interact', false)}
              onPointerCancel={() => setBtn('interact', false)}
            >
              E
            </button>
          </>
        )}
      </div>
    </div>
  )
}
