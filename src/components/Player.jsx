import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import * as THREE from 'three'

export const Player = forwardRef(function Player(
  {
    paused,
    sensitivity,
    onInputChange,
    controlMode,
    setControlMode,
    groundColliders = [],
    touchRef = null,
    exitCarPoseRef = null,
    onCarProximityChange
  },
  ref
) {
  // ⚠️ Important perf : pas de new Vector3 à chaque render
  const SPAWN_POSITION = useRef(new THREE.Vector3(80, 10, 2))

  const { camera, scene } = useThree()

  const velocityY = useRef(0)
  const raycaster = useRef(new THREE.Raycaster())
  const wallRaycaster = useRef(new THREE.Raycaster())

  // Vecteurs constants réutilisables
  const DOWN = useRef(new THREE.Vector3(0, -1, 0))
  const UP = useRef(new THREE.Vector3(0, 1, 0))

  // Vecteurs temporaires réutilisables (évite GC)
  const vForward = useRef(new THREE.Vector3())
  const vRight = useRef(new THREE.Vector3())
  const vMoveDir = useRef(new THREE.Vector3())
  const vCurrentDir = useRef(new THREE.Vector3())
  const vWallOrigin = useRef(new THREE.Vector3())
  const vRayOrigin = useRef(new THREE.Vector3())
  const vCarForward = useRef(new THREE.Vector3())
  const vBaseOffset = useRef(new THREE.Vector3())
  const vCarRight = useRef(new THREE.Vector3())
  const vTargetPos = useRef(new THREE.Vector3())
  const vTmp = useRef(new THREE.Vector3())
  const vDirTmp = useRef(new THREE.Vector3()) // ✅ pour testPointFree (évite le bug du dirs)
  const prevInteract = useRef(false)

  const GRAVITY = 30
  const PLAYER_HEIGHT = 1.6
  const MAX_FALL_SPEED = 50

  const keys = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false
  })

  const yaw = useRef(0)
  const pitch = useRef(0)

  const WALK_SPEED = 0.1
  const RUN_SPEED = 0.18
  const isRunning = useRef(false)

  const MAX_PITCH = Math.PI / 2 - 0.01

  /* ---------- Saut ---------- */
  const isGrounded = useRef(false)
  const JUMP_FORCE = 10

  /* ---------- Collision ---------- */
  const WALL_DISTANCE = 1.5
  const MAX_STEP_DISTANCE = 0.25
  const EPS = 1e-4
  const MAX_SLIDE_ITER = 3

  function getWallNormal(hit) {
    if (!hit.face) return null
    return hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
  }

  const buildingColliders = useRef([])

  // --- Head bobbing ---
  const headBobTime = useRef(0)
  const visualOffset = useRef(new THREE.Vector3())

  // --- FOV ---
  const baseFov = useRef(60)
  const targetFov = useRef(60)

  // --- SWAY ---
  const sway = useRef(0)

  // --- Car camera ---
  const carCamLook = useRef(new THREE.Vector3())
  const carRef = useRef(null)

  const carCamYaw = useRef(0)
  const carCamPitch = useRef(-0.25)
  const CAR_CAM_MAX_PITCH = 0.35
  const CAR_CAM_MIN_PITCH = -0.6
  const CAR_CAM_RETURN_SPEED = 1.5

  // proximité voiture
  const nearCarRef = useRef(false)
  const lastCarCheck = useRef(0)

  useEffect(() => {
    carRef.current = scene.getObjectByName('CarRoot')
  }, [scene])

  /* ---------- Réinitialisation position ---------- */
  useImperativeHandle(ref, () => ({
    reset() {
      camera.position.copy(SPAWN_POSITION.current)
      velocityY.current = 0
      yaw.current = 0
      pitch.current = 0
      camera.rotation.set(0, 0, 0)
    }
  }))

  /* ---------- Clavier ---------- */
  useEffect(() => {
    const down = (e) => {
      if (e.code === 'Space') e.preventDefault()

      if (e.code === 'KeyW' || e.code === 'KeyZ') keys.current.forward = true
      if (e.code === 'KeyS') keys.current.backward = true
      if (e.code === 'KeyA' || e.code === 'KeyQ') keys.current.left = true
      if (e.code === 'KeyD') keys.current.right = true

      if (e.code === 'Space' && isGrounded.current) {
        velocityY.current = JUMP_FORCE
        isGrounded.current = false
      }

      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') isRunning.current = true

      // ✅ entrée voiture (PC) : gérée ici, sortie gérée dans Car
      if (e.code === 'KeyE') {
        if (controlMode !== 'player') return
        const car = carRef.current || scene.getObjectByName('CarRoot')
        if (!car) return
        carRef.current = car

        const dist = camera.position.distanceTo(car.position)
        if (dist < 2) setControlMode('car')
      }

      onInputChange?.({
        forward: keys.current.forward,
        backward: keys.current.backward,
        left: keys.current.left,
        right: keys.current.right,
        sprint: isRunning.current,
        jump: e.code === 'Space'
      })
    }

    const up = (e) => {
      if (e.code === 'KeyW' || e.code === 'KeyZ') keys.current.forward = false
      if (e.code === 'KeyS') keys.current.backward = false
      if (e.code === 'KeyA' || e.code === 'KeyQ') keys.current.left = false
      if (e.code === 'KeyD') keys.current.right = false
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') isRunning.current = false

      onInputChange?.({
        forward: keys.current.forward,
        backward: keys.current.backward,
        left: keys.current.left,
        right: keys.current.right,
        sprint: isRunning.current,
        jump: false
      })
    }

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [controlMode, setControlMode, scene, onInputChange])

  const bordersRef = useRef(null)
  useEffect(() => {
    bordersRef.current = scene.getObjectByName('bordures')
  }, [scene])

  /* ---------- Souris ---------- */
  useEffect(() => {
    const move = (e) => {
      if (paused) return

      if (controlMode === 'car') {
        carCamYaw.current -= e.movementX * sensitivity
        carCamPitch.current -= e.movementY * sensitivity
        carCamPitch.current = Math.max(CAR_CAM_MIN_PITCH, Math.min(CAR_CAM_MAX_PITCH, carCamPitch.current))
        return
      }

      yaw.current -= e.movementX * sensitivity
      pitch.current -= e.movementY * sensitivity
      pitch.current = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch.current))
    }

    const onDown = (e) => {
      if (paused) return
      if (e.button === 0) onInputChange?.((prev) => ({ ...prev, mouseLeft: true }))
      if (e.button === 2) onInputChange?.((prev) => ({ ...prev, mouseRight: true }))
    }

    const onUp = (e) => {
      if (e.button === 0) onInputChange?.((prev) => ({ ...prev, mouseLeft: false }))
      if (e.button === 2) onInputChange?.((prev) => ({ ...prev, mouseRight: false }))
    }

    const onContextMenu = (e) => e.preventDefault()

    window.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('contextmenu', onContextMenu)
    window.addEventListener('mousemove', move)

    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('mousemove', move)
    }
  }, [paused, sensitivity, controlMode, onInputChange])

  /* ---------- Spawn ---------- */
  useEffect(() => {
    camera.position.copy(SPAWN_POSITION.current)
  }, [camera])

  /* ---------- Colliders bâtiments ---------- */
  useEffect(() => {
    const colliders = []
    scene.traverse((obj) => {
      if (obj.name.startsWith('hitbox-')) {
        colliders.push(obj)
        obj.visible = false
      }
      if (obj.name.startsWith('Cube018')) colliders.push(obj)
    })
    buildingColliders.current = colliders
  }, [scene])

  /* ---------- FOV initial ---------- */
  useEffect(() => {
    baseFov.current = camera.fov
    targetFov.current = camera.fov
  }, [camera])

  /* ---------- Loop ---------- */
  useFrame((_, delta) => {
    if (paused) return

    const t = touchRef?.current || null

    // --- EXIT CAR : replace le joueur à côté de la voiture (anti-wall glitch) ---
    if (controlMode === 'player' && exitCarPoseRef?.current) {
      const pose = exitCarPoseRef.current
      exitCarPoseRef.current = null

      const wallObjects = [bordersRef.current, ...buildingColliders.current].filter(Boolean)

      const carRight = vTmp.current.set(1, 0, 0).applyQuaternion(pose.quaternion)
      carRight.y = 0
      if (carRight.lengthSq() > 0) carRight.normalize()

      const carFwd = vMoveDir.current.set(0, 0, 1).applyQuaternion(pose.quaternion)
      carFwd.y = 0
      if (carFwd.lengthSq() > 0) carFwd.normalize()

      const EXIT_RADIUS = 0.6
      const EXIT_RAY = 0.9

      const testPointFree = (p) => {
        if (wallObjects.length === 0) return true

        vWallOrigin.current.copy(p)
        vWallOrigin.current.y -= PLAYER_HEIGHT * 0.5

        const dirList = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1]
        ]

        for (const [dx, dz] of dirList) {
          vDirTmp.current.set(dx, 0, dz)
          wallRaycaster.current.set(vWallOrigin.current, vDirTmp.current)
          wallRaycaster.current.far = EXIT_RAY
          const hits = wallRaycaster.current.intersectObjects(wallObjects, true)
          if (hits.length && hits[0].distance < EXIT_RADIUS) return false
        }
        return true
      }

      const tries = [
        { r: 2.0, f: 0.0 },
        { r: -2.0, f: 0.0 },
        { r: 0.0, f: -3.0 },
        { r: 0.0, f: 3.0 },
        { r: 1.6, f: -1.6 },
        { r: -1.6, f: -1.6 }
      ]

      let chosen = null
      for (const tr of tries) {
        vTargetPos.current.copy(pose.position)
        vTargetPos.current.addScaledVector(carRight, tr.r)
        vTargetPos.current.addScaledVector(carFwd, tr.f)
        vTargetPos.current.y = pose.position.y + PLAYER_HEIGHT

        if (testPointFree(vTargetPos.current)) {
          chosen = vTargetPos.current.clone()
          break
        }
      }

      if (!chosen) {
        chosen = vTargetPos.current
          .copy(pose.position)
          .addScaledVector(carFwd, -3.0)
          .setY(pose.position.y + PLAYER_HEIGHT)
          .clone()
      }

      camera.position.copy(chosen)
      velocityY.current = 0
      isGrounded.current = false

      const hx = carFwd.x
      const hz = carFwd.z
      if (hx !== 0 || hz !== 0) {
        yaw.current = Math.atan2(-hx, -hz)
        pitch.current = 0
      }
    }

    // --- Proximité voiture (UI) ---
    if (controlMode === 'player') {
      lastCarCheck.current += delta
      if (lastCarCheck.current > 0.08) {
        lastCarCheck.current = 0

        const car = carRef.current || scene.getObjectByName('CarRoot')
        if (car) carRef.current = car

        const dist = car ? camera.position.distanceTo(car.position) : Infinity
        const isNear = dist < 2.4

        if (isNear !== nearCarRef.current) {
          nearCarRef.current = isNear
          onCarProximityChange?.(isNear)
        }
      }
    } else {
      if (nearCarRef.current) {
        nearCarRef.current = false
        onCarProximityChange?.(false)
      }
    }

    // --- LOOK mobile (caméra) ---
    if (t && (t.lookDX !== 0 || t.lookDY !== 0)) {
      if (controlMode === 'car') {
        carCamYaw.current -= t.lookDX * sensitivity
        carCamPitch.current -= t.lookDY * sensitivity
        carCamPitch.current = Math.max(CAR_CAM_MIN_PITCH, Math.min(CAR_CAM_MAX_PITCH, carCamPitch.current))
      } else {
        yaw.current -= t.lookDX * sensitivity
        pitch.current -= t.lookDY * sensitivity
        pitch.current = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch.current))
      }

      t.lookDX = 0
      t.lookDY = 0
    }

    // --- INTERACT mobile : uniquement pour ENTRER voiture (player) ---
    const risingInteract = !!(t && t.interact && !prevInteract.current)
    if (t) prevInteract.current = !!t.interact

    // ========= CAR CAMERA =========
    if (controlMode === 'car') {
      const car = carRef.current || scene.getObjectByName('CarRoot')
      if (car) carRef.current = car

      if (carRef.current) {
        const carObj = carRef.current

        vCarForward.current.set(0, 0, 1).applyQuaternion(carObj.quaternion)

        const distance = 7
        const height = 2.6

        const carSpeed = carObj.userData?.speed || 0
        if (Math.abs(carSpeed) > 0.2) {
          carCamYaw.current = THREE.MathUtils.lerp(carCamYaw.current, 0, delta * CAR_CAM_RETURN_SPEED)
        }

        vBaseOffset.current.copy(vCarForward.current).multiplyScalar(-distance)
        vBaseOffset.current.y += height

        vBaseOffset.current.applyAxisAngle(UP.current, carCamYaw.current)

        vCarRight.current.set(-1, 0, 0).applyQuaternion(carObj.quaternion)
        vBaseOffset.current.applyAxisAngle(vCarRight.current, carCamPitch.current)

        vTargetPos.current.copy(carObj.position).add(vBaseOffset.current)
        camera.position.lerp(vTargetPos.current, delta * 8)

        carCamLook.current.copy(carObj.position)
        carCamLook.current.y += 1.1
        camera.lookAt(carCamLook.current)
      }

      // ✅ IMPORTANT : sortie voiture gérée dans Car.jsx
      return
    }

    // ---- MODE PLAYER ----
    visualOffset.current.set(0, 0, 0)

    camera.rotation.order = 'YXZ'
    camera.rotation.y = yaw.current
    camera.rotation.x = pitch.current

    vForward.current.set(Math.sin(yaw.current), 0, Math.cos(yaw.current)).negate()
    vRight.current.set(Math.cos(yaw.current), 0, -Math.sin(yaw.current))

    if (t) {
      keys.current.forward = t.moveY < -0.25
      keys.current.backward = t.moveY > 0.25
      keys.current.left = t.moveX < -0.25
      keys.current.right = t.moveX > 0.25

      isRunning.current = !!t.sprint

      if (t.jump && isGrounded.current) {
        velocityY.current = JUMP_FORCE
        isGrounded.current = false
        t.jump = false
      }

      // ✅ ENTRER voiture (mobile)
      if (risingInteract) {
        const car = carRef.current || scene.getObjectByName('CarRoot')
        if (car) carRef.current = car

        if (car && camera.position.distanceTo(car.position) < 2) {
          setControlMode('car')
          t.interact = false
          prevInteract.current = false
        }
      }
    }

    // move dir
    vMoveDir.current.set(0, 0, 0)
    if (keys.current.forward) vMoveDir.current.add(vForward.current)
    if (keys.current.backward) vMoveDir.current.sub(vForward.current)
    if (keys.current.left) vMoveDir.current.sub(vRight.current)
    if (keys.current.right) vMoveDir.current.add(vRight.current)

    const wallObjects = [bordersRef.current, ...buildingColliders.current].filter(Boolean)

    if (vMoveDir.current.lengthSq() > 0) {
      vMoveDir.current.normalize()
      const moveSpeed = (isRunning.current ? RUN_SPEED : WALK_SPEED) * (delta * 60)

      let remaining = moveSpeed
      vCurrentDir.current.copy(vMoveDir.current).normalize()

      while (remaining > EPS) {
        const step = Math.min(remaining, MAX_STEP_DISTANCE)

        vWallOrigin.current.copy(camera.position)
        vWallOrigin.current.y -= PLAYER_HEIGHT * 0.5

        let blocked = false

        for (let iter = 0; iter < MAX_SLIDE_ITER; iter++) {
          if (wallObjects.length === 0) break

          wallRaycaster.current.set(vWallOrigin.current, vCurrentDir.current)
          const hits = wallRaycaster.current
            .intersectObjects(wallObjects, true)
            .sort((a, b) => a.distance - b.distance)

          if (hits.length > 0 && hits[0].distance < WALL_DISTANCE) {
            const n = getWallNormal(hits[0])
            if (!n) {
              blocked = true
              break
            }

            const slide = vTmp.current.copy(vCurrentDir.current).projectOnPlane(n)
            if (slide.lengthSq() < 0.0001) {
              blocked = true
              break
            }

            vCurrentDir.current.copy(slide.normalize())
            continue
          }

          break
        }

        if (blocked) break

        camera.position.addScaledVector(vCurrentDir.current, step)
        remaining -= step
      }
    }

    // gravité
    velocityY.current -= GRAVITY * delta
    velocityY.current = Math.max(velocityY.current, -MAX_FALL_SPEED)
    camera.position.y += velocityY.current * delta

    // sol
    vRayOrigin.current.copy(camera.position)
    vRayOrigin.current.y += 0.3

    raycaster.current.set(vRayOrigin.current, DOWN.current)

    const groundTargets = groundColliders && groundColliders.length > 0 ? groundColliders : scene.children

    const groundHits = raycaster.current
      .intersectObjects(groundTargets, true)
      .sort((a, b) => a.distance - b.distance)

    if (groundHits.length > 0) {
      const groundY = groundHits[0].point.y + PLAYER_HEIGHT
      const distanceToGround = camera.position.y - groundY

      if (distanceToGround <= 0.25 && velocityY.current <= 0) {
        camera.position.y = groundY
        velocityY.current = 0
        isGrounded.current = true
      } else {
        isGrounded.current = false
      }
    } else {
      isGrounded.current = false
    }

    // head bob
    const isMoving = keys.current.forward || keys.current.backward || keys.current.left || keys.current.right
    visualOffset.current.set(0, 0, 0)

    if (isMoving && isGrounded.current) {
      const bobSpeed = isRunning.current ? 14 : 10
      const bobAmount = isRunning.current ? 0.05 : 0.035

      headBobTime.current += delta * bobSpeed
      visualOffset.current.y = Math.max(0, Math.sin(headBobTime.current * 2) * bobAmount)
      visualOffset.current.x = Math.cos(headBobTime.current) * bobAmount * 0.15
    } else {
      headBobTime.current = 0
    }

    camera.position.add(visualOffset.current)

    // FOV
    targetFov.current = isRunning.current ? baseFov.current + 6 : baseFov.current
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov.current, delta * 15)
    camera.updateProjectionMatrix()

    // sway
    const swayTarget = (keys.current.right ? -1 : 0) + (keys.current.left ? 1 : 0)
    sway.current = THREE.MathUtils.lerp(sway.current, swayTarget, delta * 8)
    camera.rotation.z = sway.current * 0.04
  })

  return null
})
