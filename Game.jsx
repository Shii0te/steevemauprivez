import { Canvas, useThree } from '@react-three/fiber'
import { Stats, AdaptiveDpr, PerformanceMonitor } from '@react-three/drei'
import { useEffect, useRef, useState } from 'react'

import { Map } from './components/Map'
import { Player } from './components/Player'
import { Car } from './components/Car'

// ⚠️ IMPORTANT : assure-toi d'importer MobileControls si tu l'utilises
// import { MobileControls } from './components/MobileControls'

export default function Game({ autoLock, onAutoLockDone, onMainMenu }) {
  const canvasRef = useRef(null)

  const [hasControl, setHasControl] = useState(false)
  const [paused, setPaused] = useState(false)
  const [sensitivity, setSensitivity] = useState(0.005)

  const playerRef = useRef(null)
  const carRef = useRef(null)

  const [worldColliders, setWorldColliders] = useState({
    ground: [],
    walls: []
  })

  // ✅ DOIT ÊTRE DÉCLARÉ AVANT LES useEffect QUI L'UTILISENT
  const isTouch =
    typeof window !== 'undefined' &&
    ('ontouchstart' in window || navigator.maxTouchPoints > 0)

  const touchRef = useRef({
    moveX: 0,
    moveY: 0,
    lookDX: 0,
    lookDY: 0,
    jump: false,
    sprint: false,
    interact: false,
    boost: false,
    drift: false
  })

  function WorldColliders({ onReady }) {
    const { scene } = useThree()

    useEffect(() => {
      const ground = []
      const walls = []

      scene.traverse((obj) => {
        if (!obj.isObject3D) return
        if (obj.userData?.isGround) ground.push(obj)
        if (obj.userData?.isCollider) walls.push(obj)
      })

      onReady({ ground, walls })
    }, [scene, onReady])

    return null
  }

  const goMainMenu = () => {
    setPaused(false)
    document.exitPointerLock?.()
    onMainMenu?.()
    window.location.reload()
  }

  const restart = () => {
    playerRef.current?.reset()
    setPaused(false)
    // pointerLock seulement desktop
    if (!isTouch) canvasRef.current?.requestPointerLock?.()
  }

  const resume = () => {
    setPaused(false)
    if (!isTouch) canvasRef.current?.requestPointerLock?.()
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // ✅ MOBILE : pas de pointer lock => on considère que tu as le contrôle
    if (isTouch) {
      setHasControl(true)
      setPaused(false)
      return
    }

    const requestLock = () => {
      if (paused) return
      if (document.pointerLockElement === canvas) return
      if (typeof canvas.requestPointerLock !== 'function') return
      canvas.requestPointerLock()
    }

    const onLockChange = () => {
      const locked = document.pointerLockElement === canvas
      setHasControl(locked)
      if (!locked) setPaused(true)
    }

    const onKeyDown = (e) => {
      if (e.code === 'KeyP') {
        e.preventDefault()
        setPaused(true)
        document.exitPointerLock?.()
      }
    }

    if (autoLock && typeof canvas.requestPointerLock === 'function') {
      canvas.requestPointerLock()
      onAutoLockDone?.()
    }

    canvas.addEventListener('click', requestLock)
    document.addEventListener('pointerlockchange', onLockChange)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      canvas.removeEventListener('click', requestLock)
      document.removeEventListener('pointerlockchange', onLockChange)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [paused, autoLock, onAutoLockDone, isTouch])

  const [inputState, setInputState] = useState({
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
    jump: false,
    mouseLeft: false,
    mouseRight: false
  })

  const [controlMode, setControlMode] = useState('player')

  return (
    <>
      {hasControl && !paused && !isTouch && <div className="crosshair" />}

      {paused && (
        <div className="pause-overlay">
          <div className="pause-panel">
            <h1 className="pause-title">PAUSE</h1>

            <div className="pause-setting">
              <span>SENSIBILITÉ</span>
              <input
                type="range"
                min="0.001"
                max="0.02"
                step="0.001"
                value={sensitivity}
                onChange={(e) => setSensitivity(parseFloat(e.target.value))}
              />
            </div>

            <div className="pause-actions">
              <button className="btn primary" onClick={resume}>Reprendre</button>
              <button className="btn" onClick={goMainMenu}>Menu principal</button>
              <button className="btn ghost" onClick={restart}>Restart</button>
            </div>
          </div>
        </div>
      )}

      {/* HUD PC uniquement */}
      {!isTouch && !paused && hasControl && (
        <div className="hud">
          {/* ton HUD ici */}
        </div>
      )}

      {/* HUD Mobile : seulement si MobileControls existe */}
      {/* {isTouch && !paused && (
        <MobileControls touchRef={touchRef} mode={controlMode} />
      )} */}

      <Canvas
        ref={canvasRef}
        shadows
        gl={{ antialias: true }}
        camera={{ position: [0, 5, 20], fov: 60 }}
      >
        <color attach="background" args={['#2c8cf3ff']} />

        <ambientLight intensity={0.55} color="#e6f1ff" />
        <directionalLight position={[10, 80, 10]} intensity={1.25} color="#fff4e0" castShadow />
        <directionalLight position={[-30, 20, -20]} intensity={0.35} color="#d9e6ff" />

        <PerformanceMonitor />
        <AdaptiveDpr />

        <WorldColliders onReady={setWorldColliders} />

        <Map />

        <Player
          ref={playerRef}
          paused={paused}
          sensitivity={sensitivity}
          onInputChange={setInputState}
          controlMode={controlMode}
          setControlMode={setControlMode}
          groundColliders={worldColliders.ground}
          touchRef={isTouch ? touchRef : null}
        />

        <Car
          ref={carRef}
          position={[78, 5, 2]}
          enabled={controlMode === 'car'}
          setControlMode={setControlMode}
          groundColliders={worldColliders.ground}
          wallColliders={worldColliders.walls}
          touchRef={isTouch ? touchRef : null}
        />

        <Stats />
      </Canvas>
    </>
  )
}
