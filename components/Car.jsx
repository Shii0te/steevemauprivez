import { useRef, useEffect, forwardRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

export const Car = forwardRef(function Car(
    {
        position = [80, 10, 5],
        wallColliders = [],
        groundColliders = [],
        enabled = false,
        setControlMode,
        touchRef = null
    },
    ref
) {
    const { scene: worldScene, camera } = useThree()

    const carRef = useRef(null)
    const { scene } = useGLTF('/car.glb')

    /* ---------- PHYSIQUE SOL ---------- */
    const isGrounded = useRef(false)
    const RIDE_HEIGHT = 0.6
    const DOWN = useRef(new THREE.Vector3(0, -1, 0))
    const UP = useRef(new THREE.Vector3(0, 1, 0))

    /* ---------- ÉTATS VOITURE ---------- */
    const speed = useRef(0)
    const steer = useRef(0)
    const drift = useRef(0)
    const yaw = useRef(0)
    const prevInteract = useRef(false)


    /* ---------- RAYCAST ---------- */
    const wheelRay = useRef(new THREE.Raycaster())
    const wallRay = useRef(new THREE.Raycaster())

    // IMPORTANT : plus “safe” que 2.5 si tu spawns haut
    const RAY_LENGTH = 50

    const wheelRayPoints = useRef([
        new THREE.Vector3(-0.8, 0, -1.5), // FL
        new THREE.Vector3(0.8, 0, -1.5), // FR
        new THREE.Vector3(-0.8, 0, 1.4), // RL
        new THREE.Vector3(0.8, 0, 1.4)  // RR
    ])

    const RAY_START_Y = 1.0 // démarre le rayon au-dessus de la voiture

    /* ---------- QUATS + VECTEURS TEMP ---------- */
    const yawQuat = useRef(new THREE.Quaternion())
    const slopeQuat = useRef(new THREE.Quaternion())
    const finalQuat = useRef(new THREE.Quaternion())

    const vWorldPoint = useRef(new THREE.Vector3())
    const vForward = useRef(new THREE.Vector3())
    const vAvgNormal = useRef(new THREE.Vector3())
    const vHitNormal = useRef(new THREE.Vector3())
    const vForward2 = useRef(new THREE.Vector3())
    const vReflected = useRef(new THREE.Vector3())
    

    /* ---------- COLLISION ---------- */
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

    /* ---------- BOOST + FOV ---------- */
    const BOOST_MULTIPLIER = 1.8
    const BOOST_TURN_MULT = 1.3
    const BASE_FOV = 60
    const BOOST_FOV = 72
    const FOV_LERP_SPEED = 10

    /* ---------- SOL MOYEN POUR SPAWN ---------- */
    const lastGround = useRef({
        avgGroundY: position[1],
        normals: [new THREE.Vector3(0, 1, 0)]
    })


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
                setControlMode?.('player')
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

        // const t = touchRef?.current
        if (t) {
            input.current.forward = t.moveY < -0.25
            input.current.backward = t.moveY > 0.25
            input.current.left = t.moveX < -0.25
            input.current.right = t.moveX > 0.25

            input.current.boost = !!t.boost
            input.current.drift = !!t.drift

            // Sortir voiture (front montant)
            const rising = t.interact && !prevInteract.current
            prevInteract.current = t.interact

            if (rising) {
                speed.current = 0
                steer.current = 0
                drift.current = 0
                input.current.boost = false
                setControlMode?.('player')
            }
        }


        // ----- MOBILE (lecture temps réel) -----
        const t = touchRef?.current
        if (t) {
            input.current.forward = t.moveY < -0.25
            input.current.backward = t.moveY > 0.25
            input.current.left = t.moveX < -0.25
            input.current.right = t.moveX > 0.25
            input.current.boost = !!t.boost
            input.current.drift = !!t.drift

            // Interact : sortie voiture (front montant)
            const rising = t.interact && !prevInteract.current
            prevInteract.current = t.interact
            if (rising) setControlMode?.('player')
        }


        // ✅ Sol : ancien fonctionnement robuste (fallback)
        const groundTargets =
            groundColliders && groundColliders.length > 0
                ? groundColliders
                : worldScene.children

        // ----- SOL PAR 4 RAYS -----
        let groundedCount = 0
        let sumGroundY = 0
        const groundNormals = []

        wheelRay.current.far = RAY_LENGTH

        const pts = wheelRayPoints.current
        for (let i = 0; i < pts.length; i++) {
            vWorldPoint.current.copy(pts[i]).applyMatrix4(carRef.current.matrixWorld)
            vWorldPoint.current.y += RAY_START_Y
            wheelRay.current.set(vWorldPoint.current, DOWN.current)

            const hits = wheelRay.current
                .intersectObjects(groundTargets, true)
                .filter((hit) => !carRef.current.getObjectById(hit.object.id))
                .sort((a, b) => a.distance - b.distance)

            if (hits.length > 0) {
                groundedCount++
                sumGroundY += hits[0].point.y

                if (hits[0].face) {
                    const n = hits[0].face.normal
                        .clone()
                        .transformDirection(hits[0].object.matrixWorld)
                        .normalize()
                    groundNormals.push(n)
                }
            }
        }

        // --- met à jour le "last good ground" ---
        if (groundedCount > 0) {
            const avgY = sumGroundY / groundedCount
            lastGround.current.avgGroundY = avgY
            if (groundNormals.length > 0) lastGround.current.normals = groundNormals
        }

        // --- valeurs à utiliser même si une frame loupe ---
        const usedY =
            groundedCount > 0 ? (sumGroundY / groundedCount) : lastGround.current.avgGroundY

        const usedNormals =
            groundNormals.length > 0 ? groundNormals : lastGround.current.normals

        // --- applique la hauteur ---
        if (groundedCount > 0) {
            const targetY = usedY + RIDE_HEIGHT
            carRef.current.position.y = THREE.MathUtils.lerp(carRef.current.position.y, targetY, 0.2)
            isGrounded.current = true
        } else {
            // si tu veux que la voiture puisse quand même avancer même si 1 frame loupe :
            // isGrounded.current = true
            // sinon (strict) :
            isGrounded.current = false
        }

        // ----- ORIENTATION PENTE + YAW (avec fallback) -----
        if (usedNormals && usedNormals.length > 0) {
            vAvgNormal.current.set(0, 0, 0)
            for (let i = 0; i < usedNormals.length; i++) vAvgNormal.current.add(usedNormals[i])
            vAvgNormal.current.normalize()

            slopeQuat.current.setFromUnitVectors(UP.current, vAvgNormal.current)
            yawQuat.current.setFromAxisAngle(UP.current, yaw.current)

            finalQuat.current.copy(yawQuat.current).multiply(slopeQuat.current)
            carRef.current.quaternion.slerp(finalQuat.current, 0.15)
        }


        /* ----- COLLISION AVANT + REBOND ----- */
        let canMove = true

        vForward.current.set(0, 0, -1).applyQuaternion(carRef.current.quaternion)
        wallRay.current.set(carRef.current.position, vForward.current)

        const wallHits = wallRay.current.intersectObjects(wallColliders, true)

        if (wallHits.length && wallHits[0].distance < 1.4) {
            const now = performance.now() / 1000
            if (now - lastWallHit.current > WALL_COOLDOWN) {
                lastWallHit.current = now

                const hit = wallHits[0]
                if (hit.face) {
                    vHitNormal.current
                        .copy(hit.face.normal)
                        .transformDirection(hit.object.matrixWorld)
                        .normalize()

                    vForward2.current.set(0, 0, -1).applyQuaternion(carRef.current.quaternion).normalize()
                    vReflected.current.copy(vForward2.current).reflect(vHitNormal.current)

                    const angle = Math.atan2(vReflected.current.x, vReflected.current.z)
                    yaw.current = -angle

                    carRef.current.position.addScaledVector(vHitNormal.current, PUSH_BACK)
                    speed.current *= -BOUNCE_FORCE
                }
            }
            canMove = false
        }

        /* ----- VITESSE + BOOST ----- */
        let baseSpeed = 0
        if (input.current.forward) baseSpeed = 6
        if (input.current.backward) baseSpeed = -3

        const boostFactor = input.current.boost ? BOOST_MULTIPLIER : 1
        speed.current = THREE.MathUtils.lerp(speed.current, baseSpeed * boostFactor, delta * 2)

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
