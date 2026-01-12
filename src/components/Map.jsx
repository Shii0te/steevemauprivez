import { useGLTF } from '@react-three/drei'
import { useEffect } from 'react'
import * as THREE from 'three'

export function Map() {
  const gltf = useGLTF('/iut-v1.glb')
  useGLTF.preload('/iut-v1.glb')

  useEffect(() => {
    gltf.scene.traverse((obj) => {
      if (!obj.isMesh) return

      // --- Ombres ---
      obj.castShadow = true
      obj.receiveShadow = true

      // SOL
      if (
        obj.isMesh &&
        obj.name &&
        obj.name.toLowerCase().includes('sol')
      ) {
        obj.userData.isGround = true
      }

      // MURS / BÂTIMENTS
      if (obj.name.startsWith('hitbox-') ) {
        obj.userData.isCollider = true
        obj.visible = false
      }
      if (obj.name.startsWith('Cube018')) {
        obj.userData.isCollider = true
      } 

      // --- Stylisation cartoon ---
      if (obj.material) {
        obj.material.roughness = 0.9
        obj.material.metalness = 0
        obj.material.toneMapped = true
      }

      // --- Fake AO sur les troncs ---
      if (
        obj.material &&
        obj.name &&
        obj.name.toLowerCase().includes('tronc')
      ) {
        obj.material.emissive = new THREE.Color('#000000')
        obj.material.emissiveIntensity = 0.15
      }

      // --- Variation de verts pour le sol ---
      if (
        obj.material &&
        obj.name &&
        obj.name.toLowerCase().includes('sol')
      ) {
        const baseColor = new THREE.Color(obj.material.color)
        const hsl = {}
        baseColor.getHSL(hsl)

        hsl.h += (Math.random() - 0.5) * 0.03
        hsl.l += (Math.random() - 0.5) * 0.05

        obj.material.color.setHSL(hsl.h, hsl.s, hsl.l)
      }
    })
  }, [gltf])

  return <primitive object={gltf.scene} />
}
