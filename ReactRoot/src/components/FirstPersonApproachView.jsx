import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import {
  LANDING_PHASES,
  GLIDEPATH,
  JKA_AIRPORT,
  calculateDistance,
  calculateBearing,
  calculateDestinationPoint,
  calculateLateralDeviation
} from '../utils/landingStandards'
import './FirstPersonApproachView.css'

export default function FirstPersonApproachView({
  runway,
  aircraftData,
  distanceToThreshold,
  currentPhase
}) {
  const containerRef = useRef(null)
  const sceneRef = useRef(null)
  const cameraRef = useRef(null)
  const rendererRef = useRef(null)
  const gatesRef = useRef([])
  const runwayMeshRef = useRef(null)

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return

    const width = containerRef.current.clientWidth
    const height = containerRef.current.clientHeight

    // Scene
    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0x87CEEB, 100, 15000) // Sky blue fog
    sceneRef.current = scene

    // Camera (First-person perspective)
    const camera = new THREE.PerspectiveCamera(75, width / height, 1, 20000)
    camera.position.set(0, 0, 0)
    cameraRef.current = camera

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(width, height)
    renderer.setClearColor(0x87CEEB) // Sky blue
    containerRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(100, 200, 100)
    scene.add(directionalLight)

    // Ground plane (simple terrain)
    const groundGeometry = new THREE.PlaneGeometry(30000, 30000)
    const groundMaterial = new THREE.MeshLambertMaterial({ 
      color: 0x3a5f3a,
      side: THREE.DoubleSide
    })
    const ground = new THREE.Mesh(groundGeometry, groundMaterial)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -JKA_AIRPORT.elevation * 0.3048 // Convert ft to meters
    scene.add(ground)

    // Create runway
    createRunway(scene)

    // Create approach gates
    createApproachGates(scene)

    // Create glidepath reference line
    createGlidepathLine(scene)

    // Animation loop
    let animationFrameId
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate)
      renderer.render(scene, camera)
    }
    animate()

    // Handle window resize
    const handleResize = () => {
      if (!containerRef.current) return
      const newWidth = containerRef.current.clientWidth
      const newHeight = containerRef.current.clientHeight
      camera.aspect = newWidth / newHeight
      camera.updateProjectionMatrix()
      renderer.setSize(newWidth, newHeight)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(animationFrameId)
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement)
      }
      renderer.dispose()
    }
  }, [runway])

  // Create runway visualization
  function createRunway(scene) {
    if (!runway) return

    const runwayLengthMeters = runway.length * 0.3048 // Convert feet to meters
    const runwayWidthMeters = runway.width * 0.3048

    // Runway surface
    const runwayGeometry = new THREE.PlaneGeometry(runwayWidthMeters, runwayLengthMeters)
    const runwayMaterial = new THREE.MeshLambertMaterial({ 
      color: 0x2a2a2a,
      side: THREE.DoubleSide
    })
    const runwayMesh = new THREE.Mesh(runwayGeometry, runwayMaterial)
    runwayMesh.rotation.x = -Math.PI / 2
    runwayMesh.position.y = -JKA_AIRPORT.elevation * 0.3048 + 0.1 // Slightly above ground
    runwayMesh.position.z = runwayLengthMeters / 2 // Position so threshold is at origin
    scene.add(runwayMesh)
    runwayMeshRef.current = runwayMesh

    // Centerline markings
    const centerlineGeometry = new THREE.PlaneGeometry(2, runwayLengthMeters * 0.8)
    const centerlineMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xffffff,
      transparent: true,
      opacity: 0.9
    })
    const centerline = new THREE.Mesh(centerlineGeometry, centerlineMaterial)
    centerline.rotation.x = -Math.PI / 2
    centerline.position.y = -JKA_AIRPORT.elevation * 0.3048 + 0.2
    centerline.position.z = runwayLengthMeters / 2
    scene.add(centerline)

    // Threshold markings
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue
      const markGeometry = new THREE.PlaneGeometry(runwayWidthMeters * 0.08, runwayWidthMeters * 0.2)
      const markMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff })
      const mark = new THREE.Mesh(markGeometry, markMaterial)
      mark.rotation.x = -Math.PI / 2
      mark.position.y = -JKA_AIRPORT.elevation * 0.3048 + 0.2
      mark.position.x = i * (runwayWidthMeters * 0.12)
      mark.position.z = 30
      scene.add(mark)
    }

    // Runway number "25" (using text sprites)
    createRunwayNumber(scene, runwayWidthMeters)
  }

  // Create runway number markers using canvas texture
  function createRunwayNumber(scene, runwayWidth) {
    // Create canvas with "25" text
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    canvas.width = 256
    canvas.height = 512

    context.fillStyle = 'white'
    context.font = 'Bold 400px Arial'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText('25', 128, 256)

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas)
    const numberMaterial = new THREE.MeshBasicMaterial({ 
      map: texture,
      transparent: true,
      side: THREE.DoubleSide
    })
    
    const numberGeometry = new THREE.PlaneGeometry(runwayWidth * 0.3, runwayWidth * 0.6)
    const number = new THREE.Mesh(numberGeometry, numberMaterial)
    number.rotation.x = -Math.PI / 2
    number.position.y = -JKA_AIRPORT.elevation * 0.3048 + 0.2
    number.position.z = 100
    scene.add(number)
  }

  // Create approach gates (hoops to fly through)
  function createApproachGates(scene) {
    const gates = [
      { name: '1.5NM', distance: 1.5, altitude: 495 },
      { name: '1.0NM', distance: 1.0, altitude: 335 },
      { name: '0.5NM', distance: 0.5, altitude: 175 }
    ]

    gates.forEach(gate => {
      const distanceMeters = gate.distance * 1852 // Convert NM to meters
      const altitudeMeters = gate.altitude * 0.3048 - JKA_AIRPORT.elevation * 0.3048

      // Create hoop/ring
      const ringGeometry = new THREE.TorusGeometry(40, 2, 16, 32)
      const ringMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x00ff88,
        transparent: true,
        opacity: 0.7
      })
      const ring = new THREE.Mesh(ringGeometry, ringMaterial)
      ring.position.z = -distanceMeters
      ring.position.y = altitudeMeters
      ring.rotation.x = Math.PI / 2
      scene.add(ring)

      // Create gate frame (rectangle)
      const frameGroup = new THREE.Group()
      
      // Vertical posts
      const postGeometry = new THREE.CylinderGeometry(1.5, 1.5, 100, 16)
      const postMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x4a9eff,
        emissive: 0x2266aa,
        emissiveIntensity: 0.3
      })
      
      const leftPost = new THREE.Mesh(postGeometry, postMaterial)
      leftPost.position.x = -60
      leftPost.position.y = altitudeMeters - 50
      leftPost.position.z = -distanceMeters
      frameGroup.add(leftPost)

      const rightPost = new THREE.Mesh(postGeometry, postMaterial)
      rightPost.position.x = 60
      rightPost.position.y = altitudeMeters - 50
      rightPost.position.z = -distanceMeters
      frameGroup.add(rightPost)

      // Top bar
      const barGeometry = new THREE.CylinderGeometry(1.5, 1.5, 120, 16)
      const topBar = new THREE.Mesh(barGeometry, postMaterial)
      topBar.rotation.z = Math.PI / 2
      topBar.position.y = altitudeMeters
      topBar.position.z = -distanceMeters
      frameGroup.add(topBar)

      scene.add(frameGroup)

      // Add distance label (sprite with text)
      createGateLabel(scene, gate.name, distanceMeters, altitudeMeters)

      gatesRef.current.push({ ring, frame: frameGroup, distance: gate.distance })
    })
  }

  // Create gate labels
  function createGateLabel(scene, text, distanceMeters, altitudeMeters) {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    canvas.width = 256
    canvas.height = 128

    context.fillStyle = 'rgba(0, 255, 136, 0.9)'
    context.font = 'Bold 48px Arial'
    context.textAlign = 'center'
    context.fillText(text, 128, 70)

    const texture = new THREE.CanvasTexture(canvas)
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture })
    const sprite = new THREE.Sprite(spriteMaterial)
    sprite.position.set(0, altitudeMeters + 60, -distanceMeters)
    sprite.scale.set(60, 30, 1)
    scene.add(sprite)
  }

  // Create glidepath reference line
  function createGlidepathLine(scene) {
    const points = []
    for (let dist = 0; dist <= 3; dist += 0.1) {
      const distMeters = dist * 1852
      const targetAlt = GLIDEPATH.getTargetAltitude(dist)
      const altMeters = targetAlt.msl * 0.3048 - JKA_AIRPORT.elevation * 0.3048
      points.push(new THREE.Vector3(0, altMeters, -distMeters))
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const material = new THREE.LineBasicMaterial({ 
      color: 0xffaa00,
      transparent: true,
      opacity: 0.5,
      linewidth: 2
    })
    const line = new THREE.Line(geometry, material)
    scene.add(line)
  }

  // Update camera position and orientation based on aircraft data
  useEffect(() => {
    if (!aircraftData || !runway || !cameraRef.current) return

    const camera = cameraRef.current

    // Calculate aircraft position relative to threshold
    const distMeters = distanceToThreshold * 1852 // NM to meters
    const altMeters = aircraftData.alt_ft * 0.3048 - JKA_AIRPORT.elevation * 0.3048

    // Calculate lateral deviation
    const lateralDev = calculateLateralDeviation(
      aircraftData.lat, aircraftData.lon,
      runway.threshold.lat, runway.threshold.lon,
      runway.oppositeEnd.lat, runway.oppositeEnd.lon
    )
    const lateralMeters = lateralDev * 1852 // NM to meters

    // Set camera position (aircraft position)
    camera.position.set(lateralMeters, altMeters, -distMeters)

    // Calculate camera rotation (aircraft heading and pitch)
    const headingRad = ((aircraftData.hdg_true || 0) - runway.heading) * Math.PI / 180
    const pitchRad = (aircraftData.pitch_deg || 0) * Math.PI / 180
    const bankRad = (aircraftData.bank_deg || 0) * Math.PI / 180

    // Apply rotations (heading, pitch, bank)
    camera.rotation.order = 'YXZ'
    camera.rotation.y = -headingRad // Negative because we're looking along -Z
    camera.rotation.x = -pitchRad
    camera.rotation.z = bankRad

    // Highlight gates based on distance
    gatesRef.current.forEach(gate => {
      const distToGate = Math.abs(distanceToThreshold - gate.distance)
      if (distToGate < 0.1) {
        // Near this gate - make it pulse
        gate.ring.material.opacity = 0.5 + Math.sin(Date.now() * 0.005) * 0.3
        gate.ring.material.emissive = new THREE.Color(0x00ff88)
        gate.ring.material.emissiveIntensity = 0.5
      } else {
        gate.ring.material.opacity = 0.7
        gate.ring.material.emissiveIntensity = 0
      }
    })
  }, [aircraftData, runway, distanceToThreshold])

  if (!aircraftData || !runway || distanceToThreshold > 3) {
    return (
      <div className="first-person-view-placeholder">
        <div className="placeholder-content">
          <span className="icon">🛫</span>
          <p>First-Person View</p>
          <p className="hint">Activates within 3 NM of runway</p>
        </div>
      </div>
    )
  }

  return (
    <div className="first-person-view">
      <div ref={containerRef} className="view-container" />
      <div className="hud-overlay">
        <div className="hud-item">
          <span className="hud-label">DIST</span>
          <span className="hud-value">{distanceToThreshold.toFixed(1)} NM</span>
        </div>
        <div className="hud-item">
          <span className="hud-label">ALT</span>
          <span className="hud-value">{Math.round(aircraftData.alt_ft)} ft</span>
        </div>
        <div className="hud-item">
          <span className="hud-label">IAS</span>
          <span className="hud-value">{Math.round(aircraftData.ias_kt)} kt</span>
        </div>
        <div className="hud-center">
          <div className="crosshair">
            <div className="crosshair-h"></div>
            <div className="crosshair-v"></div>
          </div>
          <div className="phase-indicator">{LANDING_PHASES[currentPhase] || currentPhase}</div>
        </div>
      </div>
    </div>
  )
}

