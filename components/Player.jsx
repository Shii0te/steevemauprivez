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
        touchRef = null
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
        // garde clone ici (hit.face.normal est en local)
        return hit.face.normal
            .clone()
            .transformDirection(hit.object.matrixWorld)
            .normalize()
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

            if (e.code === 'KeyE') {
                if (controlMode !== 'player') return
                const car = scene.getObjectByName('CarRoot')
                if (!car) return

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

                carCamPitch.current = Math.max(
                    CAR_CAM_MIN_PITCH,
                    Math.min(CAR_CAM_MAX_PITCH, carCamPitch.current)
                )
                return
            }

            yaw.current -= e.movementX * sensitivity
            pitch.current -= e.movementY * sensitivity
            pitch.current = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch.current))
        }

        const onDown = (e) => {
            if (paused) return

            if (e.button === 0) {
                onInputChange?.((prev) => ({ ...prev, mouseLeft: true }))
            }
            if (e.button === 2) {
                onInputChange?.((prev) => ({ ...prev, mouseRight: true }))
            }
        }

        const onUp = (e) => {
            if (e.button === 0) {
                onInputChange?.((prev) => ({ ...prev, mouseLeft: false }))
            }
            if (e.button === 2) {
                onInputChange?.((prev) => ({ ...prev, mouseRight: false }))
            }
        }

        const onContextMenu = (e) => {
            // évite le menu clic droit pendant le jeu
            e.preventDefault()
        }

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
            if (obj.name.startsWith('Cube018')) {
                colliders.push(obj)
            }
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

        // --- LOOK mobile (caméra) ---
        if (t && (t.lookDX !== 0 || t.lookDY !== 0)) {
            if (controlMode === 'car') {
                carCamYaw.current -= t.lookDX * sensitivity
                carCamPitch.current -= t.lookDY * sensitivity

                carCamPitch.current = Math.max(
                    CAR_CAM_MIN_PITCH,
                    Math.min(CAR_CAM_MAX_PITCH, carCamPitch.current)
                )
            } else {
                yaw.current -= t.lookDX * sensitivity
                pitch.current -= t.lookDY * sensitivity
                pitch.current = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch.current))
            }

            // ✅ très important : on consomme le delta
            t.lookDX = 0
            t.lookDY = 0
        }

        // --- INTERACT mobile (front montant) ---
        const risingInteract = !!(t && t.interact && !prevInteract.current)
        if (t) prevInteract.current = t.interact

        // Sortir de la voiture
        if (controlMode === 'car' && risingInteract) {
            setControlMode('player')
        }




        // ========= CAR CAMERA =========
        if (controlMode === 'car' && carRef.current) {
            const car = carRef.current

            // forward voiture
            vCarForward.current.set(0, 0, 1).applyQuaternion(car.quaternion)

            const distance = 7
            const height = 2.6

            const carSpeed = car.userData?.speed || 0
            if (Math.abs(carSpeed) > 0.2) {
                carCamYaw.current = THREE.MathUtils.lerp(
                    carCamYaw.current,
                    0,
                    delta * CAR_CAM_RETURN_SPEED
                )
            }

            // base offset derrière + hauteur
            vBaseOffset.current.copy(vCarForward.current).multiplyScalar(-distance)
            vBaseOffset.current.y += height

            // orbit yaw autour du Y global
            vBaseOffset.current.applyAxisAngle(UP.current, carCamYaw.current)

            // pitch autour de l’axe right voiture
            vCarRight.current.set(-1, 0, 0).applyQuaternion(car.quaternion)
            vBaseOffset.current.applyAxisAngle(vCarRight.current, carCamPitch.current)

            vTargetPos.current.copy(car.position).add(vBaseOffset.current)
            camera.position.lerp(vTargetPos.current, delta * 8)

            carCamLook.current.copy(car.position)
            carCamLook.current.y += 1.1
            camera.lookAt(carCamLook.current)
            return
        }

        if (controlMode !== 'player') return

        visualOffset.current.set(0, 0, 0)

        // rotation FPS
        camera.rotation.order = 'YXZ'
        camera.rotation.y = yaw.current
        camera.rotation.x = pitch.current

        // forward/right (réutilisés)
        vForward.current.set(Math.sin(yaw.current), 0, Math.cos(yaw.current)).negate()
        vRight.current.set(Math.cos(yaw.current), 0, -Math.sin(yaw.current))


        if (t) {
            // joystick : y négatif = vers le haut de l’écran
            keys.current.forward = t.moveY < -0.25
            keys.current.backward = t.moveY > 0.25
            keys.current.left = t.moveX < -0.25
            keys.current.right = t.moveX > 0.25

            isRunning.current = !!t.sprint

            // Jump
            if (t.jump && isGrounded.current) {
                velocityY.current = JUMP_FORCE
                isGrounded.current = false
                t.jump = false // ✅ consomme le saut
            }


            if (risingInteract) {
                const car = scene.getObjectByName('CarRoot')
                if (car && camera.position.distanceTo(car.position) < 2) {
                    setControlMode('car')
                }
            }


        }

        // move dir
        vMoveDir.current.set(0, 0, 0)
        if (keys.current.forward) vMoveDir.current.add(vForward.current)
        if (keys.current.backward) vMoveDir.current.sub(vForward.current)
        if (keys.current.left) vMoveDir.current.sub(vRight.current)
        if (keys.current.right) vMoveDir.current.add(vRight.current)

        // prépare wallObjects UNE fois par frame (au lieu de le refaire dans la boucle)
        const wallObjects = [bordersRef.current, ...buildingColliders.current].filter(Boolean)

        if (vMoveDir.current.lengthSq() > 0) {
            vMoveDir.current.normalize()

            const moveSpeed = (isRunning.current ? RUN_SPEED : WALK_SPEED) * (delta * 60)

            let remaining = moveSpeed
            vCurrentDir.current.copy(vMoveDir.current).normalize()

            while (remaining > EPS) {
                const step = Math.min(remaining, MAX_STEP_DISTANCE)

                // origine ray mur
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

        // --- Raycast sol ---
        vRayOrigin.current.copy(camera.position)
        vRayOrigin.current.y += 0.3 // un peu plus haut, plus stable

        raycaster.current.set(vRayOrigin.current, DOWN.current)

        // fallback si pas encore prêt (évite chute au spawn)
        const groundTargets = (groundColliders && groundColliders.length > 0)
            ? groundColliders
            : scene.children

        const hits = raycaster.current
            .intersectObjects(groundTargets, true)
            .sort((a, b) => a.distance - b.distance)

        if (hits.length > 0) {
            const groundY = hits[0].point.y + PLAYER_HEIGHT
            const distanceToGround = camera.position.y - groundY

            // snap sol (tolérance)
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


        // --- HEAD BOB (offset visuel) ---
        const isMoving =
            keys.current.forward ||
            keys.current.backward ||
            keys.current.left ||
            keys.current.right

        visualOffset.current.set(0, 0, 0)

        if (isMoving && isGrounded.current) {
            const bobSpeed = isRunning.current ? 14 : 10
            const bobAmount = isRunning.current ? 0.05 : 0.035

            headBobTime.current += delta * bobSpeed

            // Y uniquement vers le haut (évite de "pousser" sous le sol)
            visualOffset.current.y = Math.max(0, Math.sin(headBobTime.current * 2) * bobAmount)

            visualOffset.current.x = Math.cos(headBobTime.current) * bobAmount * 0.15
        } else {
            headBobTime.current = 0
        }

        // applique l'offset visuel
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
