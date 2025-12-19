import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import './FlightPath3D.css'

export default function FlightPath3D({ flightPath, entry }) {
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

  useEffect(() => {
    if (!containerRef.current || !flightPath || flightPath.length === 0) return

    // Initialize Three.js scene - much brighter
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x2a2a3a)
    scene.fog = new THREE.Fog(0x2a2a3a, 2000, 8000)
    sceneRef.current = scene

    const container = containerRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    // Camera
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 10000)
    cameraRef.current = camera

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Lighting - much brighter
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2)
    scene.add(ambientLight)
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5)
    directionalLight.position.set(500, 1000, 500)
    directionalLight.castShadow = true
    scene.add(directionalLight)
    
    // Add additional fill light
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.8)
    fillLight.position.set(-500, 500, -500)
    scene.add(fillLight)

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

    // Create a smooth curve from points
    const curve = new THREE.CatmullRomCurve3(pathPoints, false, 'centripetal')
    const curvePoints = curve.getPoints(pathPoints.length * 10)

    // Create tube geometry for the path (much more visible than a line)
    const tubeGeometry = new THREE.TubeGeometry(curve, curvePoints.length, 12, 8, false)
    
    // Create brighter material
    const tubeMaterial = new THREE.MeshPhongMaterial({
      color: 0x6ab0ff,
      emissive: 0x2a5a8a,
      shininess: 100,
      transparent: true,
      opacity: 0.9
    })

    const tube = new THREE.Mesh(tubeGeometry, tubeMaterial)
    tube.castShadow = true
    scene.add(tube)

    // Create colored segments based on altitude deviation - brighter and more visible
    for (let i = 0; i < pathPoints.length - 1; i++) {
      const point1 = pathPoints[i]
      const point2 = pathPoints[i + 1]
      const altDev = pathData[i].alt - originAlt
      
      let color, emissiveColor
      if (Math.abs(altDev) <= 100) {
        color = 0x00ff88
        emissiveColor = 0x00aa44
      } else if (Math.abs(altDev) <= 150) {
        color = 0xffff44
        emissiveColor = 0xaaaa00
      } else {
        color = 0xff4444
        emissiveColor = 0xaa0000
      }

      const segmentGeometry = new THREE.CylinderGeometry(10, 10, point1.distanceTo(point2), 8)
      const segmentMaterial = new THREE.MeshPhongMaterial({ 
        color,
        emissive: emissiveColor,
        emissiveIntensity: 0.5
      })
      
      const segment = new THREE.Mesh(segmentGeometry, segmentMaterial)
      segment.position.copy(point1.clone().add(point2).multiplyScalar(0.5))
      segment.lookAt(point2)
      segment.rotateX(Math.PI / 2)
      scene.add(segment)
    }

    // Create hover point spheres for mouse tracking
    const pointSpheres = []
    pathData.forEach((data, index) => {
      if (index % 3 !== 0) return // Sample every 3rd point for better tracking
      
      const sphereGeometry = new THREE.SphereGeometry(20, 16, 16)
      const sphereMaterial = new THREE.MeshPhongMaterial({
        color: 0xffffff,
        emissive: 0x666666,
        transparent: true,
        opacity: 0.1
      })
      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial)
      sphere.position.copy(data.position)
      sphere.userData = { index, data }
      sphere.visible = true // Always visible but very transparent
      scene.add(sphere)
      pointSpheres.push(sphere)
    })
    pointSpheresRef.current = pointSpheres

    // Create animated plane
    const planeGroup = new THREE.Group()
    
    // Plane body
    const planeBodyGeometry = new THREE.BoxGeometry(40, 8, 120)
    const planeBodyMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: 0x222222 })
    const planeBody = new THREE.Mesh(planeBodyGeometry, planeBodyMaterial)
    planeBody.castShadow = true
    planeGroup.add(planeBody)

    // Wings
    const wingGeometry = new THREE.BoxGeometry(200, 2, 40)
    const wingMaterial = new THREE.MeshPhongMaterial({ color: 0xcccccc, emissive: 0x111111 })
    const leftWing = new THREE.Mesh(wingGeometry, wingMaterial)
    leftWing.position.set(-100, 0, 0)
    leftWing.castShadow = true
    planeGroup.add(leftWing)
    
    const rightWing = new THREE.Mesh(wingGeometry, wingMaterial)
    rightWing.position.set(100, 0, 0)
    rightWing.castShadow = true
    planeGroup.add(rightWing)

    // Tail
    const tailGeometry = new THREE.BoxGeometry(20, 60, 8)
    const tailMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: 0x222222 })
    const tail = new THREE.Mesh(tailGeometry, tailMaterial)
    tail.position.set(0, 30, -50)
    tail.castShadow = true
    planeGroup.add(tail)

    planeGroup.position.copy(pathPoints[0])
    scene.add(planeGroup)
    planeRef.current = planeGroup

    // Entry marker
    const entryGeometry = new THREE.SphereGeometry(30, 16, 16)
    const entryMaterial = new THREE.MeshPhongMaterial({ 
      color: 0x00ffff,
      emissive: 0x004444,
      transparent: true,
      opacity: 0.9
    })
    const entryMarker = new THREE.Mesh(entryGeometry, entryMaterial)
    entryMarker.position.set(0, 0, 0)
    entryMarker.castShadow = true
    scene.add(entryMarker)

    // Exit marker
    const lastPoint = pathPoints[pathPoints.length - 1]
    const exitGeometry = new THREE.SphereGeometry(30, 16, 16)
    const exitMaterial = new THREE.MeshPhongMaterial({ 
      color: 0xff00ff,
      emissive: 0x440044,
      transparent: true,
      opacity: 0.9
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

    const planeGeometry = new THREE.PlaneGeometry(planeSize, planeSize)
    const planeMaterial = new THREE.MeshPhongMaterial({
      color: 0x444455,
      side: THREE.DoubleSide,
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
        
        spherical.theta -= deltaX * 0.01
        spherical.phi += deltaY * 0.01
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
      const delta = e.deltaY * 0.01
      const direction = camera.position.clone().sub(center).normalize()
      cameraDistance = Math.max(maxDim * 0.5, Math.min(maxDim * 5, cameraDistance + delta * 50))
      camera.position.copy(center.clone().add(direction.multiplyScalar(cameraDistance)))
    }

    container.addEventListener('mousedown', onMouseDown)
    container.addEventListener('mousemove', onMouseMove)
    container.addEventListener('mouseup', onMouseUp)
    container.addEventListener('wheel', onWheel)

    // Animation
    let lastTime = performance.now()
    const animationDuration = 10000 // 10 seconds

    const animate = (currentTime) => {
      animationFrameRef.current = requestAnimationFrame(animate)
      
      const deltaTime = currentTime - lastTime
      lastTime = currentTime
      
      if (isPlaying && pathData.length > 0) {
        animationTimeRef.current += deltaTime
        const progress = (animationTimeRef.current % animationDuration) / animationDuration
        setAnimationProgress(progress)
        
        const pathIndex = Math.floor(progress * (pathData.length - 1))
        const nextIndex = Math.min(pathIndex + 1, pathData.length - 1)
        const t = (progress * (pathData.length - 1)) % 1
        
        const currentPathData = pathData[pathIndex]
        const nextPathData = pathData[nextIndex]
        
        if (currentPathData && nextPathData) {
          const position = currentPathData.position.clone().lerp(nextPathData.position, t)
          const bank = currentPathData.bank + (nextPathData.bank - currentPathData.bank) * t
          const pitch = currentPathData.pitch + (nextPathData.pitch - currentPathData.pitch) * t
          const heading = currentPathData.heading + (nextPathData.heading - currentPathData.heading) * t
          
          planeGroup.position.copy(position)
          planeGroup.rotation.z = (bank * Math.PI) / 180
          planeGroup.rotation.x = (-pitch * Math.PI) / 180
          planeGroup.rotation.y = ((heading - 90) * Math.PI) / 180
          
          // Update current data for HUD
          const interpolatedData = {
            alt: currentPathData.alt + (nextPathData.alt - currentPathData.alt) * t,
            bank: bank,
            heading: heading,
            airspeed: currentPathData.airspeed + (nextPathData.airspeed - currentPathData.airspeed) * t,
            pitch: pitch
          }
          setCurrentData(interpolatedData)
          
          // Make camera follow plane
          const followDistance = maxDim * 0.8
          const followHeight = maxDim * 0.3
          const cameraOffset = new THREE.Vector3(
            Math.sin((heading * Math.PI) / 180) * followDistance,
            followHeight,
            Math.cos((heading * Math.PI) / 180) * followDistance
          )
          camera.position.copy(position.clone().add(cameraOffset))
          camera.lookAt(position)
        }
      } else if (!isPlaying && pathData.length > 0) {
        // When paused, show data at current progress position
        const progress = animationProgress
        const pathIndex = Math.floor(progress * (pathData.length - 1))
        if (pathData[pathIndex]) {
          setCurrentData(pathData[pathIndex])
        }
      }
      
      renderer.render(scene, camera) // Always render, even when paused
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

    // Store references for cleanup
    const geometriesToDispose = [
      tubeGeometry,
      entryGeometry,
      exitGeometry,
      planeGeometry,
      ...pointSpheres.map(s => s.geometry)
    ]
    const materialsToDispose = [
      tubeMaterial,
      entryMaterial,
      exitMaterial,
      planeMaterial,
      ...pointSpheres.map(s => s.material)
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
      
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
      
      // Dispose geometries and materials
      geometriesToDispose.forEach(geo => {
        if (geo) geo.dispose()
      })
      materialsToDispose.forEach(mat => {
        if (mat) mat.dispose()
      })
    }
  }, [flightPath, entry, isPlaying])

  const togglePlay = () => {
    setIsPlaying(!isPlaying)
    if (!isPlaying) {
      animationTimeRef.current = animationProgress * 10000
    }
  }

  const resetAnimation = () => {
    setIsPlaying(false)
    animationTimeRef.current = 0
    setAnimationProgress(0)
    // Reset current data to first point
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
