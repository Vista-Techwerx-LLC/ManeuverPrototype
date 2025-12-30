import { useEffect, useRef } from 'react'
import {
  LANDING_PHASES,
  GLIDEPATH,
  JKA_AIRPORT,
  calculateDistance,
  calculateLateralDeviation,
  calculateBearing
} from '../utils/landingStandards'
import './ApproachPath.css'

export default function ApproachPath({
  runway,
  aircraftData,
  flightPath,
  currentPhase,
  glidepathDeviation,
  distanceToThreshold,
  selectedLandingPath = null
}) {
  const topViewCanvasRef = useRef(null)
  const sideViewCanvasRef = useRef(null)

  useEffect(() => {
    if (!runway || !aircraftData) return

    drawTopView()
    drawSideView()
  }, [runway, aircraftData, flightPath, currentPhase, selectedLandingPath])

  function drawTopView() {
    const canvas = topViewCanvasRef.current
    if (!canvas || !runway) return

    const ctx = canvas.getContext('2d')
    const width = canvas.width
    const height = canvas.height
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height)
    
    // Set up coordinate system (center = aircraft position)
    // Scale: 1 NM = 80 pixels
    const scale = 80 // pixels per NM
    const centerX = width / 2
    const centerY = height / 2 // Center of canvas

    // Calculate aircraft position relative to runway
    let aircraftX = 0
    let aircraftY = 0
    let aircraftDistance = null
    let aircraftLateralDev = null
    
    if (aircraftData && aircraftData.lat && aircraftData.lon) {
      aircraftDistance = calculateDistance(
        aircraftData.lat, aircraftData.lon,
        runway.threshold.lat, runway.threshold.lon
      )
      aircraftLateralDev = calculateLateralDeviation(
        aircraftData.lat, aircraftData.lon,
        runway.threshold.lat, runway.threshold.lon,
        runway.oppositeEnd.lat, runway.oppositeEnd.lon
      )
      
      // Aircraft is at center (0, 0) in this coordinate system
      aircraftX = 0
      aircraftY = 0
    }

    // Draw everything relative to aircraft position
    ctx.save()
    ctx.translate(centerX, centerY)
    
    // Calculate runway position relative to aircraft
    let runwayX = 0
    let runwayY = 0
    if (aircraftDistance != null && aircraftLateralDev != null) {
      runwayX = -aircraftLateralDev * scale // Negative because aircraft is at center
      runwayY = aircraftDistance * scale // Positive Y is toward threshold
    }
    
    // Draw runway (if within view - within 10 NM of aircraft)
    if (aircraftDistance != null && aircraftDistance <= 10) {
      const runwayLengthPx = (runway.length / 6076) * scale // Convert feet to NM to pixels
      const runwayWidthPx = (runway.width / 6076) * scale
      
      // Runway centerline (extended)
      ctx.strokeStyle = '#666'
      ctx.setLineDash([5, 5])
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(runwayX, runwayY - runwayLengthPx)
      ctx.lineTo(runwayX, runwayY + 200) // Extend beyond threshold
      ctx.stroke()
      ctx.setLineDash([])
      
      // Runway surface
      ctx.fillStyle = '#333'
      ctx.fillRect(runwayX - runwayWidthPx / 2, runwayY, runwayWidthPx, runwayLengthPx)
      
      // Threshold marking
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(runwayX - runwayWidthPx / 2, runwayY)
      ctx.lineTo(runwayX + runwayWidthPx / 2, runwayY)
      ctx.stroke()
      
      // Draw glidepath gates (relative to runway threshold)
      const gates = ['1.5NM', '1.0NM', '0.5NM']
      gates.forEach(gateName => {
        const gate = GLIDEPATH.gates[gateName]
        const gateY = runwayY - gate.distance * scale // Gate is before threshold
        
        // Only draw if gate is within view
        if (Math.abs(gateY) < height / 2 && Math.abs(runwayX) < width / 2) {
          ctx.strokeStyle = '#4a9eff'
          ctx.lineWidth = 1
          ctx.setLineDash([3, 3])
          ctx.beginPath()
          ctx.moveTo(runwayX - 50, gateY)
          ctx.lineTo(runwayX + 50, gateY)
          ctx.stroke()
          ctx.setLineDash([])
          
          ctx.fillStyle = '#4a9eff'
          ctx.font = '10px monospace'
          ctx.fillText(gateName, runwayX + 55, gateY + 4)
        }
      })
    }
    
    // Draw selected landing path (reference path) if provided
    if (selectedLandingPath && selectedLandingPath.length > 3 && aircraftData) {
      // Check if aircraft is currently on/near the landing path
      let isOnPath = false
      let minDistToPath = Infinity
      
      // Check distance to all points on the path
      selectedLandingPath.forEach((point) => {
        const distToPoint = calculateDistance(
          aircraftData.lat, aircraftData.lon,
          point.lat, point.lon
        )
        minDistToPath = Math.min(minDistToPath, distToPoint)
        // Consider "on path" if within 0.3 NM of any point
        if (distToPoint <= 0.3) {
          isOnPath = true
        }
      })
      
      // Find the start of the landing path (first point)
      const pathStart = selectedLandingPath[0]
      
      // Calculate distance and bearing from aircraft to path start
      const distToPathStart = calculateDistance(
        aircraftData.lat, aircraftData.lon,
        pathStart.lat, pathStart.lon
      )
      
      // Draw blue dotted line to path start (only if not on path and not already close to start)
      if (!isOnPath && distToPathStart > 0.5 && distToPathStart <= 10) {
        const bearingToStart = calculateBearing(
          aircraftData.lat, aircraftData.lon,
          pathStart.lat, pathStart.lon
        )
        
        // Convert to canvas coordinates (relative to aircraft at center)
        const angleRad = (bearingToStart - 90) * Math.PI / 180 // -90 to make 0° point up
        const startX = Math.sin(angleRad) * distToPathStart * scale
        const startY = -Math.cos(angleRad) * distToPathStart * scale
        
        // Draw blue dotted line from aircraft (0, 0) to path start
        ctx.strokeStyle = '#4a9eff'
        ctx.lineWidth = 2
        ctx.setLineDash([8, 4])
        ctx.globalAlpha = 0.8
        ctx.beginPath()
        ctx.moveTo(0, 0) // Aircraft at center
        ctx.lineTo(startX, startY) // Path start
        ctx.stroke()
        ctx.setLineDash([])
        ctx.globalAlpha = 1.0
        
        // Add label at path start
        ctx.fillStyle = '#4a9eff'
        ctx.font = '11px monospace'
        ctx.fillText(`Path Start (${distToPathStart.toFixed(1)} NM)`, startX + 5, startY - 5)
      }
      
      const referencePoints = []
      
      // Calculate all points relative to aircraft position
      selectedLandingPath.forEach((point) => {
        // Distance from point to aircraft
        const distToAircraft = calculateDistance(
          point.lat, point.lon,
          aircraftData.lat, aircraftData.lon
        )
        
        // Only include points within 10 NM of aircraft (view range)
        if (distToAircraft <= 10) {
          // Calculate bearing from aircraft to point
          const bearing = calculateBearing(
            aircraftData.lat, aircraftData.lon,
            point.lat, point.lon
          )
          
          // Convert to canvas coordinates (relative to aircraft at center)
          const angleRad = (bearing - 90) * Math.PI / 180 // -90 to make 0° point up
          const x = Math.sin(angleRad) * distToAircraft * scale
          const y = -Math.cos(angleRad) * distToAircraft * scale
          
          referencePoints.push({ x, y, distToAircraft })
        }
      })
      
      // Draw reference path in orange dotted line
      if (referencePoints.length > 3) {
        ctx.strokeStyle = '#ffa500'
        ctx.lineWidth = 2.5
        ctx.setLineDash([12, 6])
        ctx.globalAlpha = 0.75
        ctx.beginPath()
        
        referencePoints.forEach((pt, idx) => {
          if (idx === 0) {
            ctx.moveTo(pt.x, pt.y)
          } else {
            ctx.lineTo(pt.x, pt.y)
          }
        })
        
        ctx.stroke()
        ctx.setLineDash([])
        ctx.globalAlpha = 1.0
      }
    }
    
    // Draw flight path (relative to aircraft position)
    if (flightPath && flightPath.length > 3 && aircraftData) {
      const validPoints = []
      
      // Calculate all points relative to current aircraft position
      flightPath.forEach((point) => {
        // Distance from point to current aircraft
        const distToAircraft = calculateDistance(
          point.lat, point.lon,
          aircraftData.lat, aircraftData.lon
        )
        
        // Only include points within 10 NM of aircraft (view range)
        if (distToAircraft <= 10) {
          // Calculate bearing from aircraft to point
          const bearing = calculateBearing(
            aircraftData.lat, aircraftData.lon,
            point.lat, point.lon
          )
          
          // Convert to canvas coordinates (relative to aircraft at center)
          const angleRad = (bearing - 90) * Math.PI / 180 // -90 to make 0° point up
          const x = Math.sin(angleRad) * distToAircraft * scale
          const y = -Math.cos(angleRad) * distToAircraft * scale
          
          validPoints.push({ x, y })
        }
      })
      
      // Only draw if we have enough valid points
      if (validPoints.length > 3) {
        ctx.strokeStyle = '#00ff88'
        ctx.lineWidth = 2
        ctx.beginPath()
        
        validPoints.forEach((pt, idx) => {
          if (idx === 0) {
            ctx.moveTo(pt.x, pt.y)
          } else {
            ctx.lineTo(pt.x, pt.y)
          }
        })
        
        ctx.stroke()
      }
    }
    
    // Draw aircraft position (always at center when we have position data)
    if (aircraftData && aircraftData.lat && aircraftData.lon) {
      // Aircraft symbol (at center, 0, 0)
      ctx.save()
      ctx.translate(0, 0) // Aircraft is always at center
      // Icon is drawn pointing UP (nose at -Y).
      // Rotate to match aircraft heading (0° = North = up)
      const headingRad = (aircraftData.hdg_true - 90) * Math.PI / 180 // -90 to make 0° point up
      ctx.rotate(headingRad)
      
      // Draw aircraft icon
      ctx.fillStyle = '#ffff00'
      ctx.beginPath()
      ctx.moveTo(0, -8)
      ctx.lineTo(-6, 6)
      ctx.lineTo(0, 3)
      ctx.lineTo(6, 6)
      ctx.closePath()
      ctx.fill()
      
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 1
      ctx.stroke()
      
      ctx.restore()
      
      // Distance to threshold label
      if (aircraftDistance != null) {
        ctx.fillStyle = '#ffff00'
        ctx.font = '12px monospace'
        ctx.fillText(`${aircraftDistance.toFixed(1)} NM`, 10, -15)
        
        // Lateral deviation label (if significant)
        if (aircraftLateralDev != null && Math.abs(aircraftLateralDev) > 0.01) {
          ctx.fillStyle = '#ffaa00'
          ctx.font = '10px monospace'
          const devFeet = Math.round(aircraftLateralDev * 6076)
          ctx.fillText(`${devFeet > 0 ? '+' : ''}${devFeet} ft`, 10, 0)
        }
      }
    }
    
    ctx.restore()
    
    // Labels and compass
    ctx.fillStyle = '#fff'
    ctx.font = '12px monospace'
    
    // Show runway info if within view
    if (aircraftDistance != null && aircraftDistance <= 10) {
      ctx.fillText(`RWY ${runway.heading}°`, centerX - 30, height - 10)
    }
    
    // Compass rose (top right)
    ctx.save()
    ctx.translate(width - 60, 30)
    ctx.strokeStyle = '#4a9eff'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(0, 0, 20, 0, Math.PI * 2)
    ctx.stroke()
    
    // North indicator
    ctx.fillStyle = '#4a9eff'
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('N', 0, -25)
    ctx.fillText('S', 0, 30)
    ctx.fillText('E', 25, 5)
    ctx.fillText('W', -25, 5)
    
    // Current heading indicator
    if (aircraftData && aircraftData.hdg_true != null) {
      const headingRad = (aircraftData.hdg_true - 90) * Math.PI / 180
      ctx.strokeStyle = '#ffff00'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(Math.sin(headingRad) * 15, -Math.cos(headingRad) * 15)
      ctx.stroke()
    }
    
    ctx.restore()
  }

  function drawSideView() {
    const canvas = sideViewCanvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const width = canvas.width
    const height = canvas.height
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height)
    
    // Set up coordinate system
    const scale = 50 // pixels per NM horizontal
    const altScale = 0.3 // pixels per foot vertical
    const centerX = width - 50 // Threshold on right
    const baselineY = height - 30 // Ground level

    // Draw ground
    ctx.strokeStyle = '#4a4a4a'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, baselineY)
    ctx.lineTo(width, baselineY)
    ctx.stroke()
    
    // Draw field elevation reference
    const fieldElevationY = baselineY - (JKA_AIRPORT.elevation * altScale)
    
    // Draw glidepath
    ctx.strokeStyle = '#4a9eff'
    ctx.lineWidth = 2
    ctx.setLineDash([5, 5])
    ctx.beginPath()
    ctx.moveTo(centerX, fieldElevationY)
    
    // Draw 3° glidepath up to 5 NM
    for (let dist = 0; dist <= 5; dist += 0.1) {
      const targetAlt = GLIDEPATH.getTargetAltitude(dist)
      const x = centerX - (dist * scale)
      const y = baselineY - (targetAlt.msl * altScale)
      
      if (dist === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    }
    ctx.stroke()
    ctx.setLineDash([])
    
    // Draw pattern altitude
    const patternAltY = baselineY - (JKA_AIRPORT.patternAltitude * altScale)
    ctx.strokeStyle = '#ffa500'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(0, patternAltY)
    ctx.lineTo(width, patternAltY)
    ctx.stroke()
    ctx.setLineDash([])
    
    ctx.fillStyle = '#ffa500'
    ctx.font = '10px monospace'
    ctx.fillText(`${JKA_AIRPORT.patternAltitude} ft`, 5, patternAltY - 5)
    
    // Draw gates
    const gates = ['1.5NM', '1.0NM', '0.5NM']
    gates.forEach(gateName => {
      const gate = GLIDEPATH.gates[gateName]
      const x = centerX - (gate.distance * scale)
      const y = baselineY - (gate.targetAltitudeMSL * altScale)
      
      ctx.fillStyle = '#4a9eff'
      ctx.beginPath()
      ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.fill()
      
      ctx.font = '10px monospace'
      ctx.fillText(gateName, x - 20, y - 10)
    })
    
    // Draw flight path (only if airborne and has actual data)
    if (flightPath && flightPath.length > 3) {
      ctx.strokeStyle = '#00ff88'
      ctx.lineWidth = 2
      ctx.beginPath()
      
      let pathDrawn = false
      flightPath.forEach((point, idx) => {
        const dist = calculateDistance(
          point.lat, point.lon,
          runway.threshold.lat, runway.threshold.lon
        )
        
        const x = centerX - (dist * scale)
        const y = baselineY - (point.alt * altScale)
        
        // Only draw points within reasonable range
        if (x >= 0 && x <= width && y >= 0 && y <= height) {
          if (idx === 0 || !pathDrawn) {
            ctx.moveTo(x, y)
            pathDrawn = true
          } else {
            ctx.lineTo(x, y)
          }
        }
      })
      
      if (pathDrawn) {
        ctx.stroke()
      }
    }
    
    // Draw aircraft position
    if (aircraftData && distanceToThreshold != null) {
      const x = centerX - (distanceToThreshold * scale)
      const y = baselineY - (aircraftData.alt_ft * altScale)
      
      // Aircraft symbol
      ctx.fillStyle = '#ffff00'
      ctx.beginPath()
      ctx.arc(x, y, 6, 0, Math.PI * 2)
      ctx.fill()
      
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 1
      ctx.stroke()
      
      // Altitude label
      ctx.fillStyle = '#ffff00'
      ctx.font = '12px monospace'
      ctx.fillText(`${Math.round(aircraftData.alt_ft)} ft`, x + 10, y - 10)
      
      // Glidepath deviation indicator
      if (glidepathDeviation != null && Math.abs(glidepathDeviation) > 10) {
        const targetY = baselineY - ((aircraftData.alt_ft - glidepathDeviation) * altScale)
        
        ctx.strokeStyle = glidepathDeviation > 0 ? '#ff4444' : '#ff8844'
        ctx.lineWidth = 2
        ctx.setLineDash([2, 2])
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x, targetY)
        ctx.stroke()
        ctx.setLineDash([])
        
        // Deviation label
        ctx.fillStyle = glidepathDeviation > 0 ? '#ff4444' : '#ff8844'
        ctx.font = '11px monospace'
        ctx.fillText(
          `${glidepathDeviation > 0 ? '+' : ''}${Math.round(glidepathDeviation)} ft`,
          x + 10,
          (y + targetY) / 2
        )
      }
    }
    
    // Distance scale
    ctx.fillStyle = '#aaa'
    ctx.font = '10px monospace'
    for (let dist = 0; dist <= 5; dist += 1) {
      const x = centerX - (dist * scale)
      ctx.fillText(`${dist}`, x - 5, baselineY + 15)
    }
    ctx.fillText('NM', centerX - (5.5 * scale), baselineY + 15)
    
    // Labels
    ctx.fillStyle = '#fff'
    ctx.font = '12px monospace'
    ctx.fillText('3° Glidepath', 10, 20)
    ctx.fillText('Threshold', centerX - 40, baselineY + 15)
  }

  return (
    <div className="approach-path">
      <div className="view-container">
        <div className="view-header">Top View</div>
        <canvas 
          ref={topViewCanvasRef}
          width={400}
          height={300}
          className="path-canvas"
        />
      </div>
      
      <div className="view-container">
        <div className="view-header">Side Profile</div>
        <canvas 
          ref={sideViewCanvasRef}
          width={400}
          height={200}
          className="path-canvas"
        />
      </div>
    </div>
  )
}
