import { useEffect, useRef, useState } from 'react'
import {
  LANDING_PHASES,
  GLIDEPATH,
  JKA_AIRPORT,
  calculateDistance,
  calculateLateralDeviation,
  calculateBearing,
  normalizeAngle
} from '../utils/landingStandards'
import './ApproachPath.css'

function determineApproachThreshold(runway, aircraftData, flightPath) {
  if (!runway) return null

  if (flightPath && flightPath.length > 0) {
    const endPoint = flightPath[flightPath.length - 1]
    if (endPoint?.lat != null && endPoint?.lon != null) {
      const distToThreshold = calculateDistance(endPoint.lat, endPoint.lon, runway.threshold.lat, runway.threshold.lon)
      const distToOpposite = calculateDistance(endPoint.lat, endPoint.lon, runway.oppositeEnd.lat, runway.oppositeEnd.lon)
      return distToThreshold <= distToOpposite ? runway.threshold : runway.oppositeEnd
    }
  }

  return runway.threshold
}

export default function ApproachPath({
  runway,
  aircraftData,
  flightPath,
  currentPhase,
  glidepathDeviation,
  distanceToThreshold,
  selectedLandingPath = null,
  replayIndex = null,
  isReplayMode = false,
  topViewZoom = 1.0,
  onTopViewDoubleClick = null
}) {
  const topViewCanvasRef = useRef(null)
  const sideViewCanvasRef = useRef(null)
  const [topViewPan, setTopViewPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const lastMousePosRef = useRef({ x: 0, y: 0 })

  const effectiveAircraftData = isReplayMode && replayIndex != null && flightPath && flightPath[replayIndex]
    ? {
        lat: flightPath[replayIndex].lat,
        lon: flightPath[replayIndex].lon,
        alt_ft: flightPath[replayIndex].alt,
        hdg_true: flightPath[replayIndex].heading,
        bank_deg: flightPath[replayIndex].bank,
        pitch_deg: flightPath[replayIndex].pitch,
        ias_kt: flightPath[replayIndex].airspeed,
        vs_fpm: flightPath[replayIndex].vs_fpm
      }
    : aircraftData

  const dataToUse = effectiveAircraftData

  useEffect(() => {
    if (!runway || !effectiveAircraftData) return

    drawTopView()
    drawSideView()
  }, [runway, effectiveAircraftData, flightPath, currentPhase, selectedLandingPath, replayIndex, isReplayMode, topViewZoom, topViewPan])

  function drawTopView() {
    const canvas = topViewCanvasRef.current
    if (!canvas || !runway) return

    const ctx = canvas.getContext('2d')
    const width = canvas.width
    const height = canvas.height
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height)
    
    // Set up coordinate system (center = aircraft position)
    // Scale: 1 NM = 80 pixels (base scale, multiplied by zoom)
    const baseScale = 80 // pixels per NM
    const scale = baseScale * topViewZoom
    const centerX = width / 2
    const centerY = height / 2 // Center of canvas

    // Calculate aircraft position relative to runway
    let aircraftX = 0
    let aircraftY = 0
    let aircraftDistance = null
    let aircraftLateralDev = null
    
    if (dataToUse && dataToUse.lat && dataToUse.lon) {
      aircraftDistance = calculateDistance(
        dataToUse.lat, dataToUse.lon,
        runway.threshold.lat, runway.threshold.lon
      )
      aircraftLateralDev = calculateLateralDeviation(
        dataToUse.lat, dataToUse.lon,
        runway.threshold.lat, runway.threshold.lon,
        runway.oppositeEnd.lat, runway.oppositeEnd.lon
      )
      
      // Aircraft is at center (0, 0) in this coordinate system
      aircraftX = 0
      aircraftY = 0
    }

    // Draw everything relative to aircraft position (with pan offset)
    ctx.save()
    ctx.translate(centerX + topViewPan.x, centerY + topViewPan.y)
    
    // Calculate runway position relative to aircraft
    let runwayX = 0
    let runwayY = 0
    if (aircraftDistance != null && aircraftLateralDev != null) {
      runwayX = -aircraftLateralDev * scale // Negative because aircraft is at center
      runwayY = aircraftDistance * scale // Positive Y is toward threshold
    }
    
    // Draw runway (if within view - within 15 NM of aircraft)
    if (aircraftDistance != null && aircraftDistance <= 15) {
      const runwayLengthPx = (runway.length / 6076) * scale // Convert feet to NM to pixels
      const runwayWidthPx = (runway.width / 6076) * scale
      
      // Runway centerline (extended)
      ctx.strokeStyle = '#666'
      ctx.setLineDash([5, 5])
      ctx.lineWidth = 1
      ctx.beginPath()
      // If no landing path is selected (or path is invalid), extend to 5NM backward from threshold
      // Otherwise, extend to 200 pixels forward as before
      const hasValidPath = selectedLandingPath && selectedLandingPath.length > 3
      if (hasValidPath) {
        // With path: extend forward 200 pixels from threshold
        ctx.moveTo(runwayX, runwayY - runwayLengthPx)
        ctx.lineTo(runwayX, runwayY + 200)
      } else {
        // Without path: extend backward 5NM from threshold (approach direction)
        ctx.moveTo(runwayX, runwayY - 5 * scale)
        ctx.lineTo(runwayX, runwayY + 200)
      }
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
      const gates = ['5.0NM', '4.0NM', '3.0NM', '2.0NM', '1.5NM', '1.0NM', '0.5NM']
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
    if (selectedLandingPath && selectedLandingPath.length > 3 && dataToUse) {
      // Check if aircraft is currently on/near the landing path
      let isOnPath = false
      let minDistToPath = Infinity
      
      // Check distance to all points on the path
      selectedLandingPath.forEach((point) => {
        const distToPoint = calculateDistance(
          dataToUse.lat, dataToUse.lon,
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
        dataToUse.lat, dataToUse.lon,
        pathStart.lat, pathStart.lon
      )
      
      // Draw blue dotted line to path start (only if not on path and not already close to start)
      if (!isOnPath && distToPathStart > 0.5 && distToPathStart <= 15) {
        const bearingToStart = calculateBearing(
          dataToUse.lat, dataToUse.lon,
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
          dataToUse.lat, dataToUse.lon
        )
        
        // Include points within 15 NM of aircraft or 20 NM of threshold (extended view range)
        const distToThreshold = calculateDistance(
          point.lat, point.lon,
          runway.threshold.lat, runway.threshold.lon
        )
        if (distToAircraft <= 15 || distToThreshold <= 20) {
          // Calculate bearing from aircraft to point
          const bearing = calculateBearing(
            dataToUse.lat, dataToUse.lon,
            point.lat, point.lon
          )
          
          // Convert to canvas coordinates (relative to aircraft at center)
          const angleRad = (bearing - 90) * Math.PI / 180 // -90 to make 0° point up
          const x = Math.sin(angleRad) * distToAircraft * scale
          const y = -Math.cos(angleRad) * distToAircraft * scale
          
          referencePoints.push({ x, y, distToAircraft })
        }
      })
      
      // Draw reference path with corridor edges
      if (referencePoints.length > 3) {
        const corridorWidth = 0.15 * scale

        // Create smoothed edge points with interpolation
        const smoothedLeftEdge = []
        const smoothedRightEdge = []

        // First pass: calculate perpendicular vectors at each point
        const edgeData = referencePoints.map((curr, i) => {
          const prev = referencePoints[i - 1] || curr
          const next = referencePoints[i + 1] || curr

          let dx = next.x - prev.x
          let dy = next.y - prev.y
          const len = Math.sqrt(dx * dx + dy * dy)

          if (len > 0) {
            dx /= len
            dy /= len
          } else {
            dx = 0
            dy = -1
          }

          const perpX = -dy
          const perpY = dx

          return {
            center: curr,
            left: { x: curr.x + perpX * corridorWidth, y: curr.y + perpY * corridorWidth },
            right: { x: curr.x - perpX * corridorWidth, y: curr.y - perpY * corridorWidth }
          }
        })

        // Create interpolated points for smoother curves
        for (let i = 0; i < edgeData.length - 1; i++) {
          const curr = edgeData[i]
          const next = edgeData[i + 1]

          smoothedLeftEdge.push(curr.left)

          // Add intermediate point for smoother curves
          const midX = (curr.left.x + next.left.x) / 2
          const midY = (curr.left.y + next.left.y) / 2
          smoothedLeftEdge.push({ x: midX, y: midY })

          smoothedRightEdge.push(curr.right)

          const midRightX = (curr.right.x + next.right.x) / 2
          const midRightY = (curr.right.y + next.right.y) / 2
          smoothedRightEdge.push({ x: midRightX, y: midRightY })
        }

        // Add final points
        if (edgeData.length > 0) {
          smoothedLeftEdge.push(edgeData[edgeData.length - 1].left)
          smoothedRightEdge.push(edgeData[edgeData.length - 1].right)
        }

        // Draw corridor edges with smooth curves
        ctx.strokeStyle = '#ffa50066'
        ctx.lineWidth = 1.5
        ctx.setLineDash([8, 6])
        ctx.globalAlpha = 0.7
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'

        // Draw left edge with smooth curves
        ctx.beginPath()
        if (smoothedLeftEdge.length > 0) {
          ctx.moveTo(smoothedLeftEdge[0].x, smoothedLeftEdge[0].y)
          for (let i = 1; i < smoothedLeftEdge.length; i++) {
            const prev = smoothedLeftEdge[i - 1]
            const curr = smoothedLeftEdge[i]
            if (i === 1 || i === smoothedLeftEdge.length - 1) {
              ctx.lineTo(curr.x, curr.y)
            } else {
              const controlX = (prev.x + curr.x) / 2
              const controlY = (prev.y + curr.y) / 2
              ctx.quadraticCurveTo(controlX, controlY, curr.x, curr.y)
            }
          }
        }
        ctx.stroke()

        // Draw right edge with smooth curves
        ctx.beginPath()
        if (smoothedRightEdge.length > 0) {
          ctx.moveTo(smoothedRightEdge[0].x, smoothedRightEdge[0].y)
          for (let i = 1; i < smoothedRightEdge.length; i++) {
            const prev = smoothedRightEdge[i - 1]
            const curr = smoothedRightEdge[i]
            if (i === 1 || i === smoothedRightEdge.length - 1) {
              ctx.lineTo(curr.x, curr.y)
            } else {
              const controlX = (prev.x + curr.x) / 2
              const controlY = (prev.y + curr.y) / 2
              ctx.quadraticCurveTo(controlX, controlY, curr.x, curr.y)
            }
          }
        }
        ctx.stroke()

        ctx.setLineDash([])
        ctx.globalAlpha = 1.0
        ctx.lineCap = 'butt'
        ctx.lineJoin = 'miter'

        // Draw center reference path with smooth curves
        ctx.strokeStyle = '#ffa500'
        ctx.lineWidth = 2.5
        ctx.setLineDash([12, 6])
        ctx.globalAlpha = 0.75
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()

        if (referencePoints.length > 0) {
          ctx.moveTo(referencePoints[0].x, referencePoints[0].y)
          
          // Use quadratic curves for smooth paths
          for (let i = 1; i < referencePoints.length; i++) {
            const prev = referencePoints[i - 1]
            const curr = referencePoints[i]
            const next = referencePoints[i + 1] || curr
            
            if (i === 1) {
              // First segment: use lineTo
              ctx.lineTo(curr.x, curr.y)
            } else if (i === referencePoints.length - 1) {
              // Last segment: use lineTo
              ctx.lineTo(curr.x, curr.y)
            } else {
              // Middle segments: use quadratic curve with control point at midpoint
              const controlX = (prev.x + curr.x) / 2
              const controlY = (prev.y + curr.y) / 2
              ctx.quadraticCurveTo(controlX, controlY, curr.x, curr.y)
            }
          }
        }

        ctx.stroke()
        ctx.setLineDash([])
        ctx.globalAlpha = 1.0
        ctx.lineCap = 'butt'
        ctx.lineJoin = 'miter'
      }
    }
    
    // Draw flight path (relative to aircraft position)
    if (flightPath && flightPath.length > 3 && aircraftData) {
      const validPoints = []
      
      // Calculate all points relative to current aircraft position
      // For landing approaches, show ALL points in the flight path that are part of the approach
      // This ensures the complete path is visible, not just what's near the current aircraft position
      flightPath.forEach((point) => {
        // Distance from point to current aircraft (for positioning)
        const distToAircraft = calculateDistance(
          point.lat, point.lon,
          dataToUse.lat, dataToUse.lon
        )
        
        // Distance from point to runway threshold
        const distToThreshold = calculateDistance(
          point.lat, point.lon,
          runway.threshold.lat, runway.threshold.lon
        )
        
        // Include ALL points that are:
        // 1. Within 15 NM of aircraft (normal view range), OR
        // 2. Within 20 NM of runway threshold (full approach range)
        // This ensures we see the complete approach path from start to threshold and beyond
        if (distToAircraft <= 15 || distToThreshold <= 20) {
          // Calculate bearing from aircraft to point for positioning
          const bearing = calculateBearing(
            dataToUse.lat, dataToUse.lon,
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
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        
        if (validPoints.length > 0) {
          ctx.moveTo(validPoints[0].x, validPoints[0].y)
          
          // Use quadratic curves for smooth paths
          for (let i = 1; i < validPoints.length; i++) {
            const prev = validPoints[i - 1]
            const curr = validPoints[i]
            
            if (i === 1) {
              ctx.lineTo(curr.x, curr.y)
            } else if (i === validPoints.length - 1) {
              ctx.lineTo(curr.x, curr.y)
            } else {
              const controlX = (prev.x + curr.x) / 2
              const controlY = (prev.y + curr.y) / 2
              ctx.quadraticCurveTo(controlX, controlY, curr.x, curr.y)
            }
          }
        }
        
        ctx.stroke()
      }
    }
    
    // Draw aircraft position (always at center when we have position data)
    if (dataToUse && dataToUse.lat && dataToUse.lon) {
      // Aircraft symbol (at center, 0, 0)
      ctx.save()
      ctx.translate(0, 0) // Aircraft is always at center
      // Icon is drawn pointing UP (nose at -Y).
      // Rotate to match aircraft heading (0° = North = up)
      const headingRad = (dataToUse.hdg_true - 90) * Math.PI / 180 // -90 to make 0° point up
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
    if (aircraftDistance != null && aircraftDistance <= 15) {
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
    if (dataToUse && dataToUse.hdg_true != null) {
      const headingRad = (dataToUse.hdg_true - 90) * Math.PI / 180
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
    
    ctx.clearRect(0, 0, width, height)

    const PROFILE_DISTANCE_NM = 7.0
    const INTERCEPT_DISTANCE_NM = 5.0
    const ALT_FLOOR_PADDING_FT = 50
    const TOP_ALT_MSL = 2500
    const LEFT_PADDING = 70
    const BOTTOM_PADDING = 30
    
    const TICK_MARK_LENGTH = 6
    const TICK_MARK_SPACING_NM = 1
    const TICK_MARK_LABEL_OFFSET_Y = 16
    const TICK_MARK_LABEL_OFFSET_X = -5
    
    const GLIDEPATH_DOT_SIZE_SMALL = 3
    const GLIDEPATH_DOT_SIZE_LARGE = 4
    const GLIDEPATH_DOT_DISTANCE_THRESHOLD = 1
    const GLIDEPATH_DOT_LABEL_OFFSET_X = -20
    const GLIDEPATH_DOT_LABEL_OFFSET_Y = -10

    const interceptAltMsl = GLIDEPATH.getTargetAltitude(INTERCEPT_DISTANCE_NM).msl
    const thresholdAltMsl = GLIDEPATH.getTargetAltitude(0).msl
    const approachThreshold = runway.threshold

    const topAltMsl = TOP_ALT_MSL
    const bottomAltMsl = Math.max(0, thresholdAltMsl - ALT_FLOOR_PADDING_FT)
    const altRangeFt = Math.max(1, topAltMsl - bottomAltMsl)

    const RIGHT_PADDING = 40
    const usableWidth = width - LEFT_PADDING - RIGHT_PADDING
    const distToX = (distNm) => {
      const clamped = Math.max(0, Math.min(PROFILE_DISTANCE_NM, distNm))
      const normalized = (clamped / PROFILE_DISTANCE_NM) * usableWidth
      return LEFT_PADDING + normalized
    }

    const altToY = (altMsl) => {
      const a = Math.max(bottomAltMsl, Math.min(topAltMsl, altMsl))
      return height - BOTTOM_PADDING - ((a - bottomAltMsl) / altRangeFt) * (height - BOTTOM_PADDING)
    }

    const distanceFromApproachThreshold = (point) => {
      if (!point || !approachThreshold) return 0
      return calculateDistance(point.lat, point.lon, approachThreshold.lat, approachThreshold.lon)
    }

    const baselineY = height - BOTTOM_PADDING
    const axisY = Math.round(baselineY) + 1
    const centerX = LEFT_PADDING

    ctx.strokeStyle = '#4a4a4a'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(LEFT_PADDING, axisY)
    ctx.lineTo(width, axisY)
    ctx.stroke()

    const tickStep = 500
    const firstTick = Math.ceil(bottomAltMsl / tickStep) * tickStep
    for (let alt = firstTick; alt <= topAltMsl; alt += tickStep) {
      const y = altToY(alt)

      ctx.strokeStyle = 'rgba(255,255,255,0.12)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(LEFT_PADDING, y)
      ctx.lineTo(width, y)
      ctx.stroke()

      ctx.strokeStyle = 'rgba(255,255,255,0.5)'
      ctx.beginPath()
      ctx.moveTo(LEFT_PADDING - 8, y)
      ctx.lineTo(LEFT_PADDING - 2, y)
      ctx.stroke()

      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.font = '12px monospace'
      ctx.fillText(`${alt}`, 6, y + 4)
    }

    const levelStartX = distToX(PROFILE_DISTANCE_NM)
    const levelEndX = distToX(INTERCEPT_DISTANCE_NM)
    const levelY = altToY(interceptAltMsl)

    ctx.beginPath()
    ctx.moveTo(levelStartX, levelY)
    ctx.lineTo(levelEndX, levelY)
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 2
    ctx.setLineDash([])
    ctx.stroke()

    const descentStartX = distToX(INTERCEPT_DISTANCE_NM)
    const descentStartY = altToY(interceptAltMsl)
    const descentEndX = distToX(0)
    const descentEndY = altToY(thresholdAltMsl)

    ctx.beginPath()
    ctx.moveTo(descentStartX, descentStartY)
    ctx.lineTo(descentEndX, descentEndY)
    ctx.strokeStyle = '#4a9eff'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 6])
    ctx.stroke()
    ctx.setLineDash([])

    const fafX = distToX(INTERCEPT_DISTANCE_NM)
    const fafY = altToY(interceptAltMsl)
    ctx.beginPath()
    ctx.arc(fafX, fafY, 4, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.font = '12px monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fillText('GS INT', fafX + 8, fafY - 8)

    const patternAltY = altToY(JKA_AIRPORT.patternAltitude)
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

    const gates = ['5.0NM', '4.0NM', '3.0NM', '2.0NM', '1.0NM', '0.5NM']
    gates.forEach(gateName => {
      const gate = GLIDEPATH.gates[gateName]
      if (gate) {
        if (gate.distance <= PROFILE_DISTANCE_NM) {
          const x = distToX(gate.distance)
          const calculatedAlt = GLIDEPATH.getTargetAltitude(gate.distance).msl
          const y = altToY(calculatedAlt)

          ctx.fillStyle = '#4a9eff'
          ctx.beginPath()
          const dotSize = gate.distance < GLIDEPATH_DOT_DISTANCE_THRESHOLD ? GLIDEPATH_DOT_SIZE_SMALL : GLIDEPATH_DOT_SIZE_LARGE
          ctx.arc(x, y, dotSize, 0, Math.PI * 2)
          ctx.fill()

          if (gate.distance >= 2 || gate.distance === 1) {
            ctx.font = '10px monospace'
            ctx.fillText(gateName, x + GLIDEPATH_DOT_LABEL_OFFSET_X, y + GLIDEPATH_DOT_LABEL_OFFSET_Y)
          }
        }
      }
    })

    if (flightPath && flightPath.length > 3) {
      ctx.strokeStyle = '#00ff88'
      ctx.lineWidth = 2
      ctx.beginPath()
      
      let pathDrawn = false
      flightPath.forEach((point, idx) => {
        const distFromThreshold = distanceFromApproachThreshold(point)
        
        if (distFromThreshold <= PROFILE_DISTANCE_NM) {
          const x = distToX(Math.max(0, distFromThreshold))
          const y = altToY(point.alt)
          
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

    if (dataToUse) {
      const distanceToThreshold = distanceFromApproachThreshold(dataToUse)
      const x = distToX(Math.max(0, distanceToThreshold))
      const y = altToY(dataToUse.alt_ft)
      
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
      ctx.fillText(`${Math.round(dataToUse.alt_ft)} ft`, x + 10, y - 10)
      
      if (glidepathDeviation != null && Math.abs(glidepathDeviation) > 10) {
        const targetAltMsl = dataToUse.alt_ft - glidepathDeviation
        const targetY = altToY(targetAltMsl)
        
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

    ctx.fillStyle = '#aaa'
    ctx.font = '10px monospace'
    for (let dist = 0; dist <= PROFILE_DISTANCE_NM; dist += TICK_MARK_SPACING_NM) {
      const x = Math.round(distToX(dist)) + 0.5
      ctx.strokeStyle = '#aaa'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, axisY - TICK_MARK_LENGTH / 2)
      ctx.lineTo(x, axisY + TICK_MARK_LENGTH / 2)
      ctx.stroke()
      ctx.fillText(`${dist}`, x + TICK_MARK_LABEL_OFFSET_X, axisY + TICK_MARK_LABEL_OFFSET_Y)
    }
    ctx.fillText('NM', distToX(PROFILE_DISTANCE_NM) + 10, axisY + TICK_MARK_LABEL_OFFSET_Y)

    ctx.fillStyle = '#fff'
    ctx.font = '12px monospace'
    ctx.fillText('3° Glidepath', 10, 20)
    const thresholdLabelX = distToX(0) + 6
    ctx.fillText('Threshold', thresholdLabelX, axisY + TICK_MARK_LABEL_OFFSET_Y)
  }

  // Mouse handlers for top view panning
  const handleTopViewMouseDown = (e) => {
    if (!isReplayMode) return // Only allow panning in replay mode
    setIsDragging(true)
    lastMousePosRef.current = { x: e.clientX, y: e.clientY }
    e.preventDefault()
  }

  const handleTopViewMouseMove = (e) => {
    if (!isDragging || !isReplayMode) return
    const deltaX = e.clientX - lastMousePosRef.current.x
    const deltaY = e.clientY - lastMousePosRef.current.y
    setTopViewPan(prev => ({
      x: prev.x + deltaX,
      y: prev.y + deltaY
    }))
    lastMousePosRef.current = { x: e.clientX, y: e.clientY }
    e.preventDefault()
  }

  const handleTopViewMouseUp = () => {
    setIsDragging(false)
  }

  const handleTopViewMouseLeave = () => {
    setIsDragging(false)
  }

  const handleTopViewDoubleClick = () => {
    if (isReplayMode && onTopViewDoubleClick) {
      setTopViewPan({ x: 0, y: 0 })
      onTopViewDoubleClick()
    }
  }

  // Reset pan when zoom changes
  useEffect(() => {
    if (isReplayMode) {
      setTopViewPan({ x: 0, y: 0 })
    }
  }, [topViewZoom, isReplayMode])

  return (
    <div className="approach-path">
      <div className="view-container">
        <div className="view-header">Top View</div>
        <canvas 
          ref={topViewCanvasRef}
          width={400}
          height={300}
          className={`path-canvas ${isReplayMode ? 'draggable' : ''}`}
          onMouseDown={handleTopViewMouseDown}
          onMouseMove={handleTopViewMouseMove}
          onMouseUp={handleTopViewMouseUp}
          onMouseLeave={handleTopViewMouseLeave}
          onDoubleClick={handleTopViewDoubleClick}
          style={{ cursor: isReplayMode ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
        />
      </div>
      
      <div className="view-container side-profile-container">
        <div className="view-header">Side Profile</div>
        <canvas 
          ref={sideViewCanvasRef}
          width={600}
          height={400}
          className="path-canvas"
        />
      </div>
    </div>
  )
}
