import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import './FlightPath3D.css'

// Track component instances
let instanceCounter = 0

export default function FlightPath3D({ flightPath, entry }) {
  const instanceId = useRef(++instanceCounter)
  const containerRef = useRef(null)
  const sceneRef = useRef(null)
  const rendererRef = useRef(null)
  const cameraRef = useRef(null)
  const animationFrameRef = useRef(null)
  const planeRef = useRef(null)
  const raycasterRef = useRef(null)
  const mouseRef = useRef(new THREE.Vector2())
  const [isPlaying, setIsPlaying] = useState(false)
  const [animationProgress, setAnimationProgress] = useState(0)
  const [currentData, setCurrentData] = useState(null)
  const animationTimeRef = useRef(0)
  const pointSpheresRef = useRef([])
  const originAltRef = useRef(0)
  const isPlayingRef = useRef(false)
  const lastPausedIndexRef = useRef(-1)

  // Keep isPlayingRef in sync with isPlaying state
  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  useEffect(() => {
    if (!containerRef.current || !flightPath || flightPath.length === 0) {
      return
    }

    // Always create a fresh scene - don't reuse to avoid accumulation
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x2a2a3a)
    scene.fog = new THREE.Fog(0x2a2a3a, 2000, 8000)
    
    // Ensure scene is completely empty
    while (scene.children.length > 0) {
      scene.remove(scene.children[0])
    }
    
    sceneRef.current = scene

    const container = containerRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    // Always create fresh camera
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 10000)
    cameraRef.current = camera

    // Always create fresh renderer
    // Remove old renderer if it exists
    if (rendererRef.current && rendererRef.current.domElement && container.contains(rendererRef.current.domElement)) {
      container.removeChild(rendererRef.current.domElement)
    }
    
    const renderer = new THREE.WebGLRenderer({
      antialias: window.devicePixelRatio <= 2,
      powerPreference: "high-performance",
      stencil: false,
      depth: true
    })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.0
    renderer.setClearColor(0x2a2a3a, 1)
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0)
    scene.add(ambientLight)
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2)
    directionalLight.position.set(500, 1000, 500)
    directionalLight.castShadow = true
    directionalLight.shadow.mapSize.width = 2048
    directionalLight.shadow.mapSize.height = 2048
    directionalLight.shadow.camera.near = 0.5
    directionalLight.shadow.camera.far = 5000
    directionalLight.shadow.bias = -0.0001
    scene.add(directionalLight)
    
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.6)
    fillLight.position.set(-500, 500, -500)
    scene.add(fillLight)
    
    const rimLight = new THREE.DirectionalLight(0x88aaff, 0.4)
    rimLight.position.set(0, 200, -1000)
    scene.add(rimLight)

    // Calculate bounds and center
    const lats = flightPath.map(p => p.lat).filter(lat => lat != null)
    const lons = flightPath.map(p => p.lon).filter(lon => lon != null)
    const alts = flightPath.map(p => p.alt).filter(alt => alt != null)

    // Check if we have GPS data
    const hasGPS = lats.length > 0 && lons.length > 0

    if (!hasGPS) {
      const emptyMsg = document.createElement('div')
      emptyMsg.className = 'flight-path-3d-empty'
      emptyMsg.innerHTML = '<p>GPS data not available for this maneuver</p><p style="font-size: 12px; color: var(--text-muted); margin-top: 8px;">Flight path visualization requires GPS coordinates from the flight simulator</p>'
      container.appendChild(emptyMsg)
      return
    }

    if (alts.length === 0) return

    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const minLon = Math.min(...lons)
    const maxLon = Math.max(...lons)
    const minAlt = Math.min(...alts)
    const maxAlt = Math.max(...alts)

    // Convert lat/lon to local coordinates
    const originLat = entry?.lat || flightPath[0]?.lat || (minLat + maxLat) / 2
    const originLon = entry?.lon || flightPath[0]?.lon || (minLon + maxLon) / 2
    const originAlt = entry?.altitude || entry?.alt || flightPath[0]?.alt || (minAlt + maxAlt) / 2
    originAltRef.current = originAlt

    const latToMeters = 111320
    const lonToMeters = 111320 * Math.cos((originLat * Math.PI) / 180)

    // Create flight path points with full data
    const pathPoints = []
    const pathData = []

    flightPath.forEach((point) => {
      if (point.lat == null || point.lon == null || point.alt == null) return

      const x = (point.lon - originLon) * lonToMeters
      const z = -(point.lat - originLat) * latToMeters
      const y = (point.alt - originAlt) * 0.3048

      pathPoints.push(new THREE.Vector3(x, y, z))
      pathData.push({
        position: new THREE.Vector3(x, y, z),
        alt: point.alt,
        heading: point.heading || 0,
        bank: point.bank || 0,
        airspeed: point.airspeed || 0,
        pitch: point.pitch || 0,
        timestamp: point.timestamp
      })
    })

    if (pathPoints.length === 0) return

    // Optimized path creation with reduced geometry complexity
    const getColorCategory = (altDev) => {
      const absDev = Math.abs(altDev)
      if (absDev <= 100) return 'good'
      if (absDev <= 150) return 'warning'
      return 'bad'
    }

    const getColorForCategory = (category) => {
      switch (category) {
        case 'good':
          return { color: 0x00ff88, emissive: 0x00aa44 }
        case 'warning':
          return { color: 0xffff44, emissive: 0xaaaa00 }
        case 'bad':
          return { color: 0xff4444, emissive: 0xaa0000 }
        default:
          return { color: 0x6ab0ff, emissive: 0x2a5a8a }
      }
    }

    const pathGroup = new THREE.Group()
    const segmentRadius = 16

    // Sample points to reduce geometry complexity
    const sampleRate = Math.max(1, Math.floor(pathPoints.length / 200))
    const sampledPoints = []
    const sampledData = []

    for (let i = 0; i < pathPoints.length; i += sampleRate) {
      sampledPoints.push(pathPoints[i])
      sampledData.push(pathData[i])
    }

    let currentSegmentPoints = []
    let currentCategory = null

    const createSegment = (points, category) => {
      if (points.length < 2) return

      const segmentCurve = new THREE.CatmullRomCurve3(points, false, 'centripetal')
      const segmentGeometry = new THREE.TubeGeometry(segmentCurve, Math.max(points.length * 2, 10), segmentRadius, 12, false)
      const colors = getColorForCategory(category)

      const segmentMaterial = new THREE.MeshStandardMaterial({
        color: colors.color,
        emissive: colors.emissive,
        emissiveIntensity: 0.5,
        metalness: 0.1,
        roughness: 0.5
      })
      
      const segment = new THREE.Mesh(segmentGeometry, segmentMaterial)
      segment.castShadow = true
      pathGroup.add(segment)
    }

    for (let i = 0; i < sampledData.length; i++) {
      const altDev = sampledData[i].alt - originAlt
      const category = getColorCategory(altDev)

      if (category !== currentCategory) {
        if (currentSegmentPoints.length > 0) {
          createSegment(currentSegmentPoints, currentCategory)
        }
        currentSegmentPoints = [sampledPoints[i]]
        currentCategory = category
      } else {
        currentSegmentPoints.push(sampledPoints[i])
      }
    }

    if (currentSegmentPoints.length > 0) {
      createSegment(currentSegmentPoints, currentCategory)
    }

    scene.add(pathGroup)

    // Create hover point spheres for mouse tracking (optimized)
    const pointSpheres = []
    const sphereGeometry = new THREE.SphereGeometry(18, 16, 12) // Reduced detail
    const sphereMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x666666,
      emissiveIntensity: 0.15,
      metalness: 0.2,
      roughness: 0.5,
        transparent: true,
      opacity: 0.08
    })

    // Sample less frequently for better performance
    const sphereSampleRate = Math.max(1, Math.floor(pathData.length / 100))
    pathData.forEach((data, index) => {
      if (index % sphereSampleRate !== 0) return

      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial.clone())
      sphere.position.copy(data.position)
      sphere.userData = { index, data }
      sphere.visible = true
      scene.add(sphere)
      pointSpheres.push(sphere)
    })
    pointSpheresRef.current = pointSpheres

    // Always create fresh plane - remove old one if it exists
    if (planeRef.current && scene.children.includes(planeRef.current)) {
      scene.remove(planeRef.current)
      planeRef.current.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose()
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach(mat => mat.dispose())
          } else {
            obj.material.dispose()
          }
        }
      })
    }

    const planeGroup = new THREE.Group()

      const planeBodyGeometry = new THREE.BoxGeometry(40, 8, 120, 4, 2, 8)
      const planeBodyMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x222222,
        emissiveIntensity: 0.1,
        metalness: 0.3,
        roughness: 0.4
      })
      const planeBody = new THREE.Mesh(planeBodyGeometry, planeBodyMaterial)
      planeBody.castShadow = true
      planeGroup.add(planeBody)

      const wingGeometry = new THREE.BoxGeometry(200, 2, 40, 8, 1, 4)
      const wingMaterial = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        emissive: 0x111111,
        emissiveIntensity: 0.1,
        metalness: 0.2,
        roughness: 0.5
      })
      const leftWing = new THREE.Mesh(wingGeometry, wingMaterial)
      leftWing.position.set(-100, 0, 0)
      leftWing.castShadow = true
      planeGroup.add(leftWing)

      const rightWing = new THREE.Mesh(wingGeometry, wingMaterial)
      rightWing.position.set(100, 0, 0)
      rightWing.castShadow = true
      planeGroup.add(rightWing)

      const tailGeometry = new THREE.BoxGeometry(20, 60, 8, 2, 4, 2)
      const tailMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x222222,
        emissiveIntensity: 0.1,
        metalness: 0.3,
        roughness: 0.4
      })
      const tail = new THREE.Mesh(tailGeometry, tailMaterial)
      tail.position.set(0, 30, -50)
      tail.castShadow = true
      planeGroup.add(tail)

    // Set initial rotation so plane's nose points along +Z axis
    planeGroup.rotation.order = 'YXZ'  // Set rotation order once
    planeGroup.position.copy(pathPoints[0])

    // Remove old plane if it exists, but keep other scene objects (pathGroup, lights, etc.)
    if (planeRef.current && scene.children.includes(planeRef.current)) {
      scene.remove(planeRef.current)
      planeRef.current.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose()
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach(mat => mat.dispose())
          } else {
            obj.material.dispose()
          }
        }
      })
    }
    
    scene.add(planeGroup)
    planeRef.current = planeGroup

    const entryGeometry = new THREE.SphereGeometry(30, 32, 32)
    const entryMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x00ffff,
      emissive: 0x004444,
      emissiveIntensity: 0.5,
      metalness: 0.4,
      roughness: 0.3,
      transparent: true,
      opacity: 0.95
    })
    const entryMarker = new THREE.Mesh(entryGeometry, entryMaterial)
    entryMarker.position.set(0, 0, 0)
    entryMarker.castShadow = true
    scene.add(entryMarker)

    const lastPoint = pathPoints[pathPoints.length - 1]
    const exitGeometry = new THREE.SphereGeometry(30, 32, 32)
    const exitMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xff00ff,
      emissive: 0x440044,
      emissiveIntensity: 0.5,
      metalness: 0.4,
      roughness: 0.3,
      transparent: true,
      opacity: 0.95
    })
    const exitMarker = new THREE.Mesh(exitGeometry, exitMaterial)
    exitMarker.position.copy(lastPoint)
    exitMarker.castShadow = true
    scene.add(exitMarker)

    // Reference plane
    const planeSize = Math.max(
      Math.abs(pathPoints[pathPoints.length - 1].x - pathPoints[0].x),
      Math.abs(pathPoints[pathPoints.length - 1].z - pathPoints[0].z)
    ) * 1.5

    const planeGeometry = new THREE.PlaneGeometry(planeSize, planeSize, 20, 20)
    const planeMaterial = new THREE.MeshStandardMaterial({
      color: 0x444455,
      side: THREE.DoubleSide,
      metalness: 0.1,
      roughness: 0.8,
      transparent: true,
      opacity: 0.4
    })
    const referencePlane = new THREE.Mesh(planeGeometry, planeMaterial)
    referencePlane.rotation.x = -Math.PI / 2
    referencePlane.position.y = 0
    referencePlane.receiveShadow = true
    scene.add(referencePlane)

    // Grid - brighter
    const gridHelper = new THREE.GridHelper(planeSize, 20, 0x666666, 0x444444)
    gridHelper.position.y = 0
    scene.add(gridHelper)

    // Position camera
    const box = new THREE.Box3().setFromPoints(pathPoints)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const distance = maxDim * 2.5

    camera.position.set(
      center.x + distance * 0.7,
      center.y + distance * 0.5,
      center.z + distance * 0.7
    )
    camera.lookAt(center)

    // Raycaster for clicking
    const raycaster = new THREE.Raycaster()
    raycasterRef.current = raycaster

    // Controls
    let isDragging = false
    let previousMousePosition = { x: 0, y: 0 }
    let cameraDistance = camera.position.distanceTo(center)

    const onMouseDown = (e) => {
      isDragging = true
      previousMousePosition = { x: e.clientX, y: e.clientY }
    }

    const onMouseMove = (e) => {
      if (isDragging) {
        const deltaX = e.clientX - previousMousePosition.x
        const deltaY = e.clientY - previousMousePosition.y

        const spherical = new THREE.Spherical()
        spherical.setFromVector3(camera.position.clone().sub(center))
        
        spherical.theta -= deltaX * 0.008
        spherical.phi += deltaY * 0.008
        spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi))
        spherical.radius = cameraDistance

        camera.position.setFromSpherical(spherical).add(center)
        camera.lookAt(center)

        previousMousePosition = { x: e.clientX, y: e.clientY }
      } else {
        // Track mouse position to show data at nearest point
        mouseRef.current.x = (e.clientX / width) * 2 - 1
        mouseRef.current.y = -(e.clientY / height) * 2 + 1
        
        raycaster.setFromCamera(mouseRef.current, camera)
        const intersects = raycaster.intersectObjects(pointSpheres)
        
        if (intersects.length > 0) {
          const nearestSphere = intersects[0].object
          const { data } = nearestSphere.userData
          setCurrentData(data)
          
          // Highlight the sphere
          pointSpheres.forEach(sphere => {
            if (sphere === nearestSphere) {
              sphere.material.opacity = 0.6
              sphere.scale.set(1.3, 1.3, 1.3)
            } else {
              sphere.material.opacity = 0.1
              sphere.scale.set(1, 1, 1)
            }
          })
        } else {
          // No intersection, use animation position if playing, or clear
          if (!isPlaying) {
            pointSpheres.forEach(sphere => {
              sphere.material.opacity = 0.1
              sphere.scale.set(1, 1, 1)
            })
          }
        }
      }
    }

    const onMouseUp = () => {
      isDragging = false
    }

    const onWheel = (e) => {
      e.preventDefault()
      const delta = e.deltaY * 0.008
      const direction = camera.position.clone().sub(center).normalize()
      cameraDistance = Math.max(maxDim * 0.5, Math.min(maxDim * 5, cameraDistance + delta * 50))
      const newPosition = center.clone().add(direction.multiplyScalar(cameraDistance))
      camera.position.lerp(newPosition, 0.1)
      camera.lookAt(center)
    }

    container.addEventListener('mousedown', onMouseDown)
    container.addEventListener('mousemove', onMouseMove)
    container.addEventListener('mouseup', onMouseUp)
    container.addEventListener('wheel', onWheel)

    let lastTime = performance.now()
    const firstTimestamp = pathData[0]?.timestamp || 0
    const lastTimestamp = pathData[pathData.length - 1]?.timestamp || 0
    const animationDuration = lastTimestamp > firstTimestamp ? (lastTimestamp - firstTimestamp) : 10000
    let cameraTarget = new THREE.Vector3()
    let cameraPosition = camera.position.clone()
    let frameCount = 0

    const curve = new THREE.CatmullRomCurve3(pathPoints, false, 'centripetal')

    let previousDirection = pathData.length > 1 
      ? pathData[1].position.clone().sub(pathData[0].position).normalize()
      : new THREE.Vector3(0, 0, 1)

    const smoothStep = (t) => t * t * (3 - 2 * t)
    
    const animate = (currentTime) => {
      animationFrameRef.current = requestAnimationFrame(animate)

      const deltaTime = Math.min(currentTime - lastTime, 100) / 1000
      lastTime = currentTime

      frameCount++
      
      if (isPlayingRef.current && pathData.length > 0) {
        lastPausedIndexRef.current = -1
        animationTimeRef.current += deltaTime * 1000
        const progress = Math.min(animationTimeRef.current / animationDuration, 1.0)
        setAnimationProgress(progress)
        
        if (progress >= 1.0) {
          setIsPlaying(false)
          animationTimeRef.current = animationDuration
          const finalData = pathData[pathData.length - 1]
          if (finalData) {
            planeGroup.position.copy(finalData.position)
            setCurrentData({
              alt: finalData.alt,
              bank: finalData.bank,
              heading: finalData.heading,
              airspeed: finalData.airspeed,
              pitch: finalData.pitch
            })
          }
        } else {
          const exactIndex = progress * (pathData.length - 1)
          const pathIndex = Math.floor(exactIndex)
          const nextIndex = Math.min(pathIndex + 1, pathData.length - 1)
          const t = smoothStep(exactIndex % 1)
          
          const currentPathData = pathData[pathIndex]
          const nextPathData = pathData[nextIndex]
          
          if (currentPathData && nextPathData) {
          const position = currentPathData.position.clone().lerp(nextPathData.position, t)
          const bank = THREE.MathUtils.lerp(currentPathData.bank, nextPathData.bank, t)
          const pitch = THREE.MathUtils.lerp(currentPathData.pitch, nextPathData.pitch, t)
          const heading = THREE.MathUtils.lerp(currentPathData.heading, nextPathData.heading, t)

          planeGroup.position.copy(position)

          // Calculate direction of travel for base orientation
          let direction = nextPathData.position.clone().sub(currentPathData.position).normalize()
          
          // Check if direction flipped (dot product < 0 means >90 degree change)
          const dotProduct = direction.dot(previousDirection)
          
          // If direction flipped dramatically, reverse it to prevent mirroring
          if (dotProduct < 0) {
            direction.negate()
          }
          
          // Smooth direction changes to prevent sudden flips
          if (dotProduct < 0.95) {
            // Significant direction change - smooth it
            direction.lerp(previousDirection, 0.3).normalize()
          }
          
          // Update previous direction
          previousDirection.copy(direction)
          
          // Create target point ahead for lookAt
          const lookAhead = position.clone().add(direction.clone().multiplyScalar(50))
          
          // Reset rotation and orient plane to face direction of travel
          planeGroup.rotation.set(0, 0, 0)
          planeGroup.lookAt(lookAhead)
          
          // Apply pitch (rotation around local X-axis - right wing)
          // Positive pitch = nose up, which in Three.js is negative X rotation
          planeGroup.rotateX(-pitch * Math.PI / 180)
          
          // Apply bank (rotation around local Z-axis - forward/backward)
          // Positive bank = right wing down, which in Three.js is positive Z rotation
          planeGroup.rotateZ(bank * Math.PI / 180)
          
          // Update current data less frequently for better performance
          if (frameCount % 2 === 0) {
          const interpolatedData = {
              alt: THREE.MathUtils.lerp(currentPathData.alt, nextPathData.alt, t),
            bank: bank,
            heading: heading,
              airspeed: THREE.MathUtils.lerp(currentPathData.airspeed, nextPathData.airspeed, t),
            pitch: pitch
          }
          setCurrentData(interpolatedData)
          }
          
          // Optimized camera following with smoother interpolation
          const followDistance = maxDim * 0.8
          const followHeight = maxDim * 0.3
          const targetOffset = new THREE.Vector3(
            Math.sin(heading * Math.PI / 180) * followDistance,
            followHeight,
            Math.cos(heading * Math.PI / 180) * followDistance
          )
          const targetPosition = position.clone().add(targetOffset)

          cameraPosition.lerp(targetPosition, 1 - Math.exp(-deltaTime * 3.5))
          camera.position.copy(cameraPosition)
          cameraTarget.lerp(position, 1 - Math.exp(-deltaTime * 5))
          camera.lookAt(cameraTarget)
          }
        }
      } else if (!isPlayingRef.current && pathData.length > 0) {
        // When paused, only update if we're at a different index to prevent flickering
        const progress = Math.max(0, Math.min(1, animationProgress))
        const pathIndex = Math.round(progress * (pathData.length - 1))
        if (pathIndex !== lastPausedIndexRef.current && pathData[pathIndex]) {
          lastPausedIndexRef.current = pathIndex
          setCurrentData(pathData[pathIndex])
        }
      }
      
      renderer.render(scene, camera)
    }
    
    // Set initial data
    if (pathData.length > 0) {
      setCurrentData(pathData[0])
    }

    // Start animation loop
    animate(performance.now())

    // Handle resize
    const handleResize = () => {
      if (!container || !camera || !renderer) return
      const width = container.clientWidth
      const height = container.clientHeight
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }
    window.addEventListener('resize', handleResize)

    const pathGroupGeometries = []
    const pathGroupMaterials = []
    pathGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.geometry) pathGroupGeometries.push(child.geometry)
        if (child.material) pathGroupMaterials.push(child.material)
      }
    })

    const geometriesToDispose = [
      entryGeometry,
      exitGeometry,
      planeGeometry,
      ...pointSpheres.map(s => s.geometry),
      ...pathGroupGeometries
    ]
    const materialsToDispose = [
      entryMaterial,
      exitMaterial,
      planeMaterial,
      ...pointSpheres.map(s => s.material),
      ...pathGroupMaterials
    ]

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)
      container.removeEventListener('mousedown', onMouseDown)
      container.removeEventListener('mousemove', onMouseMove)
      container.removeEventListener('mouseup', onMouseUp)
      container.removeEventListener('wheel', onWheel)

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }

      // Clear the scene of all objects before disposing
      if (sceneRef.current) {
        while (sceneRef.current.children.length > 0) {
          const child = sceneRef.current.children[0]
          sceneRef.current.remove(child)
          // Dispose of geometries and materials for each child
          child.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose()
            if (obj.material) {
              if (Array.isArray(obj.material)) {
                obj.material.forEach(mat => mat.dispose())
              } else {
                obj.material.dispose()
              }
            }
          })
        }
      }

      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }

      // Dispose remaining geometries and materials (fallback)
      geometriesToDispose.forEach(geo => {
        if (geo) geo.dispose()
      })
      materialsToDispose.forEach(mat => {
        if (mat) mat.dispose()
      })

      // Clear references for next mount
      planeRef.current = null
      sceneRef.current = null
      rendererRef.current = null
      cameraRef.current = null
    }
  }, [flightPath, entry])

  const togglePlay = () => {
    if (!isPlaying) {
      const firstTimestamp = flightPath?.[0]?.timestamp || 0
      const lastTimestamp = flightPath?.[flightPath.length - 1]?.timestamp || 0
      const duration = lastTimestamp > firstTimestamp ? (lastTimestamp - firstTimestamp) : 10000
      animationTimeRef.current = animationProgress * duration
      setIsPlaying(true)
    } else {
      setIsPlaying(false)
    }
  }

  const resetAnimation = () => {
    setIsPlaying(false)
    animationTimeRef.current = 0
    setAnimationProgress(0)
    lastPausedIndexRef.current = -1
    if (flightPath && flightPath.length > 0) {
      const firstPoint = flightPath[0]
      if (firstPoint) {
        setCurrentData({
          alt: firstPoint.alt || 0,
          bank: firstPoint.bank || 0,
          heading: firstPoint.heading || 0,
          airspeed: firstPoint.airspeed || 0,
          pitch: firstPoint.pitch || 0
        })
      }
    }
  }

  if (!flightPath || flightPath.length === 0) {
    return (
      <div className="flight-path-3d-container">
        <div className="flight-path-3d-empty">
          <p>No flight path data available</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flight-path-3d-container">
      <div className="flight-path-3d-header">
        <h3>3D Flight Path Visualization</h3>
        <div className="flight-path-3d-controls-bar">
          <button 
            className="flight-path-control-btn" 
            onClick={togglePlay}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button 
            className="flight-path-control-btn" 
            onClick={resetAnimation}
            title="Reset"
          >
            ⏮
          </button>
          <div className="flight-path-progress">
            <div 
              className="flight-path-progress-bar" 
              style={{ width: `${animationProgress * 100}%` }}
            />
          </div>
          {currentData && (
            <div className="flight-path-live-data">
              <div className="live-data-item">
                <span className="live-data-label">Height:</span>
                <span className={`live-data-value ${Math.abs(currentData.alt - originAltRef.current) <= 100 ? 'good' : Math.abs(currentData.alt - originAltRef.current) <= 150 ? 'warning' : 'bad'}`}>
                  {(currentData.alt - originAltRef.current >= 0 ? '+' : '') + Math.round(currentData.alt - originAltRef.current)} ft
                </span>
              </div>
              <div className="live-data-item">
                <span className="live-data-label">Bank:</span>
                <span className={`live-data-value ${Math.abs(Math.abs(currentData.bank) - 45) <= 5 ? 'good' : Math.abs(Math.abs(currentData.bank) - 45) <= 10 ? 'warning' : 'bad'}`}>
                  {Math.round(currentData.bank)}°
                </span>
              </div>
            </div>
          )}
        </div>
        <div className="flight-path-3d-legend">
          <div className="legend-item">
            <span className="legend-color" style={{ background: '#00ffff' }}></span>
            <span>Entry Point</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: '#ff00ff' }}></span>
            <span>Exit Point</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: '#00ff00' }}></span>
            <span>Good Altitude (±100ft)</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: '#ffff00' }}></span>
            <span>Warning (±150ft)</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: '#ff0000' }}></span>
            <span>Busted Altitude</span>
          </div>
        </div>
        <div className="flight-path-3d-instructions">
          <p>🖱️ Drag to rotate • 🔍 Scroll to zoom • 🖱️ Hover over path to see data</p>
        </div>
      </div>
      <div ref={containerRef} className="flight-path-3d-canvas"></div>
    </div>
  )
}
