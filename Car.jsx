import { useRef, useEffect, forwardRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

export const Car = forwardRef(function Car(
  {
    position = [80, 10, 5],
    wallColliders = [],
    enabled = false,
    setControlMode
  },
  ref
) {
  const { scene: worldScene, camera } = useThree()

  const carRef = useRef()

  const { scene } = useGLTF('/car.glb')

  /* ---------- PHYSIQUE SOL ---------- */
  const isGrounded = useRef(false)

  const RIDE_HEIGHT = 0.6
  const DOWN = new THREE.Vector3(0, -1, 0)

  /* ---------- ÉTATS VOITURE ---------- */
  const speed = useRef(0)
  const steer = useRef(0)
  const drift = useRef(0)
  const raycaster = useRef(new THREE.Raycaster())

  const yawQuat = new THREE.Quaternion()
  const slopeQuat = new THREE.Quaternion()
  const finalQuat = new THREE.Quaternion()

  /* ---------- COLLIDERS ---------- */
  const BOUNCE_FORCE = 0.6
  const PUSH_BACK = 0.15
  const WALL_COOLDOWN = 0.15
  const lastWallHit = useRef(0)

  /* ---------- INPUT ---------- */
  const input = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
    drift: false,
    boost: false
  })

  /* ---------- RAYCAST ROUES ---------- */
  const wheelRayPoints = [
    new THREE.Vector3(-0.7, 0, -1.5),
    new THREE.Vector3(0.7, 0, -1.5),
    new THREE.Vector3(0.0, 0, 1.3)
  ]
  const wheelRay = useRef(new THREE.Raycaster())
  const RAY_LENGTH = 2.5

  const yaw = useRef(0)

  /* ---------- BOOST + FOV ---------- */
  const BOOST_MULTIPLIER = 1.8
  const BOOST_TURN_MULT = 1.3

  const BASE_FOV = 60
  const BOOST_FOV = 72
  const FOV_LERP_SPEED = 10

  /* ---------- SETUP ---------- */
  useEffect(() => {
    if (!scene) return

    scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true
        obj.receiveShadow = true
      }
    })
  }, [scene])

  /* ---------- INPUT CLAVIER / SOURIS ---------- */
  useEffect(() => {
    const down = (e) => {
      if (!enabled) return

      if (e.code === 'KeyW' || e.code === 'KeyZ') input.current.forward = true
      if (e.code === 'KeyS') input.current.backward = true
      if (e.code === 'KeyA' || e.code === 'KeyQ') input.current.left = true
      if (e.code === 'KeyD') input.current.right = true
      if (e.code === 'ShiftLeft') input.current.drift = true

      if (e.code === 'KeyE') {
        speed.current = 0
        steer.current = 0
        drift.current = 0
        input.current.boost = false
        setControlMode('player')
      }
    }

    const up = (e) => {
      if (!enabled) return

      if (e.code === 'KeyW' || e.code === 'KeyZ') input.current.forward = false
      if (e.code === 'KeyS') input.current.backward = false
      if (e.code === 'KeyA' || e.code === 'KeyQ') input.current.left = false
      if (e.code === 'KeyD') input.current.right = false
      if (e.code === 'ShiftLeft') input.current.drift = false
    }

    const mouseDown = (e) => {
      if (!enabled) return
      if (e.button === 0) input.current.boost = true
      e.preventDefault()
    }

    const mouseUp = (e) => {
      if (!enabled) return
      if (e.button === 0) input.current.boost = false
    }

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('mousedown', mouseDown)
    window.addEventListener('mouseup', mouseUp)

    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('mousedown', mouseDown)
      window.removeEventListener('mouseup', mouseUp)
    }
  }, [enabled, setControlMode])

  /* ---------- LOOP ---------- */
  useFrame((_, delta) => {
    if (!carRef.current || !enabled) return

    /* ----- SOL PAR 3 RAYS ----- */
    let groundedCount = 0
    let avgGroundY = 0
    const groundNormals = []

    wheelRay.current.far = RAY_LENGTH

    wheelRayPoints.forEach((localPoint) => {
      const worldPoint = localPoint.clone().applyMatrix4(carRef.current.matrixWorld)
      wheelRay.current.set(worldPoint, DOWN)

      const hits = wheelRay.current
        .intersectObjects(worldScene.children, true)
        .filter((hit) => !carRef.current.getObjectById(hit.object.id))

      if (hits.length > 0) {
        groundedCount++
        avgGroundY += hits[0].point.y

        if (hits[0].face) {
          const normal = hits[0].face.normal
            .clone()
            .transformDirection(hits[0].object.matrixWorld)
            .normalize()
          groundNormals.push(normal)
        }
      }
    })

    if (groundedCount > 0) {
      avgGroundY /= groundedCount
      const targetY = avgGroundY + RIDE_HEIGHT

      carRef.current.position.y = THREE.MathUtils.lerp(
        carRef.current.position.y,
        targetY,
        0.2
      )

      isGrounded.current = true
    } else {
      isGrounded.current = false
    }

    /* ----- ORIENTATION PENTE + YAW ----- */
    if (groundNormals.length > 0) {
      const avgNormal = groundNormals
        .reduce((a, b) => a.add(b), new THREE.Vector3())
        .normalize()

      slopeQuat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), avgNormal)
      yawQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw.current)

      finalQuat.copy(yawQuat).multiply(slopeQuat)
      carRef.current.quaternion.slerp(finalQuat, 0.15)
    }

    /* ----- COLLISION AVANT + REBOND ----- */
    let canMove = true

    const forwardDir = new THREE.Vector3(0, 0, -1).applyQuaternion(carRef.current.quaternion)
    raycaster.current.set(carRef.current.position, forwardDir)
    const wallHits = raycaster.current.intersectObjects(wallColliders, true)

    if (wallHits.length && wallHits[0].distance < 1.4) {
      const now = performance.now() / 1000
      if (now - lastWallHit.current > WALL_COOLDOWN) {
        lastWallHit.current = now

        const hit = wallHits[0]
        const normal = hit.face.normal
          .clone()
          .transformDirection(hit.object.matrixWorld)
          .normalize()

        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(carRef.current.quaternion).normalize()
        const reflected = forward.clone().reflect(normal)

        const angle = Math.atan2(reflected.x, reflected.z)
        yaw.current = -angle

        carRef.current.position.addScaledVector(normal, PUSH_BACK)
        speed.current *= -BOUNCE_FORCE
      }

      canMove = false
    }

    /* ----- VITESSE + BOOST ----- */
    let baseSpeed = 0
    if (input.current.forward) baseSpeed = 6
    if (input.current.backward) baseSpeed = -3

    const boostFactor = input.current.boost ? BOOST_MULTIPLIER : 1

    speed.current = THREE.MathUtils.lerp(
      speed.current,
      baseSpeed * boostFactor,
      delta * 2
    )

    /* ----- FOV BOOST ----- */
    const targetFov = input.current.boost ? BOOST_FOV : BASE_FOV
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, delta * FOV_LERP_SPEED)
    camera.updateProjectionMatrix()

    /* ----- DIRECTION ----- */
    let steerTarget = 0
    if (input.current.left) steerTarget = 1
    if (input.current.right) steerTarget = -1

    steer.current = THREE.MathUtils.lerp(steer.current, steerTarget, delta * 6)

    if (input.current.drift) {
      drift.current = THREE.MathUtils.lerp(drift.current, steer.current, delta * 3)
    } else {
      drift.current = THREE.MathUtils.lerp(drift.current, 0, delta * 5)
    }

    /* ----- ROTATION ----- */
    const turnBoost = input.current.boost ? BOOST_TURN_MULT : 1
    yaw.current += (steer.current + drift.current) * delta * speed.current * 0.15 * turnBoost

    /* ----- DÉPLACEMENT ----- */
    if (isGrounded.current && canMove) {
      carRef.current.translateZ(speed.current * delta)
    }

    carRef.current.userData.speed = speed.current
  })

  return (
    <group
      ref={(el) => {
        carRef.current = el
        if (typeof ref === 'function') ref(el)
        else if (ref) ref.current = el
      }}
      name="CarRoot"
      position={position}
    >
      <mesh visible={false} position={[0, 0.5, 0]}>
        <boxGeometry args={[1.8, 1, 3.6]} />
        <meshBasicMaterial wireframe />
      </mesh>

      <primitive object={scene} rotation={[0, Math.PI, 0]} />
    </group>
  )
})

useGLTF.preload('/car.glb')
