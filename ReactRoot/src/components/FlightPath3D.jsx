import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import './FlightPath3D.css'
import { GLIDEPATH } from '../utils/landingStandards'

const getAltitudeGuideClass = (deviation) => {
  const absDev = Math.abs(deviation)
  if (absDev <= 100) return 'good'
  if (absDev <= 150) return 'warning'
  return 'bad'
}

const getBankGuideClass = (bank) => {
  const absBank = Math.abs(bank || 0)
  if (absBank <= 5) return 'good'
  if (absBank <= 12) return 'warning'
  return 'bad'
}

// Track component instances
let instanceCounter = 0

export default function FlightPath3D({ flightPath, entry, referencePath, runway, runwayName }) {
  const instanceId = useRef(++instanceCounter)
  const containerRef = useRef(null)
  const sceneRef = useRef(null)
  const rendererRef = useRef(null)
  const cameraRef = useRef(null)
  const animationFrameRef = useRef(null)
  const planeRef = useRef(null)
  const raycasterRef = useRef(null)
  const mouseRef = useRef(new THREE.Vector2())
  const progressBarRef = useRef(null)
  const progressBarFillRef = useRef(null)
  const pathDataRef = useRef([])
  const animationDurationRef = useRef(10000)
  const planeGroupRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [animationProgress, setAnimationProgress] = useState(0)
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0)
  const [currentData, setCurrentData] = useState(null)
  const animationTimeRef = useRef(0)
  const pointSpheresRef = useRef([])
  const originAltRef = useRef(0)
  const isPlayingRef = useRef(false)
  const playbackSpeedRef = useRef(1.0)
  const lastPausedIndexRef = useRef(-1)

  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed
  }, [playbackSpeed])

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
    const runwayElevation = runway?.threshold?.elevation ?? runway?.oppositeEnd?.elevation ?? entry?.alt ?? entry?.altitude
    const centerAlt = runwayElevation ?? (minAlt + maxAlt) / 2
    const originAlt = centerAlt
    originAltRef.current = originAlt

    const latToMeters = 111320
    const lonToMeters = 111320 * Math.cos((originLat * Math.PI) / 180)

    const toLocalVector = (lat, lon, alt = originAlt) => new THREE.Vector3(
      (lon - originLon) * lonToMeters,
      (alt - originAlt) * 0.3048,
      -(lat - originLat) * latToMeters
    )

    const landingVisuals = []

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
        lat: point.lat,
        lon: point.lon,
        alt: point.alt,
        heading: point.heading || 0,
        bank: point.bank || 0,
        airspeed: point.airspeed || 0,
        pitch: point.pitch || 0,
        timestamp: point.timestamp
      })
    })

    if (pathPoints.length === 0) return

    pathDataRef.current = pathData

    // Find entry point (where roll begins - bank starts increasing significantly)
    let entryIndex = -1
    const entryBankThreshold = 5
    for (let i = 1; i < pathData.length; i++) {
      const prevBank = Math.abs(pathData[i - 1].bank || 0)
      const currBank = Math.abs(pathData[i].bank || 0)
      // Entry is where bank increases from near-level to significant
      if (prevBank < entryBankThreshold && currBank >= entryBankThreshold) {
        entryIndex = i
        break
      }
    }
    // If no clear entry found, use first point with any bank
    if (entryIndex === -1) {
      for (let i = 0; i < pathData.length; i++) {
        if (Math.abs(pathData[i].bank || 0) >= entryBankThreshold) {
          entryIndex = i
          break
        }
      }
    }
    // Fallback to first point
    if (entryIndex === -1) entryIndex = 0

    let rolloutStartIndex = -1
    let rolloutEndIndex = -1
    let maxBankIndex = 0
    let maxBank = 0

    // Find max bank reached during the turn
    for (let i = 0; i < pathData.length; i++) {
      const b = Math.abs(pathData[i].bank || 0)
      if (b > maxBank) {
        maxBank = b
        maxBankIndex = i
      }
    }

    // Calculate total turn to find when we've passed 325° (rollout trigger point)
    let totalTurn = 0
    let lastHdg = pathData[0]?.heading
    let turnDirection = null
    let passed325Degrees = -1

    for (let i = 1; i < pathData.length; i++) {
      const hdg = pathData[i].heading
      const bank = pathData[i].bank || 0
      
      if (turnDirection === null && Math.abs(bank) > 20) {
        turnDirection = bank > 0 ? 'right' : 'left'
      }
      
      if (turnDirection && lastHdg != null) {
        let delta = hdg - lastHdg
        while (delta > 180) delta -= 360
        while (delta < -180) delta += 360
        
        if (turnDirection === 'right' && delta > 0) {
          totalTurn += delta
        } else if (turnDirection === 'left' && delta < 0) {
          totalTurn += Math.abs(delta)
        }
        
        if (passed325Degrees === -1 && totalTurn >= 325) {
          passed325Degrees = i
        }
      }
      lastHdg = hdg
    }

    // Find rollout start: bank drops below 50% of target bank (45°) AND we've passed 325° of turn
    const targetBank = 45
    const rolloutTriggerBank = targetBank * 0.5
    
    const searchStart = passed325Degrees >= 0 ? passed325Degrees : maxBankIndex + 1
    
    // Detect rollout start using downward crossing (bank decreasing)
    // Matches tracking logic exactly: totalTurn >= 325, prevBankAbs > rolloutTriggerBank, bankAbs < prevBankAbs
    // Need to track totalTurn per point to match the 325° requirement
    let pointTotalTurn = 0
    let pointLastHdg = pathData[0]?.heading
    
    for (let i = searchStart + 1; i < pathData.length; i++) {
      const prev = Math.abs(pathData[i - 1].bank || 0)
      const curr = Math.abs(pathData[i].bank || 0)
      const hdg = pathData[i].heading
      
      // Calculate turn progress at this point
      if (turnDirection && pointLastHdg != null && hdg != null) {
        let delta = hdg - pointLastHdg
        while (delta > 180) delta -= 360
        while (delta < -180) delta += 360
        
        if (turnDirection === 'right' && delta > 0) {
          pointTotalTurn += delta
        } else if (turnDirection === 'left' && delta < 0) {
          pointTotalTurn += Math.abs(delta)
        }
      }
      pointLastHdg = hdg
      
      // Start rollout when: totalTurn >= 325, prevBank > trigger, currBank < prevBank (decreasing)
      // Matches tracking: totalTurn >= 325, prevBankAbs > rolloutTriggerBank, bankAbs < prevBankAbs
      if (pointTotalTurn >= 325 && prev > rolloutTriggerBank && curr < prev) {
        rolloutStartIndex = i
        break
      }
    }
    
    // Fallback: if no match found after 325°, search from max bank index with same logic
    if (rolloutStartIndex === -1 && passed325Degrees >= 0) {
      pointTotalTurn = 325 // Start from 325 since we know we've passed it
      pointLastHdg = pathData[passed325Degrees]?.heading
      
      for (let i = Math.max(passed325Degrees + 1, maxBankIndex + 2); i < pathData.length; i++) {
        const prev = Math.abs(pathData[i - 1].bank || 0)
        const curr = Math.abs(pathData[i].bank || 0)
        const hdg = pathData[i].heading
        
        if (turnDirection && pointLastHdg != null && hdg != null) {
          let delta = hdg - pointLastHdg
          while (delta > 180) delta -= 360
          while (delta < -180) delta += 360
          
          if (turnDirection === 'right' && delta > 0) {
            pointTotalTurn += delta
          } else if (turnDirection === 'left' && delta < 0) {
            pointTotalTurn += Math.abs(delta)
          }
        }
        pointLastHdg = hdg
        
        // Matches tracking: totalTurn >= 325, prevBankAbs > rolloutTriggerBank, bankAbs < prevBankAbs
        if (pointTotalTurn >= 325 && prev > rolloutTriggerBank && curr < prev) {
          rolloutStartIndex = i
          break
        }
      }
    }
    
    // If still not found, use last point
    if (rolloutStartIndex === -1) rolloutStartIndex = pathData.length - 1

    // Find rollout end: when bank reaches wings level (≤ 5 degrees)
    const WINGS_LEVEL_THRESHOLD = 5
    for (let i = rolloutStartIndex; i < pathData.length; i++) {
      const curr = Math.abs(pathData[i].bank || 0)
      if (curr <= WINGS_LEVEL_THRESHOLD) {
        rolloutEndIndex = i
        break
      }
    }
    // If never reaches level, use last point
    if (rolloutEndIndex === -1) rolloutEndIndex = pathData.length - 1

    // Extract level flight segment (2-3 seconds before entry) if we have data
    let levelFlightPoints = []
    let levelFlightData = []
    if (entryIndex > 0 && pathData[entryIndex]?.timestamp) {
      const entryTime = pathData[entryIndex].timestamp
      const lookbackTime = 2500
      const lookbackStartTime = entryTime - lookbackTime

      for (let i = 0; i < entryIndex; i++) {
        if (pathData[i].timestamp >= lookbackStartTime) {
          levelFlightPoints.push(pathPoints[i])
          levelFlightData.push(pathData[i])
        }
      }
    }

    // Always create level flight segment from entry point (since flight path typically starts when turn is detected)
    // This ensures we always show the level flight approach
    // Create synthetic segment if we don't have enough real level flight data (less than 2 points)
    if (pathPoints.length > 0 && levelFlightPoints.length < 2) {
      const actualEntryPoint = entryIndex >= 0 && entryIndex < pathPoints.length 
        ? pathPoints[entryIndex] 
        : new THREE.Vector3(0, 0, 0)
      
      // Calculate direction the aircraft was traveling before the turn
      // Use heading from entry point data, or calculate from path if available
      let direction
      const entryHeading = pathData[entryIndex]?.heading || entry?.heading || 0
      const headingRad = (entryHeading * Math.PI) / 180
      
      // Create direction vector from heading (heading is direction of travel)
      direction = new THREE.Vector3(
        Math.sin(headingRad),
        0,
        Math.cos(headingRad)
      ).normalize()
      
      // Validate direction is not zero
      if (direction.length() < 0.1 || !isFinite(direction.x) || !isFinite(direction.z)) {
        // Fallback: use direction from first path point if available
        if (entryIndex > 0 && entryIndex < pathPoints.length) {
          const prevPoint = pathPoints[entryIndex - 1]
          const dirVec = actualEntryPoint.clone().sub(prevPoint)
          if (dirVec.length() > 0.1) {
            direction = dirVec.normalize()
          } else {
            direction = new THREE.Vector3(0, 0, 1)
          }
        } else if (pathPoints.length > 1) {
          const dirVec = pathPoints[1].clone().sub(pathPoints[0])
          if (dirVec.length() > 0.1) {
            direction = dirVec.normalize()
          } else {
            direction = new THREE.Vector3(0, 0, 1)
          }
        } else {
          // Last resort: use north
          direction = new THREE.Vector3(0, 0, 1)
        }
      }
      
      // Create level flight segment extending backwards from entry point (2-3 seconds of flight)
      // At typical training speeds (~100-120 kt), 2-3 seconds = ~170-340 feet (~50-100 meters)
      // Using 140 meters (~460 feet) for a reasonable visual representation
      const segmentLength = 140
      
      // Create points going backwards from entry point
      const backPoint = actualEntryPoint.clone().sub(direction.clone().multiplyScalar(segmentLength))
      const midPoint1 = actualEntryPoint.clone().sub(direction.clone().multiplyScalar(segmentLength * 0.66))
      const midPoint2 = actualEntryPoint.clone().sub(direction.clone().multiplyScalar(segmentLength * 0.33))
      
      // Get heading from entry point data or entry
      const levelFlightHeading = pathData[entryIndex]?.heading || entry?.heading || 0
      const entryTimestamp = pathData[entryIndex]?.timestamp || pathData[0]?.timestamp || Date.now()
      
      // Always create the segment - points should be valid if direction is valid
      levelFlightPoints = [backPoint, midPoint1, midPoint2, actualEntryPoint]
      levelFlightData = [
        { position: backPoint, alt: originAlt, heading: levelFlightHeading, bank: 0, airspeed: entry?.airspeed || 0, pitch: 0, timestamp: entryTimestamp - 3000 },
        { position: midPoint1, alt: originAlt, heading: levelFlightHeading, bank: 0, airspeed: entry?.airspeed || 0, pitch: 0, timestamp: entryTimestamp - 2000 },
        { position: midPoint2, alt: originAlt, heading: levelFlightHeading, bank: 0, airspeed: entry?.airspeed || 0, pitch: 0, timestamp: entryTimestamp - 1000 },
        { position: actualEntryPoint, alt: originAlt, heading: levelFlightHeading, bank: 0, airspeed: entry?.airspeed || 0, pitch: 0, timestamp: entryTimestamp }
      ]
    }

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

    // Create level flight segment (before turn)
    let levelFlightGeometry = null
    let levelFlightMaterial = null
    if (levelFlightPoints && levelFlightPoints.length >= 2) {
      try {
        // Use LineCurve3 for a simple straight segment, or CatmullRomCurve3 with closed: false
        let levelFlightCurve
        if (levelFlightPoints.length === 2) {
          // Simple line for 2 points
          levelFlightCurve = new THREE.LineCurve3(levelFlightPoints[0], levelFlightPoints[1])
        } else {
          // CatmullRomCurve3 for smooth curve with multiple points, explicitly set closed: false
          levelFlightCurve = new THREE.CatmullRomCurve3(levelFlightPoints, false, 'centripetal')
        }
        
        // Limit the number of segments to prevent infinite extension
        const segments = Math.min(Math.max(levelFlightPoints.length * 2, 8), 20)
        levelFlightGeometry = new THREE.TubeGeometry(levelFlightCurve, segments, 14, 8, false)
        levelFlightMaterial = new THREE.MeshStandardMaterial({
          color: 0x00ffff,
          emissive: 0x00ffff,
          emissiveIntensity: 0.6,
          metalness: 0.1,
          roughness: 0.5,
          transparent: true,
          opacity: 0.9
        })
        const levelFlightSegment = new THREE.Mesh(levelFlightGeometry, levelFlightMaterial)
        levelFlightSegment.castShadow = true
        scene.add(levelFlightSegment)
      } catch (error) {}
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

    // Convert rollout indices to sampled indices
    const sampledRolloutStartIndex = rolloutStartIndex >= 0 ? Math.floor(rolloutStartIndex / sampleRate) : -1
    const sampledRolloutEndIndex = rolloutEndIndex >= 0 ? Math.floor(rolloutEndIndex / sampleRate) : -1

    // Stop main path at rollout start (inclusive) - rollout segment will continue from there
    const mainPathEndIndex = sampledRolloutStartIndex >= 0 ? sampledRolloutStartIndex + 1 : sampledData.length

    for (let i = 0; i < mainPathEndIndex && i < sampledData.length; i++) {

      const altDev = sampledData[i].alt - originAlt
      let category = getColorCategory(altDev)
      
      // After rollout starts, don't show green - use warning or bad colors instead
      if (sampledRolloutStartIndex >= 0 && i >= sampledRolloutStartIndex) {
        if (category === 'good') {
          category = 'warning'
        }
      }

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

    // Draw reference path if provided (for path following comparison)
    if (referencePath && referencePath.length > 0) {
      const referencePathGroup = new THREE.Group()
      referencePathGroup.name = 'referencePath'
      
      // Use same origin as user's path for proper alignment
      const refPathPoints = []
      
      referencePath.forEach((point) => {
        if (point.lat == null || point.lon == null || point.alt == null) return
        
        const x = (point.lon - originLon) * lonToMeters
        const z = -(point.lat - originLat) * latToMeters
        const y = (point.alt - originAlt) * 0.3048
        
        refPathPoints.push(new THREE.Vector3(x, y, z))
      })
      
      if (refPathPoints.length >= 2) {
        // Create reference path as a tube (orange, slightly thinner, dashed appearance)
        const refCurve = new THREE.CatmullRomCurve3(refPathPoints, false, 'centripetal')
        const refGeometry = new THREE.TubeGeometry(refCurve, Math.max(refPathPoints.length * 2, 20), 12, 8, false)
        
        const refMaterial = new THREE.MeshStandardMaterial({
          color: 0xffa500, // Orange
          emissive: 0xaa5500,
          emissiveIntensity: 0.3,
          metalness: 0.1,
          roughness: 0.7,
          transparent: true,
          opacity: 0.7
        })
        
        const refPathMesh = new THREE.Mesh(refGeometry, refMaterial)
        refPathMesh.castShadow = false
        refPathMesh.receiveShadow = false
        referencePathGroup.add(refPathMesh)
        
        // Also add a line for better visibility
        const refLineGeometry = new THREE.BufferGeometry().setFromPoints(refPathPoints)
        const refLineMaterial = new THREE.LineBasicMaterial({
          color: 0xffa500,
          linewidth: 2,
          transparent: true,
          opacity: 0.5
        })
        const refLine = new THREE.Line(refLineGeometry, refLineMaterial)
        referencePathGroup.add(refLine)
        
        // Add side borders to the reference path (where the plane should be)
        const corridorWidthMeters = 0.15 * 1852 // 0.15 NM in meters
        const borderRadius = 8
        
        // Create left and right border paths based on reference path
        const leftBorderPoints = []
        const rightBorderPoints = []
        
        for (let i = 0; i < refPathPoints.length; i++) {
          const currentPoint = refPathPoints[i]
          let direction = new THREE.Vector3()
          
          if (i === 0 && refPathPoints.length > 1) {
            // First point: use direction to next point
            direction = refPathPoints[i + 1].clone().sub(currentPoint).normalize()
          } else if (i === refPathPoints.length - 1 && refPathPoints.length > 1) {
            // Last point: use direction from previous point
            direction = currentPoint.clone().sub(refPathPoints[i - 1]).normalize()
          } else if (refPathPoints.length > 1) {
            // Middle points: use average direction from prev to next
            const prevDir = currentPoint.clone().sub(refPathPoints[i - 1]).normalize()
            const nextDir = refPathPoints[i + 1].clone().sub(currentPoint).normalize()
            direction = prevDir.add(nextDir).normalize()
          } else {
            continue
          }
          
          // Calculate perpendicular vector (horizontal plane only, ignoring altitude)
          const horizontalDir = new THREE.Vector3(direction.x, 0, direction.z).normalize()
          const perpendicular = new THREE.Vector3(-horizontalDir.z, 0, horizontalDir.x).normalize()
          
          // Create left and right border points
          const leftPoint = currentPoint.clone().add(perpendicular.clone().multiplyScalar(corridorWidthMeters))
          const rightPoint = currentPoint.clone().add(perpendicular.clone().multiplyScalar(-corridorWidthMeters))
          
          leftBorderPoints.push(leftPoint)
          rightBorderPoints.push(rightPoint)
        }
        
        // Create left border tube
        if (leftBorderPoints.length >= 2) {
          try {
            const leftCurve = new THREE.CatmullRomCurve3(leftBorderPoints, false, 'centripetal')
            const leftGeometry = new THREE.TubeGeometry(leftCurve, Math.max(leftBorderPoints.length * 2, 10), borderRadius, 8, false)
            const leftMaterial = new THREE.MeshStandardMaterial({
              color: 0xffa500,
              emissive: 0xaa5500,
              emissiveIntensity: 0.3,
              metalness: 0.1,
              roughness: 0.7,
              transparent: true,
              opacity: 0.6
            })
            const leftBorder = new THREE.Mesh(leftGeometry, leftMaterial)
            leftBorder.castShadow = false
            referencePathGroup.add(leftBorder)
            
            // Add dashed line for better visibility
            const leftLineGeometry = new THREE.BufferGeometry().setFromPoints(leftBorderPoints)
            leftLineGeometry.computeLineDistances()
            const leftLineMaterial = new THREE.LineDashedMaterial({
              color: 0xffa500,
              linewidth: 2,
              transparent: true,
              opacity: 0.5,
              dashSize: 20,
              gapSize: 10
            })
            const leftLine = new THREE.Line(leftLineGeometry, leftLineMaterial)
            leftLine.computeLineDistances()
            referencePathGroup.add(leftLine)
          } catch (error) {
            console.warn('Error creating left border:', error)
          }
        }
        
        // Create right border tube
        if (rightBorderPoints.length >= 2) {
          try {
            const rightCurve = new THREE.CatmullRomCurve3(rightBorderPoints, false, 'centripetal')
            const rightGeometry = new THREE.TubeGeometry(rightCurve, Math.max(rightBorderPoints.length * 2, 10), borderRadius, 8, false)
            const rightMaterial = new THREE.MeshStandardMaterial({
              color: 0xffa500,
              emissive: 0xaa5500,
              emissiveIntensity: 0.3,
              metalness: 0.1,
              roughness: 0.7,
              transparent: true,
              opacity: 0.6
            })
            const rightBorder = new THREE.Mesh(rightGeometry, rightMaterial)
            rightBorder.castShadow = false
            referencePathGroup.add(rightBorder)
            
            // Add dashed line for better visibility
            const rightLineGeometry = new THREE.BufferGeometry().setFromPoints(rightBorderPoints)
            rightLineGeometry.computeLineDistances()
            const rightLineMaterial = new THREE.LineDashedMaterial({
              color: 0xffa500,
              linewidth: 2,
              transparent: true,
              opacity: 0.5,
              dashSize: 20,
              gapSize: 10
            })
            const rightLine = new THREE.Line(rightLineGeometry, rightLineMaterial)
            rightLine.computeLineDistances()
            referencePathGroup.add(rightLine)
          } catch (error) {
            console.warn('Error creating right border:', error)
          }
        }
        
        scene.add(referencePathGroup)
      }
    }

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
    planeGroupRef.current = planeGroup

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

    const entryMarkerGroup = new THREE.Group()
    
    const entryGeometry = new THREE.SphereGeometry(35, 32, 32)
    const entryMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x00ffff,
      emissive: 0x00ffff,
      emissiveIntensity: 0.8,
      metalness: 0.4,
      roughness: 0.3,
      transparent: true,
      opacity: 0.95
    })
    const entryMarker = new THREE.Mesh(entryGeometry, entryMaterial)
    entryMarker.castShadow = true
    entryMarkerGroup.add(entryMarker)
    
    const entryRingGeometry = new THREE.TorusGeometry(45, 3, 16, 32)
    const entryRingMaterial = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00ffff,
      emissiveIntensity: 0.6,
      metalness: 0.5,
      roughness: 0.3,
      transparent: true,
      opacity: 0.7
    })
    const entryRing = new THREE.Mesh(entryRingGeometry, entryRingMaterial)
    entryRing.rotation.x = Math.PI / 2
    entryRing.castShadow = true
    entryMarkerGroup.add(entryRing)
    
    // Position entry marker at actual entry point (where roll begins)
    const entryPoint = entryIndex >= 0 && entryIndex < pathPoints.length 
      ? pathPoints[entryIndex] 
      : new THREE.Vector3(0, 0, 0)
    entryMarkerGroup.position.copy(entryPoint)
    scene.add(entryMarkerGroup)

    let rolloutPoints = []
    let rolloutGeometry = null
    let rolloutMaterial = null

    // Build rollout segment using sampled points to match main path
    // Start from the rollout start point (which is included in main path) to ensure connection
    if (sampledRolloutStartIndex >= 0 && sampledRolloutEndIndex >= sampledRolloutStartIndex) {
      // Include the rollout start point to connect with main path
      for (let i = sampledRolloutStartIndex; i <= sampledRolloutEndIndex && i < sampledPoints.length; i++) {
        rolloutPoints.push(sampledPoints[i])
      }
      // If we only got a single point, add the end point (if available) or duplicate with a tiny offset
      if (rolloutPoints.length === 1) {
        const endPoint = sampledPoints[Math.min(sampledRolloutEndIndex, sampledPoints.length - 1)]
        if (endPoint && endPoint !== rolloutPoints[0]) {
          rolloutPoints.push(endPoint)
        } else {
          rolloutPoints.push(rolloutPoints[0].clone().add(new THREE.Vector3(0.01, 0, 0)))
        }
      }
    }

    if (rolloutPoints.length >= 2) {
      const rolloutCurve = new THREE.CatmullRomCurve3(rolloutPoints, false, 'centripetal')
      rolloutGeometry = new THREE.TubeGeometry(rolloutCurve, Math.max(rolloutPoints.length * 2, 10), 18, 8, false)
      rolloutMaterial = new THREE.MeshStandardMaterial({
        color: 0xff00ff,
        emissive: 0xff00ff,
        emissiveIntensity: 1.5,
        metalness: 0.0,
        roughness: 0.2,
        transparent: false,
        opacity: 1.0,
        depthWrite: true,
        depthTest: true
      })
      const rolloutSegment = new THREE.Mesh(rolloutGeometry, rolloutMaterial)
      rolloutSegment.castShadow = true
      rolloutSegment.receiveShadow = false
      rolloutSegment.renderOrder = 1000
      scene.add(rolloutSegment)
    }

    // Rollout start marker (bank decreases below ½ target bank)
    // Use sampled point to match main path and rollout segment
    const rolloutStartPoint = sampledRolloutStartIndex >= 0 && sampledRolloutStartIndex < sampledPoints.length
      ? sampledPoints[sampledRolloutStartIndex]
      : (sampledPoints.length > 0 ? sampledPoints[sampledPoints.length - 1] : new THREE.Vector3(0, 0, 0))
    
    const rolloutStartGeometry = new THREE.SphereGeometry(32, 32, 32)
    const rolloutStartMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xff00ff,
      emissive: 0xff00ff,
      emissiveIntensity: 0.7,
      metalness: 0.4,
      roughness: 0.3,
      transparent: true,
      opacity: 0.95
    })
    const rolloutStartMarker = new THREE.Mesh(rolloutStartGeometry, rolloutStartMaterial)
    rolloutStartMarker.position.copy(rolloutStartPoint)
    rolloutStartMarker.castShadow = true
    scene.add(rolloutStartMarker)

    // Exit/completion marker (final point)
    const lastPoint = rolloutEndIndex >= 0 && rolloutEndIndex < pathPoints.length
      ? pathPoints[rolloutEndIndex]
      : pathPoints[pathPoints.length - 1]
    const exitGeometry = new THREE.SphereGeometry(30, 32, 32)
    const exitMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x888888,
      emissive: 0x222222,
      emissiveIntensity: 0.3,
      metalness: 0.4,
      roughness: 0.3,
      transparent: true,
      opacity: 0.8
    })
    const exitMarker = new THREE.Mesh(exitGeometry, exitMaterial)
    exitMarker.position.copy(lastPoint)
    exitMarker.castShadow = true
    scene.add(exitMarker)

    // Calculate center of flight path for positioning grid and camera
    const box = new THREE.Box3().setFromPoints(pathPoints)
    const center = box.getCenter(new THREE.Vector3())

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
    referencePlane.position.set(center.x, 0, center.z)
    referencePlane.receiveShadow = true
    referencePlane.renderOrder = -1
    scene.add(referencePlane)

    // Grid - brighter, centered on flight path
    const gridHelper = new THREE.GridHelper(planeSize, 20, 0x666666, 0x444444)
    gridHelper.position.set(center.x, 0, center.z)
    scene.add(gridHelper)

    if (runway?.threshold && runway.oppositeEnd) {
      const thresholdVec = toLocalVector(
        runway.threshold.lat,
        runway.threshold.lon,
        runway.threshold.elevation ?? originAlt
      )
      const oppositeVec = toLocalVector(
        runway.oppositeEnd.lat,
        runway.oppositeEnd.lon,
        runway.oppositeEnd.elevation ?? originAlt
      )
      const runwayLengthMeters = Math.max(2, thresholdVec.distanceTo(oppositeVec))
      const runwayWidthMeters = Math.max(2, (runway.width || 100) * 0.3048)
      const runwayCenter = thresholdVec.clone().lerp(oppositeVec, 0.5)
      const runwayDir = oppositeVec.clone().sub(thresholdVec).normalize()
      const runwayYaw = Math.atan2(runwayDir.x, runwayDir.z)
      const runwayMesh = new THREE.Mesh(
        new THREE.BoxGeometry(runwayLengthMeters, 0.2, runwayWidthMeters),
        new THREE.MeshStandardMaterial({
          color: 0x10121c,
          metalness: 0.3,
          roughness: 0.75
        })
      )
      runwayMesh.position.set(runwayCenter.x, 0.1, runwayCenter.z)
      runwayMesh.rotation.y = runwayYaw
      runwayMesh.receiveShadow = true
      runwayMesh.castShadow = true
      scene.add(runwayMesh)
      landingVisuals.push(runwayMesh)
      const centerLineGeometry = new THREE.BufferGeometry().setFromPoints([thresholdVec, oppositeVec])
      const centerLineMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        linewidth: 1,
        transparent: true,
        opacity: 0.65
      })
      const centerLine = new THREE.Line(centerLineGeometry, centerLineMaterial)
      scene.add(centerLine)
      landingVisuals.push(centerLine)
      const thresholdMarker = new THREE.Mesh(
        new THREE.CylinderGeometry(Math.max(runwayWidthMeters * 0.35, 0.5), Math.max(runwayWidthMeters * 0.35, 0.5), 0.3, 12),
        new THREE.MeshStandardMaterial({
          color: 0xff4444,
          emissive: 0xff4444,
          emissiveIntensity: 0.75,
          metalness: 0.2,
          roughness: 0.4
        })
      )
      thresholdMarker.position.set(thresholdVec.x, 0.15, thresholdVec.z)
      scene.add(thresholdMarker)
      landingVisuals.push(thresholdMarker)
      const headingRad = ((runway.heading || 0) * Math.PI) / 180
      const approachDir = new THREE.Vector3(Math.sin(headingRad), 0, -Math.cos(headingRad)).normalize()
      const inboundDir = approachDir.clone().negate()
      const glideDistances = [5, 4, 3, 2, 1, 0.5, 0]
      const glidePoints = glideDistances.map((dist) => {
        const offset = inboundDir.clone().multiplyScalar(dist * 1852)
        const point = thresholdVec.clone().add(offset)
        const targetAltitude = GLIDEPATH.getTargetAltitude(dist).msl
        point.y = (targetAltitude - originAlt) * 0.3048
        return point
      })
      if (glidePoints.length >= 2) {
        const glideGeometry = new THREE.BufferGeometry().setFromPoints(glidePoints)
        const glideMaterial = new THREE.LineBasicMaterial({
          color: 0x4ad3ff,
          linewidth: 2
        })
        const glideLine = new THREE.Line(glideGeometry, glideMaterial)
        scene.add(glideLine)
        landingVisuals.push(glideLine)
      }
      if (pathPoints.length > 0) {
        const touchdownPoint = pathPoints[pathPoints.length - 1]
        const touchdownSphere = new THREE.Mesh(
          new THREE.SphereGeometry(6, 16, 16),
          new THREE.MeshStandardMaterial({
            color: 0xffc24d,
            emissive: 0xffc24d,
            emissiveIntensity: 0.8,
            metalness: 0.2,
            roughness: 0.4
          })
        )
        touchdownSphere.position.copy(touchdownPoint)
        touchdownSphere.position.y = Math.max(touchdownSphere.position.y, 0.2)
        scene.add(touchdownSphere)
        landingVisuals.push(touchdownSphere)
      }
    }

    // Position camera
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const horizontalDim = Math.max(size.x, size.z)
    const verticalDim = size.y
    
    // For landing paths (long horizontal, short vertical), use a closer camera distance
    // Calculate aspect ratio: if horizontal is much larger than vertical, it's likely a landing approach
    const aspectRatio = horizontalDim / Math.max(verticalDim, 1)
    
    // Adjust distance based on path characteristics
    // Landing paths (high aspect ratio) get closer camera, steep turns (low aspect ratio) get standard distance
    let distance
    if (aspectRatio > 10) {
      // Landing approach: use vertical dimension as base, with horizontal consideration
      distance = Math.max(verticalDim * 8, horizontalDim * 0.8)
    } else if (aspectRatio > 5) {
      // Mixed path: use weighted average
      distance = Math.max(verticalDim * 6, horizontalDim * 1.2)
    } else {
      // Steep turn or other: use standard calculation
      distance = maxDim * 2.5
    }

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
    animationDurationRef.current = animationDuration
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
        animationTimeRef.current += deltaTime * 1000 * playbackSpeedRef.current
        const progress = Math.min(animationTimeRef.current / animationDuration, 1.0)
        setAnimationProgress(progress)
        
        if (progressBarFillRef.current) {
          progressBarFillRef.current.style.width = `${progress * 100}%`
        }
        
        if (progress >= 1.0) {
          setIsPlaying(false)
          animationTimeRef.current = animationDuration
          const finalData = pathData[pathData.length - 1]
          if (finalData) {
            planeGroup.position.copy(finalData.position)
            setCurrentData({
              lat: finalData.lat,
              lon: finalData.lon,
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
          
          const interpolatedData = {
              lat: THREE.MathUtils.lerp(currentPathData.lat, nextPathData.lat, t),
              lon: THREE.MathUtils.lerp(currentPathData.lon, nextPathData.lon, t),
              alt: THREE.MathUtils.lerp(currentPathData.alt, nextPathData.alt, t),
            bank: bank,
            heading: heading,
              airspeed: THREE.MathUtils.lerp(currentPathData.airspeed, nextPathData.airspeed, t),
            pitch: pitch
          }
          setCurrentData(interpolatedData)
          
          // Optimized camera following with smoother interpolation
          // Use same distance calculation as initial camera position for consistency
          const followDistance = aspectRatio > 10 
            ? Math.max(verticalDim * 6, horizontalDim * 0.6)
            : aspectRatio > 5
            ? Math.max(verticalDim * 5, horizontalDim * 0.9)
            : maxDim * 0.8
          const followHeight = aspectRatio > 10
            ? Math.max(verticalDim * 2, horizontalDim * 0.2)
            : aspectRatio > 5
            ? Math.max(verticalDim * 1.5, horizontalDim * 0.25)
            : maxDim * 0.3
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
        // When paused, update currentData based on animation progress
        const progress = Math.max(0, Math.min(1, animationProgress))
        const exactIndex = progress * (pathData.length - 1)
        const pathIndex = Math.floor(exactIndex)
        const nextIndex = Math.min(pathIndex + 1, pathData.length - 1)
        const t = exactIndex % 1
        
        const currentPathData = pathData[pathIndex]
        const nextPathData = pathData[nextIndex]
        
        if (currentPathData && nextPathData) {
          const pausedData = {
            lat: THREE.MathUtils.lerp(currentPathData.lat, nextPathData.lat, t),
            lon: THREE.MathUtils.lerp(currentPathData.lon, nextPathData.lon, t),
            alt: THREE.MathUtils.lerp(currentPathData.alt, nextPathData.alt, t),
            bank: THREE.MathUtils.lerp(currentPathData.bank, nextPathData.bank, t),
            heading: THREE.MathUtils.lerp(currentPathData.heading, nextPathData.heading, t),
            airspeed: THREE.MathUtils.lerp(currentPathData.airspeed, nextPathData.airspeed, t),
            pitch: THREE.MathUtils.lerp(currentPathData.pitch, nextPathData.pitch, t)
          }
          setCurrentData(pausedData)
          lastPausedIndexRef.current = pathIndex
        } else if (currentPathData) {
          setCurrentData(currentPathData)
          lastPausedIndexRef.current = pathIndex
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

    const landingGeometries = landingVisuals.map(obj => obj.geometry).filter(Boolean)
    const landingMaterials = landingVisuals.map(obj => obj.material).filter(Boolean)

    const geometriesToDispose = [
      entryGeometry,
      entryRingGeometry,
      rolloutStartGeometry,
      exitGeometry,
      planeGeometry,
      levelFlightGeometry,
      rolloutGeometry,
      ...pointSpheres.map(s => s.geometry),
      ...pathGroupGeometries,
      ...landingGeometries
    ].filter(Boolean)
    const materialsToDispose = [
      entryMaterial,
      entryRingMaterial,
      rolloutStartMaterial,
      exitMaterial,
      planeMaterial,
      levelFlightMaterial,
      rolloutMaterial,
      ...pointSpheres.map(s => s.material),
      ...pathGroupMaterials,
      ...landingMaterials
    ].filter(Boolean)

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
  }, [flightPath, entry, referencePath, runway])

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
    
    if (progressBarFillRef.current) {
      progressBarFillRef.current.style.width = '0%'
    }
    
    lastPausedIndexRef.current = -1
    if (flightPath && flightPath.length > 0) {
      const firstPoint = flightPath[0]
      if (firstPoint) {
        setCurrentData({
          lat: firstPoint.lat,
          lon: firstPoint.lon,
          alt: firstPoint.alt || 0,
          bank: firstPoint.bank || 0,
          heading: firstPoint.heading || 0,
          airspeed: firstPoint.airspeed || 0,
          pitch: firstPoint.pitch || 0
        })
      }
    }
  }

  const seekToProgress = (progress) => {
    const clampedProgress = Math.max(0, Math.min(1, progress))
    setAnimationProgress(clampedProgress)
    
    if (progressBarFillRef.current) {
      progressBarFillRef.current.style.width = `${clampedProgress * 100}%`
    }
    
    const duration = animationDurationRef.current
    animationTimeRef.current = clampedProgress * duration
    
    const pathData = pathDataRef.current
    if (pathData.length > 0 && planeGroupRef.current) {
      const exactIndex = clampedProgress * (pathData.length - 1)
      const pathIndex = Math.floor(exactIndex)
      const nextIndex = Math.min(pathIndex + 1, pathData.length - 1)
      const t = exactIndex % 1
      
      const currentPathData = pathData[pathIndex]
      const nextPathData = pathData[nextIndex]
      
      if (currentPathData && nextPathData) {
        const position = currentPathData.position.clone().lerp(nextPathData.position, t)
        planeGroupRef.current.position.copy(position)
        
        const bank = THREE.MathUtils.lerp(currentPathData.bank, nextPathData.bank, t)
        const pitch = THREE.MathUtils.lerp(currentPathData.pitch, nextPathData.pitch, t)
        const heading = THREE.MathUtils.lerp(currentPathData.heading, nextPathData.heading, t)
        
        const direction = nextPathData.position.clone().sub(currentPathData.position).normalize()
        const lookAhead = position.clone().add(direction.clone().multiplyScalar(50))
        
        planeGroupRef.current.rotation.set(0, 0, 0)
        planeGroupRef.current.lookAt(lookAhead)
        planeGroupRef.current.rotateX(-pitch * Math.PI / 180)
        planeGroupRef.current.rotateZ(bank * Math.PI / 180)
        
        setCurrentData({
          lat: THREE.MathUtils.lerp(currentPathData.lat, nextPathData.lat, t),
          lon: THREE.MathUtils.lerp(currentPathData.lon, nextPathData.lon, t),
          alt: THREE.MathUtils.lerp(currentPathData.alt, nextPathData.alt, t),
          bank: bank,
          heading: heading,
          airspeed: THREE.MathUtils.lerp(currentPathData.airspeed, nextPathData.airspeed, t),
          pitch: pitch
        })
        
        lastPausedIndexRef.current = pathIndex
      }
    }
  }

  const handleProgressBarClick = (e) => {
    if (!progressBarRef.current) return
    
    const rect = progressBarRef.current.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const progress = clickX / rect.width
    
    seekToProgress(progress)
  }

  const calculateGlidepathDeviation = () => {
    if (!currentData || !runway?.threshold) {
      return 0
    }
    if (currentData.lat == null || currentData.lon == null) {
      return 0
    }
    const currentAlt = currentData.alt
    const R = 6371
    const dLat = (runway.threshold.lat - currentData.lat) * Math.PI / 180
    const dLon = (runway.threshold.lon - currentData.lon) * Math.PI / 180
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(currentData.lat * Math.PI / 180) * Math.cos(runway.threshold.lat * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    const distanceNM = R * c * 0.539957
    const targetAlt = GLIDEPATH.getTargetAltitude(distanceNM)
    return currentAlt - targetAlt.msl
  }
  const altitudeDeviation = calculateGlidepathDeviation()
  const altitudeGuideClass = currentData ? getAltitudeGuideClass(altitudeDeviation) : ''
  const bankGuideClass = currentData ? getBankGuideClass(currentData.bank) : ''

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
        <div className="flight-path-3d-meta">
          {runwayName && <span>{runwayName}</span>}
          {runway?.heading != null && <span>Heading {runway.heading}°</span>}
        </div>
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
          <div className="flight-path-speed-control">
            <label className="flight-path-speed-label" title="Playback Speed">
              ⚡
            </label>
            <input
              type="range"
              min="0.25"
              max="4"
              step="0.25"
              value={playbackSpeed}
              onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
              className="flight-path-speed-slider"
              title={`${playbackSpeed}x speed`}
            />
            <span className="flight-path-speed-value">{playbackSpeed}x</span>
          </div>
          <div 
            className="flight-path-progress"
            ref={progressBarRef}
            onClick={handleProgressBarClick}
          >
            <div 
              ref={progressBarFillRef}
              className="flight-path-progress-bar" 
              style={{ width: `${animationProgress * 100}%` }}
            />
          </div>
          {currentData && (
            <div className="flight-path-live-data">
              <div className="live-data-item">
                <span className="live-data-label">Height:</span>
                <span className={`live-data-value ${altitudeGuideClass}`}>
                  {(altitudeDeviation >= 0 ? '+' : '') + Math.round(altitudeDeviation)} ft
                </span>
              </div>
              <div className="live-data-item">
                <span className="live-data-label">Bank:</span>
                <span className={`live-data-value ${bankGuideClass}`}>
                  {Math.round(currentData.bank)}°
                </span>
              </div>
            </div>
          )}
        </div>
        <div className="flight-path-3d-legend">
          <div className="legend-item">
            <span className="legend-color" style={{ background: '#00ffff' }}></span>
            <span>Level Flight (Pre-entry)</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: '#00ffff', borderRadius: '50%' }}></span>
            <span>Entry Point (Bank buildup)</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: '#10121c', borderRadius: '2px', border: '1px solid rgba(255,255,255,0.1)' }}></span>
            <span>Runway Surface</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: '#ffffff' }}></span>
            <span>Runway Centerline</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: '#4ad3ff' }}></span>
            <span>Glidepath Target</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: '#ff4444', borderRadius: '50%' }}></span>
            <span>Threshold Marker</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: '#ffc24d', borderRadius: '50%' }}></span>
            <span>Touchdown Point</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: '#00ff00' }}></span>
            <span>Altitude Acceptable (±100ft)</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: '#ffff00' }}></span>
            <span>Altitude Warning (±150ft)</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: '#ff0000' }}></span>
            <span>Altitude Busted</span>
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
