import { useEffect, useRef } from 'react'
import {
  LANDING_PHASES,
  GLIDEPATH,
  JKA_AIRPORT,
  calculateDistance,
  calculateLateralDeviation
} from '../utils/landingStandards'
import './ApproachPath.css'

export default function ApproachPath({
  runway,
  aircraftData,
  flightPath,
  currentPhase,
  glidepathDeviation,
  distanceToThreshold
}) {
  const topViewCanvasRef = useRef(null)
  const sideViewCanvasRef = useRef(null)

  useEffect(() => {
    if (!runway || !aircraftData) return

    drawTopView()
    drawSideView()
  }, [runway, aircraftData, flightPath, currentPhase])

  function drawTopView() {
    const canvas = topViewCanvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const width = canvas.width
    const height = canvas.height
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height)
    
    // Set up coordinate system (center = runway threshold)
    // Scale: 1 NM = 100 pixels
    const scale = 100 // pixels per NM
    const centerX = width / 2
    const centerY = height - 50 // Threshold near bottom

    // Draw runway
    ctx.save()
    ctx.translate(centerX, centerY)
    
    // Runway centerline (extended)
    ctx.strokeStyle = '#666'
    ctx.setLineDash([5, 5])
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, -500)
    ctx.stroke()
    ctx.setLineDash([])
    
    // Runway surface
    const runwayLengthPx = (runway.length / 6076) * scale // Convert feet to NM to pixels
    const runwayWidthPx = (runway.width / 6076) * scale
    ctx.fillStyle = '#333'
    ctx.fillRect(-runwayWidthPx / 2, 0, runwayWidthPx, Math.min(runwayLengthPx, 30))
    
    // Threshold marking
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(-runwayWidthPx / 2, 0)
    ctx.lineTo(runwayWidthPx / 2, 0)
    ctx.stroke()
    
    // Draw glidepath gates
    const gates = ['1.5NM', '1.0NM', '0.5NM']
    gates.forEach(gateName => {
      const gate = GLIDEPATH.gates[gateName]
      const y = -gate.distance * scale
      
      ctx.strokeStyle = '#4a9eff'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(-50, y)
      ctx.lineTo(50, y)
      ctx.stroke()
      ctx.setLineDash([])
      
      ctx.fillStyle = '#4a9eff'
      ctx.font = '10px monospace'
      ctx.fillText(gateName, 55, y + 4)
    })
    
    // Draw pattern reference (downwind)
    if (currentPhase === LANDING_PHASES.DOWNWIND) {
      ctx.strokeStyle = '#ffa500'
      ctx.lineWidth = 2
      ctx.setLineDash([10, 5])
      ctx.beginPath()
      ctx.moveTo(-100, -100)
      ctx.lineTo(-100, 0)
      ctx.stroke()
      ctx.setLineDash([])
    }
    
    // Draw flight path
    if (flightPath.length > 1) {
      ctx.strokeStyle = '#00ff88'
      ctx.lineWidth = 2
      ctx.beginPath()
      
      flightPath.forEach((point, idx) => {
        const dist = calculateDistance(
          point.lat, point.lon,
          runway.threshold.lat, runway.threshold.lon
        )
        const lateralDev = calculateLateralDeviation(
          point.lat, point.lon,
          runway.threshold.lat, runway.threshold.lon,
          runway.oppositeEnd.lat, runway.oppositeEnd.lon
        )
        
        const x = lateralDev * scale
        const y = -dist * scale
        
        if (idx === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
      })
      ctx.stroke()
    }
    
    // Draw aircraft position
    if (aircraftData && distanceToThreshold != null) {
      const lateralDev = calculateLateralDeviation(
        aircraftData.lat, aircraftData.lon,
        runway.threshold.lat, runway.threshold.lon,
        runway.oppositeEnd.lat, runway.oppositeEnd.lon
      )
      
      const x = lateralDev * scale
      const y = -distanceToThreshold * scale
      
      // Aircraft symbol
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate((aircraftData.hdg_true - runway.heading) * Math.PI / 180)
      
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
      
      // Distance label
      ctx.fillStyle = '#ffff00'
      ctx.font = '12px monospace'
      ctx.fillText(`${distanceToThreshold.toFixed(1)} NM`, x + 10, y - 10)
    }
    
    ctx.restore()
    
    // Labels
    ctx.fillStyle = '#fff'
    ctx.font = '12px monospace'
    ctx.fillText(`RWY ${runway.heading}°`, centerX - 30, height - 10)
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
    
    // Draw flight path
    if (flightPath.length > 1) {
      ctx.strokeStyle = '#00ff88'
      ctx.lineWidth = 2
      ctx.beginPath()
      
      flightPath.forEach((point, idx) => {
        const dist = calculateDistance(
          point.lat, point.lon,
          runway.threshold.lat, runway.threshold.lon
        )
        
        const x = centerX - (dist * scale)
        const y = baselineY - (point.alt * altScale)
        
        if (idx === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
      })
      ctx.stroke()
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

