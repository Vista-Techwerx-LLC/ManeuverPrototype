import { useState, useEffect, useRef, useMemo } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { supabase } from '../lib/supabase'
import {
  JKA_AIRPORT,
  LANDING_PHASES,
  PHASE_STANDARDS,
  GLIDEPATH,
  detectLandingPhase,
  checkPhaseCompliance,
  checkGatePassage,
  calculateDistance,
  calculateBearing,
  normalizeAngle
} from '../utils/landingStandards'
import ApproachPath from './ApproachPath'
import ApproachPathReplay from './ApproachPathReplay'
import RunwayCalibration, { loadCustomRunways } from './RunwayCalibration'
import FlightPath3D from './FlightPath3D'
import AutoStart from './AutoStart'
import { gradePathFollowing } from '../utils/pathFollowingGrading'
import { fetchPathFollowingFeedback } from '../lib/aiFeedback'
import { getGradeColorClass } from '../utils/steepTurnGrading'
import { SKILL_LEVELS, MANEUVER_TYPES, AUTO_START_TOLERANCES } from '../utils/autoStartTolerances'
import './Landing.css'

// Helper function to convert heading to cardinal direction
function getCardinalDirection(heading) {
  const directions = ['North', 'NNE', 'NE', 'ENE', 'East', 'ESE', 'SE', 'SSE', 
                     'South', 'SSW', 'SW', 'WSW', 'West', 'WNW', 'NW', 'NNW']
  const index = Math.round(heading / 22.5) % 16
  return directions[index]
}

// Airport code to name lookup
const AIRPORT_NAMES = {
  'KJKA': 'Jack Edwards',
  'KORD': 'O\'Hare International',
  'KLAX': 'Los Angeles International',
  'KJFK': 'John F. Kennedy International',
  'KATL': 'Hartsfield-Jackson Atlanta International',
  'KDFW': 'Dallas/Fort Worth International',
  'KDEN': 'Denver International',
  'KSFO': 'San Francisco International',
  'KSEA': 'Seattle-Tacoma International',
  'KMIA': 'Miami International',
  'KCLT': 'Charlotte Douglas International',
  'KPHX': 'Phoenix Sky Harbor International',
  'KLAS': 'McCarran International',
  'KMSP': 'Minneapolis-Saint Paul International',
  'KDTW': 'Detroit Metropolitan',
  'KBOS': 'Logan International',
  'KIAD': 'Washington Dulles International',
  'KIAH': 'George Bush Intercontinental',
  'KMCO': 'Orlando International',
  'KEWR': 'Newark Liberty International',
  'KPHL': 'Philadelphia International',
  'KBWI': 'Baltimore/Washington International',
  'KSLC': 'Salt Lake City International',
  'KSAN': 'San Diego International',
  'KPDX': 'Portland International',
  'KMCI': 'Kansas City International',
  'KAUS': 'Austin-Bergstrom International',
  'KSTL': 'St. Louis Lambert International',
  'KBNA': 'Nashville International',
  'KRDU': 'Raleigh-Durham International',
}

// Extract airport code from runway name (e.g., "KJKA 27" -> "KJKA")
function extractAirportCode(runwayName) {
  if (!runwayName) return null
  // Match common airport code patterns (3-4 letters, usually starting with K for US airports)
  const match = runwayName.match(/^([A-Z]{3,4})\s/)
  return match ? match[1] : null
}

// Get airport name from code
function getAirportName(airportCode) {
  if (!airportCode) return null
  return AIRPORT_NAMES[airportCode.toUpperCase()] || null
}

// Get runway display name
function getRunwayDisplayName(runwayId, customRunways) {
  if (!runwayId) return 'Select a runway'

  const customRunway = customRunways.find(r => r.id === runwayId)
  if (!customRunway) return runwayId

  const airportCode = extractAirportCode(customRunway.name)
  const airportName = airportCode ? getAirportName(airportCode) : null
  return airportName ? `${customRunway.name} (${airportName})` : customRunway.name
}


const saveInProgress = new Set()

async function saveLandingToDatabase(userId, landingData) {
  const saveKey = `${userId}-landing-${landingData.details.timestamp}`
  
  if (saveInProgress.has(saveKey)) {
    console.log('⚠️ Save already in progress for this landing, skipping duplicate')
    return false
  }
  
  saveInProgress.add(saveKey)
  
  try {
    const { error } = await supabase
      .from('maneuver_results')
      .insert({
        user_id: userId,
        maneuver_type: 'landing',
        grade: landingData.grade,
        result_data: landingData.details
      })
    
    if (error) {
      console.error('Error saving landing:', error)
      saveInProgress.delete(saveKey)
      return false
    }
    
    console.log('✅ Landing saved to database')
    setTimeout(() => saveInProgress.delete(saveKey), 10000)
    return true
  } catch (error) {
    console.error('Error saving landing:', error)
    saveInProgress.delete(saveKey)
    return false
  }
}

export default function Landing({ user }) {
  const { connected, data } = useWebSocket(user.id)
  const [state, setState] = useState('disconnected')
  const [tracking, setTracking] = useState(false)
  const [currentPhase, setCurrentPhase] = useState(LANDING_PHASES.NONE)
  const [phaseHistory, setPhaseHistory] = useState([])
  const [vref, setVref] = useState(60) // Default Vref, user can adjust
  const [selectedRunway, setSelectedRunway] = useState(null)
  const [customRunways, setCustomRunways] = useState([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [pathDropdownOpen, setPathDropdownOpen] = useState(false)
  const [showCalibration, setShowCalibration] = useState(false)
  const [showGradingScale, setShowGradingScale] = useState(false)
  const [flightPath, setFlightPath] = useState([])
  const [savedLandingPaths, setSavedLandingPaths] = useState([])
  const [selectedLandingPath, setSelectedLandingPath] = useState(null)
  const [savePathName, setSavePathName] = useState('')
  const [showSavePathDialog, setShowSavePathDialog] = useState(false)
  const [recordingPath, setRecordingPath] = useState(false)
  const [pathRecording, setPathRecording] = useState([])
  const pathRecordingRef = useRef([]) // Ref to store path data for saving (always current)
  const [isSavingRecordedPath, setIsSavingRecordedPath] = useState(false)
  const [pathFollowingTracking, setPathFollowingTracking] = useState(null) // Track deviations from reference path
  const [pathFollowingResult, setPathFollowingResult] = useState(null)
  const pathStartReached = useRef(false) // Track if we've reached the start of the path
  const pathFollowingCompleting = useRef(false) // Prevent multiple completion calls
  const [nearRunwayButNotPath, setNearRunwayButNotPath] = useState(false) // Track if close to runway but not path
  const [pathFollowingSkillLevel, setPathFollowingSkillLevel] = useState('acs') // Skill level: beginner, novice, acs
  const [currentPathFollowingId, setCurrentPathFollowingId] = useState(null) // Database ID for AI feedback
  const [aiFeedback, setAiFeedback] = useState(null)
  const [aiFocus, setAiFocus] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [phaseMetrics, setPhaseMetrics] = useState({})
  const [gatesPassed, setGatesPassed] = useState([])
  const [violations, setViolations] = useState([])
  const [landingResult, setLandingResult] = useState(null)
  const hasBeenSaved = useRef(false)
  const previousPhase = useRef(LANDING_PHASES.NONE)
  const lastGateCheck = useRef({})
  const touchdownData = useRef(null)
  const landingDeviations = useRef({ maxAltDev: 0, maxSpeedDev: 0, maxBankDev: 0, maxPitchDev: 0, samples: [] })
  const dropdownRef = useRef(null)
  const pathDropdownRef = useRef(null)
  const startTrackingRef = useRef(() => {})
  const stopTrackingRef = useRef(() => {})
  const autoStartTriggered = useRef(false)
  const [autoStartEnabled, setAutoStartEnabled] = useState(false)
  const [autoStartSkillLevel, setAutoStartSkillLevel] = useState(SKILL_LEVELS.ACS)
  const [autoStartStatus, setAutoStartStatus] = useState(null)

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false)
      }
      if (pathDropdownRef.current && !pathDropdownRef.current.contains(event.target)) {
        setPathDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Load custom runways on mount and when user changes
  useEffect(() => {
    async function loadRunways() {
      const loaded = await loadCustomRunways(user)
      setCustomRunways(loaded)
    }
    loadRunways()
  }, [user])

  // Load saved landing paths for current runway (including connected users)
  useEffect(() => {
    async function loadLandingPaths() {
      if (!user || !selectedRunway) return
      
      try {
        // Get accepted connections (both as student and instructor)
        const { data: relationships, error: relError } = await supabase
          .from('instructor_relationships')
          .select('student_id, instructor_id, status')
          .or(`and(student_id.eq.${user.id},status.eq.accepted),and(instructor_id.eq.${user.id},status.eq.accepted)`)
        
        // Collect all connected user IDs (including own)
        const connectedUserIds = [user.id] // Include own paths
        if (!relError && relationships) {
          relationships.forEach(rel => {
            if (rel.student_id === user.id) {
              connectedUserIds.push(rel.instructor_id)
            } else if (rel.instructor_id === user.id) {
              connectedUserIds.push(rel.student_id)
            }
          })
        }
        
        // Load paths from all connected users
        const { data, error } = await supabase
          .from('landing_paths')
          .select('id, path_name, path_data, created_at, user_id')
          .eq('runway_id', selectedRunway)
          .in('user_id', connectedUserIds)
          .order('created_at', { ascending: false })
          .limit(50)
        
        if (error) {
          console.error('Error loading landing paths:', error)
        } else {
          setSavedLandingPaths(data || [])
        }
      } catch (error) {
        console.error('Error loading landing paths:', error)
      }
    }
    loadLandingPaths()
  }, [user, selectedRunway])


  const activeLandingPath = useMemo(() => {
    if (!selectedLandingPath) return null
    return savedLandingPaths.find(path => path.id === selectedLandingPath) || null
  }, [savedLandingPaths, selectedLandingPath])

  // Save current flight path as a landing path
  async function saveCurrentPath() {
    if (!user || !selectedRunway || flightPath.length < 10) {
      alert('Not enough flight path data to save. Need at least 10 points.')
      return
    }
    
    if (!savePathName.trim()) {
      alert('Please enter a name for this landing path')
      return
    }
    
    try {
      const { error } = await supabase
        .from('landing_paths')
        .insert({
          user_id: user.id,
          runway_id: selectedRunway,
          path_name: savePathName.trim(),
          path_data: flightPath
        })
      
      if (error) {
        console.error('Error saving landing path:', error)
        alert('Error saving landing path: ' + error.message)
      } else {
        alert('Landing path saved successfully!')
        setShowSavePathDialog(false)
        setSavePathName('')
        // Reload paths
        const { data } = await supabase
          .from('landing_paths')
          .select('id, path_name, path_data, created_at, user_id')
          .eq('runway_id', selectedRunway)
          .order('created_at', { ascending: false })
          .limit(50)
        setSavedLandingPaths(data || [])
      }
    } catch (error) {
      console.error('Error saving landing path:', error)
      alert('Error saving landing path')
    }
  }

  const runway = useMemo(() => {
    if (!selectedRunway) return null
    
    // Check if selected runway is a custom runway
    const custom = customRunways.find(r => r.id === selectedRunway)
    if (custom) {
      return {
        heading: custom.heading,
        threshold: custom.threshold,
        oppositeEnd: custom.oppositeEnd,
        length: custom.length,
        width: custom.width || 100
      }
    }
    
    return null
  }, [selectedRunway, customRunways])

  // Update state based on connection
  useEffect(() => {
    if (connected && state === 'disconnected') {
      setState('ready')
    } else if (!connected) {
      setState('disconnected')
    }
  }, [connected, state])

  // Landing path recording logic (independent of landing tracking)
  useEffect(() => {
    if (!data || !connected || !recordingPath || !runway) return

    // Capture flight path for landing path recording (sample every ~0.5 seconds, only when airborne and moving)
    const isAirborne = !data.on_ground
    const isMoving = (data.ias_kt || 0) > 30 // Only record when moving faster than 30 knots
    
    if (isAirborne && isMoving) {
      const now = Date.now()
      setPathRecording(prev => {
        const lastSample = prev[prev.length - 1]
        if (!lastSample || now - lastSample.timestamp >= 500) {
          const newPoint = {
            timestamp: now,
            lat: data.lat,
            lon: data.lon,
            alt: data.alt_ft,
            heading: data.hdg_true,
            bank: data.bank_deg || 0,
            airspeed: data.ias_kt,
            pitch: data.pitch_deg || 0,
            vs_fpm: data.vs_fpm
          }
          const newPath = [...prev, newPoint]
          pathRecordingRef.current = newPath // Update ref with latest path
          console.log('Recording path point:', newPoint, 'Total points:', newPath.length)
          return newPath
        }
        return prev
      })
    }
  }, [data, connected, recordingPath, runway])

  // Main tracking logic
  useEffect(() => {
    if (!data || !connected || !tracking || !runway) return

    const phase = detectLandingPhase(data, runway, previousPhase.current)
    
    // Phase change detection
    if (phase !== currentPhase && phase !== LANDING_PHASES.NONE) {
      console.log(`Phase change: ${currentPhase} → ${phase}`)
      setCurrentPhase(phase)
      setPhaseHistory(prev => [...prev, {
        phase,
        timestamp: Date.now(),
        data: { ...data }
      }])
    }
    
    previousPhase.current = phase

    // Check compliance for current phase
    if (phase !== LANDING_PHASES.NONE) {
      const compliance = checkPhaseCompliance(data, phase, runway, vref)
      
      setPhaseMetrics(prev => ({
        ...prev,
        [phase]: {
          ...(prev[phase] || {}),
          ...compliance.metrics,
          violations: compliance.violations,
          compliant: compliance.compliant,
          timestamp: Date.now()
        }
      }))

      // Track violations
      if (compliance.violations.length > 0) {
        setViolations(prev => [
          ...prev,
          ...compliance.violations.map(v => ({
            phase,
            violation: v,
            timestamp: Date.now(),
            data: { ...data }
          }))
        ])
      }
    }

    // Check gate passage on final
    if (phase === LANDING_PHASES.FINAL) {
      const gateInfo = checkGatePassage(data, runway, vref)
      if (gateInfo && !lastGateCheck.current[gateInfo.gate]) {
        console.log(`Passed gate: ${gateInfo.gate}`, gateInfo)
        setGatesPassed(prev => [...prev, {
          ...gateInfo,
          timestamp: Date.now()
        }])
        lastGateCheck.current[gateInfo.gate] = true
      }
    }

    // Detect touchdown
    if (phase === LANDING_PHASES.THRESHOLD && data.on_ground && !touchdownData.current) {
      const distanceFromThreshold = calculateDistance(
        data.lat, data.lon,
        runway.threshold.lat, runway.threshold.lon
      ) * 6076 // Convert to feet
      
      const vsAbs = Math.abs(data.vs_fpm || 0)
      let firmness = 'soft'
      if (vsAbs > 360) firmness = 'hard'
      else if (vsAbs > 240) firmness = 'firm'
      else if (vsAbs > 120) firmness = 'acceptable'
      
      touchdownData.current = {
        timestamp: Date.now(),
        distanceFromThreshold,
        verticalSpeed: data.vs_fpm,
        firmness,
        airspeed: data.ias_kt,
        heading: data.hdg_true,
        data: { ...data }
      }
      
      console.log('Touchdown detected:', touchdownData.current)
    }

    // Complete landing when on ground and rolled out
    if (phase === LANDING_PHASES.ROLLOUT && data.on_ground && 
        (data.ias_kt || 0) < 20 && state !== 'complete') {
      setTimeout(() => {
        completeLanding()
      }, 2000)
    }

    // Capture flight path (sample every ~0.5 seconds, only when airborne and moving)
    const isAirborne = !data.on_ground
    const isMoving = (data.ias_kt || 0) > 30 // Only record when moving faster than 30 knots
    
    if (isAirborne && isMoving) {
      const now = Date.now()
      const lastSample = flightPath[flightPath.length - 1]
      if (!lastSample || now - lastSample.timestamp >= 500) {
        setFlightPath(prev => [...prev, {
          timestamp: now,
          lat: data.lat,
          lon: data.lon,
          alt: data.alt_ft,
          heading: data.hdg_true,
          bank: data.bank_deg || 0,
          airspeed: data.ias_kt,
          pitch: data.pitch_deg || 0,
          phase: phase,
          vs_fpm: data.vs_fpm
        }])

        const distToThreshold = calculateDistance(
          data.lat, data.lon,
          runway.threshold.lat, runway.threshold.lon
        )
        if (distToThreshold < 5) {
          const targetGlide = GLIDEPATH.getTargetAltitude(distToThreshold)
          const altDev = targetGlide ? Math.abs(data.alt_ft - targetGlide.msl) : 0
          const targetSpeed = vref + 5
          const speedDev = Math.abs(data.ias_kt - targetSpeed)
          const bankDev = Math.abs(data.bank_deg || 0)
          const targetPitch = -3
          const pitchDev = Math.abs((data.pitch_deg || 0) - targetPitch)

          landingDeviations.current.maxAltDev = Math.max(landingDeviations.current.maxAltDev, altDev)
          landingDeviations.current.maxSpeedDev = Math.max(landingDeviations.current.maxSpeedDev, speedDev)
          landingDeviations.current.maxBankDev = Math.max(landingDeviations.current.maxBankDev, bankDev)
          landingDeviations.current.maxPitchDev = Math.max(landingDeviations.current.maxPitchDev, pitchDev)
          landingDeviations.current.samples.push({
            timestamp: now,
            altDev,
            speedDev,
            bankDev,
            pitchDev
          })
        }
      }
    }

    // Track deviations from reference path if path following is active
    if (pathFollowingTracking && pathFollowingTracking.referencePath && isAirborne && isMoving) {
      // Check if we should start tracking based on distance from runway threshold AND flight path
      // Start tracking only when BOTH conditions are met: close to runway AND close to path
      if (!pathStartReached.current) {
        const distanceToThreshold = calculateDistance(
          data.lat, data.lon,
          runway.threshold.lat, runway.threshold.lon
        )
        
        // Calculate minimum distance to any point on the flight path
        let minDistToPath = Infinity
        pathFollowingTracking.referencePath.forEach((point) => {
          const distToPoint = calculateDistance(
            data.lat, data.lon,
            point.lat, point.lon
          )
          minDistToPath = Math.min(minDistToPath, distToPoint)
        })
        
        // Detect current landing phase based on distance from runway
        const phase = detectLandingPhase(data, runway, previousPhase.current)
        
        // Check if in approach range (within 5 NM of threshold or in BASE/FINAL phase)
        const inApproachRange = phase === LANDING_PHASES.BASE || phase === LANDING_PHASES.FINAL || distanceToThreshold <= 5
        
        // Check if close to the flight path (within 0.3 NM)
        const closeToPath = minDistToPath <= 0.3
        
        // Start tracking only if BOTH: in approach range AND close to path
        if (inApproachRange && closeToPath) {
          pathStartReached.current = true
          setNearRunwayButNotPath(false)
          console.log(`Landing phase detected (${phase}) and on flight path! Beginning deviation tracking.`)
        } else if (inApproachRange && !closeToPath) {
          // Close to runway but not on path - show message
          setNearRunwayButNotPath(true)
        } else {
          // Not in approach range yet
          setNearRunwayButNotPath(false)
        }
      }
      
      // Only track deviations after reaching the start point
      if (pathStartReached.current) {
        // Find the closest point on the reference path
        let closestPoint = null
        let minDistance = Infinity
        
        pathFollowingTracking.referencePath.forEach((refPoint) => {
          const dist = calculateDistance(
            data.lat, data.lon,
            refPoint.lat, refPoint.lon
          )
          if (dist < minDistance) {
            minDistance = dist
            closestPoint = refPoint
          }
        })
        
        if (closestPoint && minDistance <= 2) { // Only track if within 2 NM of the path
          // Calculate distance to threshold for glide path calculation
          const distanceToThreshold = calculateDistance(
            data.lat, data.lon,
            runway.threshold.lat, runway.threshold.lon
          )
          
          // Calculate deviations
          // Altitude deviation should be from glide path, not reference path point
          const targetGlidepath = distanceToThreshold < 5 
            ? GLIDEPATH.getTargetAltitude(distanceToThreshold)
            : null
          const altDev = targetGlidepath 
            ? data.alt_ft - targetGlidepath.msl
            : data.alt_ft - closestPoint.alt // Fallback to reference path if too far
          const speedDev = data.ias_kt - closestPoint.airspeed
          const bankDev = (data.bank_deg || 0) - (closestPoint.bank || 0)
          const pitchDev = (data.pitch_deg || 0) - (closestPoint.pitch || 0)
          const lateralDev = minDistance // Distance to closest point on path
          
          const now = Date.now()
          const lastDeviation = pathFollowingTracking.deviations[pathFollowingTracking.deviations.length - 1]
          
          // Update current deviations immediately (for live display)
          setPathFollowingTracking(prev => ({
            ...prev,
            currentAltDev: Math.abs(altDev),
            currentLateralDev: lateralDev,
            currentSpeedDev: Math.abs(speedDev),
            currentBankDev: Math.abs(bankDev),
            currentPitchDev: Math.abs(pitchDev)
          }))
          
          // Sample deviations every ~0.5 seconds (for max tracking and data storage)
          if (!lastDeviation || now - lastDeviation.timestamp >= 500) {
            setPathFollowingTracking(prev => ({
              ...prev,
              maxAltDev: Math.max(prev.maxAltDev, Math.abs(altDev)),
              maxLateralDev: Math.max(prev.maxLateralDev, lateralDev),
              maxSpeedDev: Math.max(prev.maxSpeedDev, Math.abs(speedDev)),
              maxBankDev: Math.max(prev.maxBankDev, Math.abs(bankDev)),
              maxPitchDev: Math.max(prev.maxPitchDev, Math.abs(pitchDev)),
              samples: [...prev.samples, {
                timestamp: now,
                altDev,
                lateralDev,
                speedDev,
                bankDev,
                pitchDev,
                closestPointAlt: targetGlidepath ? targetGlidepath.msl : closestPoint.alt,
                closestPointSpeed: closestPoint.airspeed
              }],
              deviations: [...prev.deviations, {
                timestamp: now,
                alt: altDev,
                lateral: lateralDev,
                speed: speedDev,
                bank: bankDev,
                pitch: pitchDev
              }]
            }))
          }
        }
      }
    }

    // Auto-stop path following tracking when grounded and slow (only if we've started tracking)
    // Check this separately from the airborne check above - needs to run even when not airborne
    if (pathFollowingTracking && pathStartReached.current && data.on_ground && (data.ias_kt || 0) < 10 && !pathFollowingResult && !pathFollowingCompleting.current) {
      pathFollowingCompleting.current = true
      setTimeout(() => {
        completePathFollowing()
      }, 1000)
    }
  }, [data, connected, tracking, runway, currentPhase, vref, state, pathFollowingTracking, pathFollowingResult])

  function startTracking() {
    if (!runway) {
      alert('Please select a runway first')
      return
    }
    
    setTracking(true)
    setCurrentPhase(LANDING_PHASES.NONE)
    setPhaseHistory([])
    setFlightPath([])
    setPhaseMetrics({})
    setGatesPassed([])
    setViolations([])
    setLandingResult(null)
    setPathFollowingResult(null)
    hasBeenSaved.current = false
    previousPhase.current = LANDING_PHASES.NONE
    lastGateCheck.current = {}
    touchdownData.current = null
    landingDeviations.current = { maxAltDev: 0, maxSpeedDev: 0, maxBankDev: 0, maxPitchDev: 0, samples: [] }
    setState('tracking')
    
    // Initialize path following tracking if a reference path is selected
    if (selectedLandingPath) {
      const referencePath = savedLandingPaths.find(p => p.id === selectedLandingPath)
      if (referencePath && referencePath.path_data) {
        pathFollowingCompleting.current = false // Reset completion flag
        
        // Check if user is already on/near the path when starting tracking
        let isOnPath = false
        if (data && data.lat && data.lon) {
          referencePath.path_data.forEach((point) => {
            const distToPoint = calculateDistance(
              data.lat, data.lon,
              point.lat, point.lon
            )
            // If within 0.3 NM of any point on the path, consider them on the path
            if (distToPoint <= 0.3) {
              isOnPath = true
            }
          })
        }
        
        pathStartReached.current = isOnPath // Auto-start if already on path
        
        setPathFollowingTracking({
          referencePath: referencePath.path_data,
          pathName: referencePath.path_name,
          maxAltDev: 0,
          maxLateralDev: 0,
          maxSpeedDev: 0,
          maxBankDev: 0,
          maxPitchDev: 0,
          currentAltDev: 0,
          currentLateralDev: 0,
          currentSpeedDev: 0,
          currentBankDev: 0,
          currentPitchDev: 0,
          samples: [],
          deviations: []
        })
        
        if (isOnPath) {
          console.log('Started path following tracking with reference:', referencePath.path_name, '- Already on path, beginning deviation tracking immediately!')
        } else {
          console.log('Started path following tracking with reference:', referencePath.path_name, '- Waiting for path start...')
        }
      }
    } else {
      setPathFollowingTracking(null)
      pathStartReached.current = false
      setNearRunwayButNotPath(false)
    }
    
    console.log('Started tracking landing approach')
  }

  useEffect(() => {
    startTrackingRef.current = startTracking
  }, [startTracking])

  useEffect(() => {
    stopTrackingRef.current = stopTracking
  }, [stopTracking])

  useEffect(() => {
    if (!tracking || state !== 'tracking') return
    if (!data) return
    const speed = data.ias_kt ?? data.ias
    if (speed == null) return
    const threshold = (vref || 0) - 10
    if (speed < threshold) {
      console.log('Stopping tracking: indicated airspeed dropped below Vref - 10 kt')
      stopTrackingRef.current()
    }
  }, [tracking, state, data, vref])

  useEffect(() => {
    if (!tracking) {
      autoStartTriggered.current = false
    }
  }, [tracking])

  useEffect(() => {
    if (!autoStartEnabled) {
      setAutoStartStatus(null)
      return
    }

    if (tracking || state !== 'ready' || recordingPath || !connected || !data || !runway) {
      setAutoStartStatus({ type: 'monitoring', message: 'Waiting for a ready approach to auto-start' })
      return
    }

    if (!activeLandingPath?.path_data?.length) {
      setAutoStartStatus({ type: 'monitoring', message: 'Select a landing path to enable Auto-Start' })
      return
    }

    if (autoStartTriggered.current) return

    const landingTolerance = AUTO_START_TOLERANCES[MANEUVER_TYPES.LANDING]?.[autoStartSkillLevel] || { entryRadiusNm: 0.3 }
    const entryRadius = landingTolerance.entryRadiusNm ?? 0.3

    let distanceToPath = Infinity
    activeLandingPath.path_data.forEach(point => {
      if (point?.lat == null || point?.lon == null) return
      const dist = calculateDistance(data.lat, data.lon, point.lat, point.lon)
      if (dist < distanceToPath) {
        distanceToPath = dist
      }
    })

    if (distanceToPath === Infinity) return

    if (distanceToPath <= entryRadius) {
      setAutoStartStatus({ type: 'ready', message: `Auto-start ready (≤ ${entryRadius.toFixed(2)} NM)` })
      console.log('Autostart: entering landing path, starting tracking')
      autoStartTriggered.current = true
      startTrackingRef.current()
      return
    }

    setAutoStartStatus({
      type: 'monitoring',
      message: `Distance to landing path ${distanceToPath.toFixed(2)} NM (need ≤ ${entryRadius.toFixed(2)} NM)`
    })
  }, [activeLandingPath, autoStartEnabled, autoStartSkillLevel, connected, data, recordingPath, runway, selectedLandingPath, state, tracking])

  useEffect(() => {
    if (!autoStartEnabled) {
      autoStartTriggered.current = false
      setAutoStartStatus(null)
    }
  }, [autoStartEnabled])

  function stopTracking() {
    // If path following is active and we've started tracking, complete it
    if (pathFollowingTracking && pathStartReached.current && !pathFollowingResult && !pathFollowingCompleting.current) {
      pathFollowingCompleting.current = true
      completePathFollowing()
    } else {
      // Save landing data if we have any tracking data, even without a landing path selected
      if (flightPath.length > 0 || phaseHistory.length > 0 || violations.length > 0 || gatesPassed.length > 0) {
        setTracking(false)
        completeLanding()
      } else {
        setTracking(false)
        setState(connected ? 'ready' : 'disconnected')
        setCurrentPhase(LANDING_PHASES.NONE)
        setNearRunwayButNotPath(false)
      }
    }
  }

  function startPathRecording() {
    if (!runway) {
      alert('Please select a runway first')
      return
    }
    setRecordingPath(true)
    setPathRecording([])
    pathRecordingRef.current = [] // Clear ref too
    console.log('Started recording landing path')
  }

  function stopPathRecording() {
    // Use ref to get the most current path data
    const currentPath = [...pathRecordingRef.current]
    console.log('Stopping path recording. Points recorded (state):', pathRecording.length, 'Points recorded (ref):', currentPath.length)
    setRecordingPath(false)
    
    if (currentPath.length >= 10) {
      console.log('Enough points, showing save dialog. Points:', currentPath.length)
      // Ensure state is synced with ref
      setPathRecording(currentPath)
      setIsSavingRecordedPath(true)
      setShowSavePathDialog(true)
    } else {
      console.log('Not enough points:', currentPath.length)
      alert(`Not enough path data recorded. Need at least 10 points. You have ${currentPath.length} points.`)
      setPathRecording([])
      pathRecordingRef.current = []
    }
  }

  async function saveRecordedPath() {
    // Use ref to get the most current path data, fallback to state
    const pathToSave = pathRecordingRef.current.length > 0 ? [...pathRecordingRef.current] : [...pathRecording]
    
    console.log('saveRecordedPath called. Points:', pathToSave.length, 'Name:', savePathName, 'User:', user?.id, 'Runway:', selectedRunway)
    console.log('pathRecording state length:', pathRecording.length)
    console.log('pathRecordingRef length:', pathRecordingRef.current.length)
    console.log('pathToSave length:', pathToSave.length)
    
    if (!user) {
      alert('You must be logged in to save a landing path.')
      console.error('No user found')
      return
    }
    
    if (!selectedRunway) {
      alert('No runway selected.')
      console.error('No runway selected')
      return
    }
    
    if (pathToSave.length < 10) {
      alert(`Not enough path data to save. Need at least 10 points. You have ${pathToSave.length} points.`)
      console.error('Not enough points:', pathToSave.length, 'State length:', pathRecording.length)
      return
    }
    
    if (!savePathName.trim()) {
      alert('Please enter a name for this landing path')
      console.error('No path name provided')
      return
    }
    
    try {
      console.log('Saving to database:', {
        user_id: user.id,
        runway_id: selectedRunway,
        path_name: savePathName.trim(),
        path_data_length: pathToSave.length,
        path_data_sample: pathToSave.slice(0, 2)
      })
      
      const { data: savedData, error } = await supabase
        .from('landing_paths')
        .insert({
          user_id: user.id,
          runway_id: selectedRunway,
          path_name: savePathName.trim(),
          path_data: pathToSave
        })
        .select()
      
      if (error) {
        console.error('Error saving landing path:', error)
        alert('Error saving landing path: ' + error.message)
        return
      }
      
      console.log('Successfully saved landing path:', savedData)
      alert('Landing path saved successfully!')
      setShowSavePathDialog(false)
      setSavePathName('')
      setIsSavingRecordedPath(false)
      setPathRecording([])
      
      // Reload paths
      const { data: reloadedPaths, error: reloadError } = await supabase
        .from('landing_paths')
        .select('id, path_name, path_data, created_at, user_id')
        .eq('runway_id', selectedRunway)
        .order('created_at', { ascending: false })
        .limit(50)
      
      if (reloadError) {
        console.error('Error reloading paths:', reloadError)
      } else {
        console.log('Reloaded paths:', reloadedPaths?.length)
        setSavedLandingPaths(reloadedPaths || [])
      }
    } catch (error) {
      console.error('Exception saving landing path:', error)
      alert('Error saving landing path: ' + (error.message || 'Unknown error'))
    }
  }

  function completeLanding() {
    if (!hasBeenSaved.current) {
      hasBeenSaved.current = true
      
      const { maxAltDev, maxSpeedDev, maxBankDev, maxPitchDev } = landingDeviations.current

      const busted = {
        altitude: maxAltDev > 100,
        speed: maxSpeedDev > 10,
        bank: maxBankDev > 5,
        pitch: maxPitchDev > 3
      }

      const gradeData = gradePathFollowing({
        maxAltDev,
        maxLateralDev: 0,
        maxSpeedDev,
        maxBankDev,
        maxPitchDev,
        busted: { ...busted, lateral: false },
        skillLevel: pathFollowingSkillLevel
      })
      
      const result = {
        grade: gradeData.finalGrade,
        gradeDetails: {
          ...gradeData,
          breakdown: {
            altitude: gradeData.breakdown.altitude,
            speed: gradeData.breakdown.speed,
            bank: gradeData.breakdown.bank,
            pitch: gradeData.breakdown.pitch
          }
        },
        maxDeviations: {
          altitude: maxAltDev,
          speed: maxSpeedDev,
          bank: maxBankDev,
          pitch: maxPitchDev
        },
        busted,
        skillLevel: pathFollowingSkillLevel,
        phaseHistory,
        phaseMetrics,
        gatesPassed,
        violations,
        touchdown: touchdownData.current,
        flightPath,
        runway: {
          id: selectedRunway,
          name: getRunwayDisplayName(selectedRunway, customRunways)
        },
        vref,
        timestamp: new Date().toISOString()
      }
      
      setLandingResult(result)
      setState('complete')
      
      // Save to database
      saveLandingToDatabase(user.id, {
        grade: gradeData.finalGrade,
        details: result
      })
    }
  }

  function completePathFollowing() {
    console.log('completePathFollowing called', {
      hasTracking: !!pathFollowingTracking,
      hasResult: !!pathFollowingResult,
      startReached: pathStartReached.current
    })
    
    if (!pathFollowingTracking) {
      console.log('completePathFollowing: No tracking data')
      return
    }
    
    if (pathFollowingResult) {
      console.log('completePathFollowing: Already completed')
      return
    }
    
    console.log('Completing path following. Max deviations:', {
      alt: pathFollowingTracking.maxAltDev,
      lateral: pathFollowingTracking.maxLateralDev,
      speed: pathFollowingTracking.maxSpeedDev,
      bank: pathFollowingTracking.maxBankDev,
      pitch: pathFollowingTracking.maxPitchDev,
      samples: pathFollowingTracking.samples.length,
      deviations: pathFollowingTracking.deviations.length
    })
    
    // Grade based on deviations using letter grades
    // Tolerances for busted flags: Altitude ±100ft, Lateral ±0.2 NM, Speed ±10kt, Bank ±5°, Pitch ±3°
    const busted = {
      altitude: pathFollowingTracking.maxAltDev > 100,
      lateral: pathFollowingTracking.maxLateralDev > 0.2,
      speed: pathFollowingTracking.maxSpeedDev > 10,
      bank: pathFollowingTracking.maxBankDev > 5,
      pitch: pathFollowingTracking.maxPitchDev > 3
    }
    
    const bustedCount = Object.values(busted).filter(v => v).length
    
    // Calculate letter grades using grading system
    const gradeData = gradePathFollowing({
      maxAltDev: pathFollowingTracking.maxAltDev,
      maxLateralDev: pathFollowingTracking.maxLateralDev,
      maxSpeedDev: pathFollowingTracking.maxSpeedDev,
      maxBankDev: pathFollowingTracking.maxBankDev,
      maxPitchDev: pathFollowingTracking.maxPitchDev,
      busted,
      skillLevel: pathFollowingSkillLevel
    })
    
    const result = {
      grade: gradeData.finalGrade,
      gradeDetails: gradeData,
      pathName: pathFollowingTracking.pathName,
      runway: {
        id: selectedRunway,
        name: getRunwayDisplayName(selectedRunway, customRunways)
      },
      maxDeviations: {
        altitude: pathFollowingTracking.maxAltDev,
        lateral: pathFollowingTracking.maxLateralDev,
        speed: pathFollowingTracking.maxSpeedDev,
        bank: pathFollowingTracking.maxBankDev,
        pitch: pathFollowingTracking.maxPitchDev
      },
      busted,
      bustedCount,
      samples: pathFollowingTracking.samples,
      deviations: pathFollowingTracking.deviations,
      flightPath: flightPath, // Include flight path for 3D playback
      referencePath: pathFollowingTracking.referencePath, // Include reference path for 3D comparison
      skillLevel: pathFollowingSkillLevel,
      timestamp: new Date().toISOString()
    }
    
    setPathFollowingResult(result)
    setState('complete')
    setTracking(false)
    
    // Save to database
    savePathFollowingToDatabase(user.id, {
      grade: gradeData.finalGrade,
      details: result
    }).then(maneuverId => {
      if (maneuverId) {
        setCurrentPathFollowingId(maneuverId)
        // Check for existing feedback
        getPathFollowingFeedback(maneuverId).then(feedback => {
          if (feedback) {
            const focusMatch = feedback.match(/^FOCUS:\s*(.+?)(?:\n|$)/i)
            if (focusMatch) {
              setAiFocus(focusMatch[1].trim())
              setAiFeedback(feedback.replace(/^FOCUS:\s*.+?\n/i, '').trim())
            } else {
              setAiFocus('Path Following')
              setAiFeedback(feedback)
            }
          }
        })
      }
    })
  }

  async function savePathFollowingToDatabase(userId, pathFollowingData) {
    try {
      const { data, error } = await supabase
        .from('maneuver_results')
        .insert({
          user_id: userId,
          maneuver_type: 'path_following',
          grade: pathFollowingData.grade,
          result_data: pathFollowingData.details,
          skill_level: pathFollowingSkillLevel
        })
        .select('id')
        .single()
      
      if (error) {
        console.error('Error saving path following:', error)
        return null
      }
      
      console.log('✅ Path following saved to database')
      return data?.id || null
    } catch (error) {
      console.error('Error saving path following:', error)
      return null
    }
  }

  async function getPathFollowingFeedback(maneuverId) {
    if (!maneuverId) return null
    
    try {
      const { data, error } = await supabase
        .from('maneuver_results')
        .select('result_data')
        .eq('id', maneuverId)
        .single()
      
      if (error || !data) return null
      
      const resultData = data.result_data
      return resultData?.ai_feedback || null
    } catch (error) {
      console.error('Error fetching path following feedback:', error)
      return null
    }
  }

  async function updatePathFollowingWithFeedback(maneuverId, feedback) {
    if (!maneuverId) return false
    
    try {
      const { data: existingData, error: fetchError } = await supabase
        .from('maneuver_results')
        .select('result_data')
        .eq('id', maneuverId)
        .single()
      
      if (fetchError || !existingData) {
        console.error('Error fetching path following data:', fetchError)
        return false
      }
      
      const updatedResultData = {
        ...existingData.result_data,
        ai_feedback: feedback
      }
      
      const { error } = await supabase
        .from('maneuver_results')
        .update({ result_data: updatedResultData })
        .eq('id', maneuverId)
      
      if (error) {
        console.error('Error updating path following with feedback:', error)
        return false
      }
      
      return true
    } catch (error) {
      console.error('Error updating path following with feedback:', error)
      return false
    }
  }

  async function handlePathFollowingAiFeedbackRequest() {
    if (aiFeedback) {
      return
    }

    if (!pathFollowingResult) {
      setAiError('Path following data unavailable. Complete a path following exercise first.')
      return
    }

    setAiLoading(true)
    setAiError('')

    try {
      const payload = {
        maneuver: {
          grade: pathFollowingResult.grade,
          gradeDetails: pathFollowingResult.gradeDetails,
          details: {
            pathName: pathFollowingResult.pathName,
            runway: pathFollowingResult.runway,
            maxDeviations: pathFollowingResult.maxDeviations,
            busted: pathFollowingResult.busted,
            bustedCount: pathFollowingResult.bustedCount,
            skillLevel: pathFollowingResult.skillLevel,
            timestamp: pathFollowingResult.timestamp
          }
        },
        maneuverType: 'path_following',
        user: {
          id: user.id,
          email: user.email
        }
      }

      const result = await fetchPathFollowingFeedback(payload)
      
      if (typeof result === 'object' && result.focus && result.feedback) {
        setAiFocus(result.focus)
        setAiFeedback(result.feedback)
        const feedbackToSave = `FOCUS: ${result.focus}\n\n${result.feedback}`
        if (currentPathFollowingId) {
          await updatePathFollowingWithFeedback(currentPathFollowingId, feedbackToSave)
        }
      } else {
        const feedbackText = typeof result === 'string' ? result : JSON.stringify(result)
        const focusMatch = feedbackText.match(/^FOCUS:\s*(.+?)(?:\n|$)/i)
        if (focusMatch) {
          setAiFocus(focusMatch[1].trim())
          setAiFeedback(feedbackText.replace(/^FOCUS:\s*.+?\n/i, '').trim())
        } else {
          setAiFocus('Path Following')
          setAiFeedback(feedbackText)
        }
        if (currentPathFollowingId) {
          await updatePathFollowingWithFeedback(currentPathFollowingId, feedbackText)
        }
      }
    } catch (error) {
      setAiError(error.message || 'Unable to get AI feedback')
    } finally {
      setAiLoading(false)
    }
  }

  function reset() {
    setTracking(false)
    setState(connected ? 'ready' : 'disconnected')
    setCurrentPhase(LANDING_PHASES.NONE)
    setPhaseHistory([])
    setFlightPath([])
    setPhaseMetrics({})
    setGatesPassed([])
    setViolations([])
    setLandingResult(null)
    setPathFollowingTracking(null)
    setPathFollowingResult(null)
    setCurrentPathFollowingId(null)
    setAiFeedback(null)
    setAiFocus(null)
    setAiError('')
    pathStartReached.current = false
    setNearRunwayButNotPath(false)
    pathFollowingCompleting.current = false
    hasBeenSaved.current = false
    previousPhase.current = LANDING_PHASES.NONE
    lastGateCheck.current = {}
    landingDeviations.current = { maxAltDev: 0, maxSpeedDev: 0, maxBankDev: 0, maxPitchDev: 0, samples: [] }
    touchdownData.current = null
  }

  async function handleCalibrationComplete(newRunway) {
    // Reload custom runways
    const loaded = await loadCustomRunways(user)
    setCustomRunways(loaded)
    // Find the newly created runway by name (since ID might differ after database save)
    const savedRunway = loaded.find(rwy => rwy.name === newRunway.name && rwy.fromDatabase === true)
    if (savedRunway) {
      setSelectedRunway(savedRunway.id)
    } else if (newRunway.id) {
      // Fallback to original ID if not found
      setSelectedRunway(newRunway.id)
    }
    setShowCalibration(false)
  }

  // Calculate current metrics
  const distanceToThreshold = runway && data?.lat && data?.lon
    ? calculateDistance(data.lat, data.lon, runway.threshold.lat, runway.threshold.lon)
    : null

  const bearingToThreshold = runway && data?.lat && data?.lon
    ? calculateBearing(data.lat, data.lon, runway.threshold.lat, runway.threshold.lon)
    : null

  const headingDeviation = bearingToThreshold && data?.hdg_true
    ? normalizeAngle(data.hdg_true - bearingToThreshold)
    : null

  const altitudeAGL = data?.alt_ft ? data.alt_ft - JKA_AIRPORT.elevation : null

  const targetGlidepath = distanceToThreshold && distanceToThreshold < 5
    ? GLIDEPATH.getTargetAltitude(distanceToThreshold)
    : null

  const glidepathDeviation = targetGlidepath && data?.alt_ft
    ? data.alt_ft - targetGlidepath.msl
    : null

  // Get current phase standards
  const phaseStandards = PHASE_STANDARDS[currentPhase]
  const currentCompliance = phaseMetrics[currentPhase]

  if (showCalibration) {
    return (
      <div className="landing-page">
        <div className="landing-container">
          <RunwayCalibration
            user={user}
            onComplete={handleCalibrationComplete}
            onCancel={() => setShowCalibration(false)}
          />
        </div>
      </div>
    )
  }

  if (showGradingScale) {
    return (
      <div className="modal-overlay" onClick={() => setShowGradingScale(false)}>
        <div className="modal-content grading-scale-modal" onClick={(e) => e.stopPropagation()}>
          <h2>Path Following Grading Scale - {pathFollowingSkillLevel === 'acs' ? 'ACS' : pathFollowingSkillLevel.charAt(0).toUpperCase() + pathFollowingSkillLevel.slice(1)}</h2>
          {(() => {
            // Import the thresholds function
            const getThresholds = (skillLevel) => {
              const normalized = (skillLevel || 'acs').toLowerCase()
              const thresholds = {
                acs: {
                  altitude: { Aplus: 20, A: 40, Aminus: 60, Bplus: 80, B: 100, Bminus: 120, Cplus: 150, C: 180, Cminus: 220, Dplus: 250, D: 300, Dminus: 350 },
                  lateral: { Aplus: 0.05, A: 0.1, Aminus: 0.15, Bplus: 0.2, B: 0.25, Bminus: 0.3, Cplus: 0.4, C: 0.5, Cminus: 0.6, Dplus: 0.7, D: 0.8, Dminus: 0.9 },
                  speed: { Aplus: 2, A: 4, Aminus: 6, Bplus: 8, B: 10, Bminus: 12, Cplus: 15, C: 18, Cminus: 22, Dplus: 25, D: 30, Dminus: 35 },
                  bank: { Aplus: 1, A: 2, Aminus: 3, Bplus: 4, B: 5, Bminus: 6, Cplus: 8, C: 10, Cminus: 12, Dplus: 15, D: 18, Dminus: 22 },
                  pitch: { Aplus: 0.5, A: 1, Aminus: 1.5, Bplus: 2, B: 2.5, Bminus: 3, Cplus: 4, C: 5, Cminus: 6, Dplus: 7, D: 8, Dminus: 10 }
                },
                novice: {
                  altitude: { Aplus: 40, A: 80, Aminus: 120, Bplus: 160, B: 200, Bminus: 240, Cplus: 280, C: 320, Cminus: 360, Dplus: 400, D: 450, Dminus: 500 },
                  lateral: { Aplus: 0.1, A: 0.2, Aminus: 0.3, Bplus: 0.4, B: 0.5, Bminus: 0.6, Cplus: 0.7, C: 0.8, Cminus: 1.0, Dplus: 1.2, D: 1.4, Dminus: 1.6 },
                  speed: { Aplus: 4, A: 8, Aminus: 12, Bplus: 16, B: 20, Bminus: 24, Cplus: 28, C: 32, Cminus: 36, Dplus: 40, D: 45, Dminus: 50 },
                  bank: { Aplus: 2, A: 4, Aminus: 6, Bplus: 8, B: 10, Bminus: 12, Cplus: 15, C: 18, Cminus: 22, Dplus: 25, D: 30, Dminus: 35 },
                  pitch: { Aplus: 1, A: 2, Aminus: 3, Bplus: 4, B: 5, Bminus: 6, Cplus: 8, C: 10, Cminus: 12, Dplus: 15, D: 18, Dminus: 22 }
                },
                beginner: {
                  altitude: { Aplus: 150, A: 250, Aminus: 350, Bplus: 450, B: 550, Bminus: 650, Cplus: 750, C: 850, Cminus: 1000, Dplus: 1200, D: 1500, Dminus: 1800 },
                  lateral: { Aplus: 0.3, A: 0.5, Aminus: 0.7, Bplus: 0.9, B: 1.2, Bminus: 1.5, Cplus: 1.8, C: 2.2, Cminus: 2.6, Dplus: 3.0, D: 3.5, Dminus: 4.0 },
                  speed: { Aplus: 12, A: 18, Aminus: 24, Bplus: 30, B: 36, Bminus: 42, Cplus: 48, C: 54, Cminus: 60, Dplus: 70, D: 80, Dminus: 90 },
                  bank: { Aplus: 6, A: 10, Aminus: 14, Bplus: 18, B: 22, Bminus: 26, Cplus: 30, C: 35, Cminus: 40, Dplus: 45, D: 50, Dminus: 55 },
                  pitch: { Aplus: 3, A: 5, Aminus: 7, Bplus: 9, B: 12, Bminus: 15, Cplus: 18, C: 22, Cminus: 26, Dplus: 30, D: 35, Dminus: 40 }
                }
              }
              if (normalized === 'acs') return thresholds.acs
              if (normalized === 'novice') return thresholds.novice
              if (normalized === 'beginner') return thresholds.beginner
              return thresholds.acs
            }

            const thresholds = getThresholds(pathFollowingSkillLevel)
            const grades = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-']

            return (
              <div className="grading-scale-content">
                <div className="grading-scale-section">
                  <h3>Altitude</h3>
                  <p className="grading-scale-note">Maximum deviation from reference path altitude</p>
                  <table className="grading-table">
                    <thead>
                      <tr>
                        <th>Grade</th>
                        <th>Max Dev (ft)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grades.map(grade => {
                        const gradeKey = grade.replace('+', 'plus').replace('-', 'minus')
                        return (
                          <tr key={grade}>
                            <td className="grade-cell">{grade}</td>
                            <td>{thresholds.altitude[gradeKey]} ft</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="grading-scale-section">
                  <h3>Lateral</h3>
                  <p className="grading-scale-note">Maximum lateral deviation from reference path</p>
                  <table className="grading-table">
                    <thead>
                      <tr>
                        <th>Grade</th>
                        <th>Max Dev (NM)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grades.map(grade => {
                        const gradeKey = grade.replace('+', 'plus').replace('-', 'minus')
                        return (
                          <tr key={grade}>
                            <td className="grade-cell">{grade}</td>
                            <td>{thresholds.lateral[gradeKey]}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="grading-scale-section">
                  <h3>Speed</h3>
                  <p className="grading-scale-note">Maximum deviation from reference path airspeed</p>
                  <table className="grading-table">
                    <thead>
                      <tr>
                        <th>Grade</th>
                        <th>Max Dev (kt)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grades.map(grade => {
                        const gradeKey = grade.replace('+', 'plus').replace('-', 'minus')
                        return (
                          <tr key={grade}>
                            <td className="grade-cell">{grade}</td>
                            <td>{thresholds.speed[gradeKey]}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="grading-scale-section">
                  <h3>Bank Angle</h3>
                  <p className="grading-scale-note">Maximum deviation from reference path bank angle</p>
                  <table className="grading-table">
                    <thead>
                      <tr>
                        <th>Grade</th>
                        <th>Max Dev (°)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grades.map(grade => {
                        const gradeKey = grade.replace('+', 'plus').replace('-', 'minus')
                        return (
                          <tr key={grade}>
                            <td className="grade-cell">{grade}</td>
                            <td>{thresholds.bank[gradeKey]}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="grading-scale-section">
                  <h3>Pitch Angle</h3>
                  <p className="grading-scale-note">Maximum deviation from reference path pitch angle</p>
                  <table className="grading-table">
                    <thead>
                      <tr>
                        <th>Grade</th>
                        <th>Max Dev (°)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grades.map(grade => {
                        const gradeKey = grade.replace('+', 'plus').replace('-', 'minus')
                        return (
                          <tr key={grade}>
                            <td className="grade-cell">{grade}</td>
                            <td>{thresholds.pitch[gradeKey]}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="grading-scale-note grading-scale-final-note">
                  <strong>Note:</strong> Final grade is the worst grade across all categories. Busted tolerances (altitude ±100ft, lateral ±0.2NM, speed ±10kt, bank ±5°, pitch ±3°) result in grade penalties.
                </div>
              </div>
            )
          })()}

          <div className="modal-actions">
            <button className="btn-secondary" onClick={() => setShowGradingScale(false)}>
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="landing-page">
      <div className="landing-container">
        <h1>Landing Approach Tracker</h1>
        <p className="subtitle">
          {selectedRunway 
            ? (selectedRunway.startsWith('custom_') 
                ? customRunways.find(r => r.id === selectedRunway)?.name || 'Custom Runway'
                : `KJKA (Jack Edwards Airport, Gulf Shores AL) — Runway ${selectedRunway}`)
            : 'Select a runway to begin tracking'
          }
        </p>

        <div className="landing-grid">
          {/* Left Column: Controls and Configuration */}
          <div className="left-col">
            <div className={`card ${dropdownOpen ? 'dropdown-active' : ''}`}>
              <div className={`status-badge ${!connected || !data ? 'disconnected' : state}`}>
                ● {!connected || !data ? 'Disconnected' : 
                   state === 'ready' ? 'Ready' : 
                   state === 'tracking' ? `Tracking - ${phaseStandards?.name || 'Monitoring'}` : 
                   'Complete'}
              </div>

              {(!connected || !data) && (
                <div style={{ 
                  padding: '8px', 
                  backgroundColor: '#ff444420', 
                  borderRadius: '4px', 
                  marginBottom: '8px',
                  fontSize: '12px',
                  color: '#ff4444'
                }}>
                  ⚠️ Bridge not connected. Start your bridge client to begin tracking.
                </div>
              )}
              <button
                className={`big-button ${tracking ? 'stop' : 'start'}`}
                disabled={!connected || !data || state === 'disconnected' || state === 'complete' || recordingPath}
                onClick={tracking ? stopTracking : startTracking}
              >
                {tracking ? 'Stop Tracking' : 'Start Tracking'}
              </button>
              <button
                className="big-button reset"
                onClick={reset}
                disabled={recordingPath}
              >
                Reset
              </button>
              {recordingPath && (
                <div style={{ 
                  padding: '8px', 
                  backgroundColor: '#ffa50020', 
                  borderRadius: '4px', 
                  marginTop: '8px',
                  fontSize: '12px',
                  color: '#ffa500'
                }}>
                  ⚠️ Landing path recording is active. Stop recording to start landing tracking.
                </div>
              )}

              {!tracking && (
                <div className="config-section">
                <label>
                  Aircraft Vref (kt)
                  <input
                    type="number"
                    value={vref}
                    onChange={(e) => setVref(Number(e.target.value))}
                    min="40"
                    max="120"
                    disabled={tracking}
                  />
                </label>
                
                <label>
                  Runway
                  <div className="runway-custom-dropdown" ref={dropdownRef}>
                    <div 
                      className={`dropdown-selected ${dropdownOpen ? 'open' : ''} ${tracking ? 'disabled' : ''}`}
                      onClick={() => !tracking && setDropdownOpen(!dropdownOpen)}
                    >
                      <div className="selected-info">
                        <span className="selected-name">
                          {selectedRunway 
                            ? (() => {
                                const rwy = customRunways.find(r => r.id === selectedRunway)
                                if (!rwy) return 'Custom Runway'
                                const airportCode = extractAirportCode(rwy.name)
                                const airportName = airportCode ? getAirportName(airportCode) : null
                                return airportName ? `${rwy.name} (${airportName})` : rwy.name
                              })()
                            : 'Select a runway'
                          }
                        </span>
                        <span className="selected-details">
                          {selectedRunway 
                            ? (() => {
                                const rwy = customRunways.find(r => r.id === selectedRunway)
                                if (!rwy) return ''
                                const direction = getCardinalDirection(rwy.heading)
                                const length = rwy.length ? `${rwy.length.toLocaleString()} ft` : 'Custom'
                                return `Heading ${rwy.heading}° (${direction}) — ${length}`
                              })()
                            : ''
                          }
                        </span>
                      </div>
                      <div className="dropdown-arrow">▼</div>
                    </div>

                    {dropdownOpen && (
                      <div className="dropdown-options">
                        {customRunways
                          .filter(rwy => rwy.fromDatabase === true)
                          .map(rwy => {
                            const direction = getCardinalDirection(rwy.heading)
                            const length = rwy.length ? `${rwy.length.toLocaleString()} ft` : 'Custom'
                            const airportCode = extractAirportCode(rwy.name)
                            const airportName = airportCode ? getAirportName(airportCode) : null
                            const displayName = airportName ? `${rwy.name} (${airportName})` : rwy.name
                            return (
                              <div 
                                key={rwy.id}
                                className={`dropdown-option ${selectedRunway === rwy.id ? 'active' : ''}`}
                                onClick={() => {
                                  setSelectedRunway(rwy.id)
                                  setDropdownOpen(false)
                                }}
                              >
                                <div className="option-main">{displayName}</div>
                                <div className="option-sub">
                                  Heading {rwy.heading}° ({direction}) — {length}
                                </div>
                              </div>
                            )
                          })}
                      </div>
                    )}
                  </div>
                </label>

                <label>
                  Landing Path (Optional)
                  <div className="runway-custom-dropdown" ref={pathDropdownRef}>
                    <div 
                      className={`dropdown-selected ${pathDropdownOpen ? 'open' : ''} ${tracking || recordingPath ? 'disabled' : ''}`}
                      onClick={() => !tracking && !recordingPath && setPathDropdownOpen(!pathDropdownOpen)}
                    >
                      <div className="selected-info">
                        <span className="selected-name">
                          {selectedLandingPath 
                            ? (() => {
                                const path = savedLandingPaths.find(p => p.id === selectedLandingPath)
                                return path ? `${path.path_name} ${path.user_id === user?.id ? '(You)' : '(Shared)'}` : 'None'
                              })()
                            : 'None (No reference path)'
                          }
                        </span>
                      </div>
                      <div className="dropdown-arrow">▼</div>
                    </div>

                    {pathDropdownOpen && (
                      <div className="dropdown-options">
                        <div 
                          className={`dropdown-option ${!selectedLandingPath ? 'active' : ''}`}
                          onClick={() => {
                            setSelectedLandingPath(null)
                            setPathDropdownOpen(false)
                          }}
                        >
                          <div className="option-main">None (No reference path)</div>
                        </div>
                        {savedLandingPaths.map(path => (
                          <div 
                            key={path.id}
                            className={`dropdown-option ${selectedLandingPath === path.id ? 'active' : ''}`}
                            onClick={() => {
                              setSelectedLandingPath(path.id)
                              setPathDropdownOpen(false)
                            }}
                          >
                            <div className="option-main">
                              {path.path_name} {path.user_id === user?.id ? '(You)' : '(Shared)'}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </label>

                <AutoStart
                  enabled={autoStartEnabled && connected && data}
                  skillLevel={autoStartSkillLevel}
                  onToggle={(enabled) => {
                    if (!connected || !data) return
                    setAutoStartEnabled(enabled)
                  }}
                  onSkillLevelChange={setAutoStartSkillLevel}
                  status={autoStartStatus}
                  maneuverType={MANEUVER_TYPES.LANDING}
                />

                <label style={{ marginBottom: '8px', display: 'block' }}>
                  Skill Level
                </label>
                <div className="skill-level-selector" style={{ marginTop: '4px' }}>
                  <button
                    className={`skill-level-btn ${pathFollowingSkillLevel === SKILL_LEVELS.BEGINNER ? 'active' : ''}`}
                    onClick={() => setPathFollowingSkillLevel(SKILL_LEVELS.BEGINNER)}
                    disabled={tracking}
                  >
                    Beginner
                  </button>
                  <button
                    className={`skill-level-btn ${pathFollowingSkillLevel === SKILL_LEVELS.NOVICE ? 'active' : ''}`}
                    onClick={() => setPathFollowingSkillLevel(SKILL_LEVELS.NOVICE)}
                    disabled={tracking}
                  >
                    Novice
                  </button>
                  <button
                    className={`skill-level-btn ${pathFollowingSkillLevel === SKILL_LEVELS.ACS ? 'active' : ''}`}
                    onClick={() => setPathFollowingSkillLevel(SKILL_LEVELS.ACS)}
                    disabled={tracking}
                  >
                    ACS
                  </button>
                </div>

                <div className={`record-path-section ${recordingPath ? 'recording' : ''}`}>
                  <div className="record-path-header">
                    <span className="record-path-title">Record Landing Path</span>
                    {recordingPath && (
                      <span className="recording-indicator">● Recording...</span>
                    )}
                  </div>
                  <p className="record-path-description">
                    Record a landing path for the selected runway. This becomes a reference track students can follow and practice.
                  </p>
                  {!recordingPath ? (
                    <button
                      className="btn-calibrate"
                      onClick={startPathRecording}
                      disabled={tracking || !connected}
                    >
                      + Start Recording Path
                    </button>
                  ) : (
                    <button
                      className="btn-calibrate btn-recording"
                      onClick={stopPathRecording}
                    >
                      Stop Recording ({pathRecording.length} points)
                    </button>
                  )}
                </div>

                <div className="calibrate-runway-section">
                  <div className="calibrate-runway-header">
                    <span className="calibrate-runway-title">Calibrate Runway</span>
                  </div>
                  <p className="calibrate-runway-description">
                  Improve runway accuracy by driving straight down the runway. This sets precise runway endpoints for reliable landing tracking.
                  </p>
                  <button
                    className="btn-calibrate"
                    onClick={() => setShowCalibration(true)}
                    disabled={tracking}
                  >
                    + Start Calibrating Runway
                  </button>
                </div>
              </div>
              )}
            </div>

            <div className="card">
              <h2>Live Data</h2>
              <div className="live-values">
                <div className="live-item">
                  <div className="val">{data?.hdg_true != null ? Math.round(data.hdg_true) : '---'}</div>
                  <div className="lbl">HDG °</div>
                </div>
                <div className="live-item">
                  <div className="val">{data?.alt_ft != null ? Math.round(data.alt_ft) : '---'}</div>
                  <div className="lbl">ALT MSL</div>
                </div>
                <div className="live-item">
                  <div className="val">{altitudeAGL != null ? Math.round(altitudeAGL) : '---'}</div>
                  <div className="lbl">ALT AGL</div>
                </div>
                <div className="live-item">
                  <div className="val">{data?.ias_kt != null ? Math.round(data.ias_kt) : '---'}</div>
                  <div className="lbl">IAS kt</div>
                </div>
                <div className="live-item">
                  <div className="val">{data?.vs_fpm != null ? Math.round(data.vs_fpm) : '---'}</div>
                  <div className="lbl">V/S fpm</div>
                </div>
                <div className="live-item">
                  <div className="val">{distanceToThreshold != null ? distanceToThreshold.toFixed(1) : '---'}</div>
                  <div className="lbl">DIST NM</div>
                </div>
              </div>
            </div>

            {/* Current Phase Standards */}
            {tracking && phaseStandards && (
              <div className="card">
                <h2>{phaseStandards.name} Standards</h2>
                <div className="standards-list">
                  <p className="phase-description">{phaseStandards.description}</p>
                  
                  {currentCompliance && (
                    <div className={`compliance-badge ${currentCompliance.compliant ? 'compliant' : 'non-compliant'}`}>
                      {currentCompliance.compliant ? '✓ In Compliance' : '⚠ Deviations Detected'}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Visualization and Status */}
          <div className="right-col">
            {tracking && (
              <>
                {/* Path Following Deviations (if tracking against reference path) */}
                {pathFollowingTracking && (
                  <div className="card">
                    <h2>Path Following - {pathFollowingTracking.pathName}</h2>
                    {!pathStartReached.current ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: '#4a9eff' }}>
                        {nearRunwayButNotPath ? (
                          <>
                            <div style={{ fontSize: '1.2rem', marginBottom: '8px', color: '#ffa500' }}>⚠️ Near Runway, But Not on Flight Path</div>
                            <div style={{ fontSize: '0.9rem', color: '#aaa' }}>
                              You're in approach range but not on the landing path. Navigate to the flight path to begin tracking deviations.
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{ fontSize: '1.2rem', marginBottom: '8px' }}>⏳ Approaching Landing Path</div>
                            <div style={{ fontSize: '0.9rem', color: '#aaa' }}>
                              Fly to the landing path to begin tracking deviations. Tracking will start automatically when you're within approach range and on the flight path.
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="live-values">
                        <div className="live-item">
                          <div className={`val ${pathFollowingTracking.currentAltDev <= 100 ? '' : 'bad'}`}>
                            {Math.round(pathFollowingTracking.currentAltDev || 0)}
                          </div>
                          <div className="lbl">ALT DEV ft</div>
                          <div className="tolerance">(±100 ft) Max: {Math.round(pathFollowingTracking.maxAltDev)}</div>
                        </div>
                        <div className="live-item">
                          <div className={`val ${pathFollowingTracking.currentLateralDev <= 0.2 ? '' : 'bad'}`}>
                            {Math.round((pathFollowingTracking.currentLateralDev || 0) * 6076)}
                          </div>
                          <div className="lbl">LAT DEV ft</div>
                          <div className="tolerance">(±1215 ft) Max: {Math.round(pathFollowingTracking.maxLateralDev * 6076)}</div>
                        </div>
                        <div className="live-item">
                          <div className={`val ${pathFollowingTracking.currentSpeedDev <= 10 ? '' : 'bad'}`}>
                            {Math.round(pathFollowingTracking.currentSpeedDev || 0)}
                          </div>
                          <div className="lbl">SPD DEV kt</div>
                          <div className="tolerance">(±10 kt) Max: {Math.round(pathFollowingTracking.maxSpeedDev)}</div>
                        </div>
                        <div className="live-item">
                          <div className={`val ${pathFollowingTracking.currentBankDev <= 5 ? '' : 'bad'}`}>
                            {Math.round(pathFollowingTracking.currentBankDev || 0)}
                          </div>
                          <div className="lbl">BANK DEV °</div>
                          <div className="tolerance">(±5°) Max: {Math.round(pathFollowingTracking.maxBankDev)}</div>
                        </div>
                        <div className="live-item">
                          <div className={`val ${pathFollowingTracking.currentPitchDev <= 3 ? '' : 'bad'}`}>
                            {Math.round(pathFollowingTracking.currentPitchDev || 0)}
                          </div>
                          <div className="lbl">PITCH DEV °</div>
                          <div className="tolerance">(±3°) Max: {Math.round(pathFollowingTracking.maxPitchDev)}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Glidepath Indicator (on final) */}
                {currentPhase === LANDING_PHASES.FINAL && targetGlidepath && (
                  <div className="card">
                    <h2>Glidepath Guidance</h2>
                    <div className="glidepath-indicator">
                      <div className="glidepath-value">
                        <span className="label">Target Altitude:</span>
                        <span className="value">{Math.round(targetGlidepath.msl)} ft MSL</span>
                      </div>
                      <div className="glidepath-value">
                        <span className="label">Actual Altitude:</span>
                        <span className="value">{Math.round(data.alt_ft)} ft MSL</span>
                      </div>
                      <div className="glidepath-value">
                        <span className="label">Deviation:</span>
                        <span className={`value ${Math.abs(glidepathDeviation) <= 100 ? 'good' : 'bad'}`}>
                          {glidepathDeviation > 0 ? '+' : ''}{Math.round(glidepathDeviation)} ft
                          {Math.abs(glidepathDeviation) <= 100 ? ' ✓' : ' ⚠'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Gates Passed */}
                {gatesPassed.length > 0 && (
                  <div className="card">
                    <h2>Gates Passed</h2>
                    <div className="gates-list">
                      {gatesPassed.map((gate, idx) => (
                        <div key={idx} className={`gate-item ${gate.compliant ? 'pass' : 'fail'}`}>
                          <div className="gate-name">{gate.gate}</div>
                          <div className="gate-details">
                            <span>Alt: {Math.round(gate.actualAltitude)} ft</span>
                            <span>Dev: {gate.altitudeDeviation > 0 ? '+' : ''}{Math.round(gate.altitudeDeviation)} ft</span>
                            <span className={gate.compliant ? 'pass' : 'fail'}>
                              {gate.compliant ? '✓' : '✗'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Approach Path Visualization - Show when connected with data and runway selected */}
            {connected && data && runway && (
              <div className="card">
                <h2>Approach Path</h2>
                <ApproachPath
                  runway={runway}
                  aircraftData={data}
                  flightPath={flightPath}
                  currentPhase={currentPhase}
                  glidepathDeviation={glidepathDeviation}
                  distanceToThreshold={distanceToThreshold}
                  selectedLandingPath={selectedLandingPath ? savedLandingPaths.find(p => p.id === selectedLandingPath)?.path_data : null}
                />
              </div>
            )}

            {/* Complete Summary */}
            {state === 'complete' && landingResult && (
              <div className={`card grade-card ${getGradeColorClass(landingResult.grade)}`}>
                <div className="grade-header">
                  <div className={`grade ${getGradeColorClass(landingResult.grade)}`}>
                    {landingResult.grade}
                  </div>
                  {landingResult.skillLevel && (
                    <div className="skill-level-badge">
                      {landingResult.skillLevel.charAt(0).toUpperCase() + landingResult.skillLevel.slice(1)}
                    </div>
                  )}
                </div>

                {landingResult.gradeDetails && (
                  <div className="grade-breakdown">
                    <h3>Grade Breakdown</h3>
                    <div className="breakdown-grid">
                      <div className="breakdown-item">
                        <span>Altitude:</span>
                        <span className={getGradeColorClass(landingResult.gradeDetails.breakdown.altitude)}>
                          {landingResult.gradeDetails.breakdown.altitude}
                        </span>
                      </div>
                      <div className="breakdown-item">
                        <span>Speed:</span>
                        <span className={getGradeColorClass(landingResult.gradeDetails.breakdown.speed)}>
                          {landingResult.gradeDetails.breakdown.speed}
                        </span>
                      </div>
                      <div className="breakdown-item">
                        <span>Bank:</span>
                        <span className={getGradeColorClass(landingResult.gradeDetails.breakdown.bank)}>
                          {landingResult.gradeDetails.breakdown.bank}
                        </span>
                      </div>
                      <div className="breakdown-item">
                        <span>Pitch:</span>
                        <span className={getGradeColorClass(landingResult.gradeDetails.breakdown.pitch)}>
                          {landingResult.gradeDetails.breakdown.pitch}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {landingResult.maxDeviations && (
                  <div className="touchdown-summary">
                    <h3>Maximum Deviations</h3>
                    <div className="touchdown-details">
                      <div className="detail-row">
                        <span>Altitude (from glidepath):</span>
                        <span className={landingResult.busted?.altitude ? 'bad' : 'good'}>
                          {Math.round(landingResult.maxDeviations.altitude)} ft
                          {landingResult.busted?.altitude ? ' ⚠ BUSTED' : ' ✓'}
                        </span>
                      </div>
                      <div className="detail-row">
                        <span>Speed (from Vref+5):</span>
                        <span className={landingResult.busted?.speed ? 'bad' : 'good'}>
                          {Math.round(landingResult.maxDeviations.speed)} kt
                          {landingResult.busted?.speed ? ' ⚠ BUSTED' : ' ✓'}
                        </span>
                      </div>
                      <div className="detail-row">
                        <span>Bank Angle:</span>
                        <span className={landingResult.busted?.bank ? 'bad' : 'good'}>
                          {Math.round(landingResult.maxDeviations.bank)}°
                          {landingResult.busted?.bank ? ' ⚠ BUSTED' : ' ✓'}
                        </span>
                      </div>
                      <div className="detail-row">
                        <span>Pitch Angle:</span>
                        <span className={landingResult.busted?.pitch ? 'bad' : 'good'}>
                          {Math.round(landingResult.maxDeviations.pitch)}°
                          {landingResult.busted?.pitch ? ' ⚠ BUSTED' : ' ✓'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {touchdownData.current && (
                  <div className="touchdown-summary">
                    <h3>Touchdown</h3>
                    <div className="touchdown-details">
                      <div className="detail-row">
                        <span>Distance from threshold:</span>
                        <span>{Math.round(touchdownData.current.distanceFromThreshold)} ft</span>
                      </div>
                      <div className="detail-row">
                        <span>Vertical speed:</span>
                        <span>{Math.round(Math.abs(touchdownData.current.verticalSpeed))} fpm</span>
                      </div>
                      <div className="detail-row">
                        <span>Firmness:</span>
                        <span className={`firmness ${touchdownData.current.firmness}`}>
                          {touchdownData.current.firmness.toUpperCase()}
                        </span>
                      </div>
                      <div className="detail-row">
                        <span>Airspeed:</span>
                        <span>{Math.round(touchdownData.current.airspeed)} kt</span>
                      </div>
                    </div>
                  </div>
                )}

                {landingResult.flightPath && landingResult.flightPath.length > 0 && (
                  <>
                    <ApproachPathReplay
                      runway={runway}
                      flightPath={landingResult.flightPath}
                      referencePath={selectedLandingPath ? savedLandingPaths.find(p => p.id === selectedLandingPath)?.path_data : null}
                    />
                    <div style={{ marginTop: '24px' }}>
                      <FlightPath3D 
                        flightPath={landingResult.flightPath}
                        entry={landingResult.flightPath[0]}
                        referencePath={selectedLandingPath ? savedLandingPaths.find(p => p.id === selectedLandingPath)?.path_data : null}
                        runway={runway}
                        runwayName={getRunwayDisplayName(selectedRunway, customRunways)}
                        maneuverType="landing"
                      />
                    </div>
                  </>
                )}

                <button className="big-button reset" onClick={reset}>
                  Reset & Try Again
                </button>
              </div>
            )}

            {pathFollowingResult && (
              <div className={`card grade-card ${getGradeColorClass(pathFollowingResult.grade)}`}>
                <div className="grade-header">
                  <div className={`grade ${getGradeColorClass(pathFollowingResult.grade)}`}>
                    {pathFollowingResult.grade}
                  </div>
                  {pathFollowingResult.skillLevel && (
                    <div className="skill-level-badge">
                      {pathFollowingResult.skillLevel.charAt(0).toUpperCase() + pathFollowingResult.skillLevel.slice(1)}
                    </div>
                  )}
                </div>

                {pathFollowingResult.gradeDetails && (
                  <div className="grade-breakdown">
                    <h3>Grade Breakdown</h3>
                    <div className="breakdown-grid">
                      <div className="breakdown-item">
                        <span>Altitude:</span>
                        <span className={getGradeColorClass(pathFollowingResult.gradeDetails.breakdown.altitude)}>
                          {pathFollowingResult.gradeDetails.breakdown.altitude}
                        </span>
                      </div>
                      <div className="breakdown-item">
                        <span>Lateral:</span>
                        <span className={getGradeColorClass(pathFollowingResult.gradeDetails.breakdown.lateral)}>
                          {pathFollowingResult.gradeDetails.breakdown.lateral}
                        </span>
                      </div>
                      <div className="breakdown-item">
                        <span>Speed:</span>
                        <span className={getGradeColorClass(pathFollowingResult.gradeDetails.breakdown.speed)}>
                          {pathFollowingResult.gradeDetails.breakdown.speed}
                        </span>
                      </div>
                      <div className="breakdown-item">
                        <span>Bank:</span>
                        <span className={getGradeColorClass(pathFollowingResult.gradeDetails.breakdown.bank)}>
                          {pathFollowingResult.gradeDetails.breakdown.bank}
                        </span>
                      </div>
                      <div className="breakdown-item">
                        <span>Pitch:</span>
                        <span className={getGradeColorClass(pathFollowingResult.gradeDetails.breakdown.pitch)}>
                          {pathFollowingResult.gradeDetails.breakdown.pitch}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="touchdown-summary">
                  <h3>Maximum Deviations</h3>
                  <div className="touchdown-details">
                    <div className="detail-row">
                      <span>Altitude:</span>
                      <span className={pathFollowingResult.busted.altitude ? 'bad' : 'good'}>
                        {Math.round(pathFollowingResult.maxDeviations.altitude)} ft
                        {pathFollowingResult.busted.altitude ? ' ⚠ BUSTED' : ' ✓'}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span>Lateral (Path):</span>
                      <span className={pathFollowingResult.busted.lateral ? 'bad' : 'good'}>
                        {Math.round(pathFollowingResult.maxDeviations.lateral * 6076)} ft
                        {pathFollowingResult.busted.lateral ? ' ⚠ BUSTED' : ' ✓'}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span>Speed:</span>
                      <span className={pathFollowingResult.busted.speed ? 'bad' : 'good'}>
                        {Math.round(pathFollowingResult.maxDeviations.speed)} kt
                        {pathFollowingResult.busted.speed ? ' ⚠ BUSTED' : ' ✓'}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span>Bank Angle:</span>
                      <span className={pathFollowingResult.busted.bank ? 'bad' : 'good'}>
                        {Math.round(pathFollowingResult.maxDeviations.bank)}°
                        {pathFollowingResult.busted.bank ? ' ⚠ BUSTED' : ' ✓'}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span>Pitch Angle:</span>
                      <span className={pathFollowingResult.busted.pitch ? 'bad' : 'good'}>
                        {Math.round(pathFollowingResult.maxDeviations.pitch)}°
                        {pathFollowingResult.busted.pitch ? ' ⚠ BUSTED' : ' ✓'}
                      </span>
                    </div>
                  </div>
                </div>

                {pathFollowingResult.flightPath && pathFollowingResult.flightPath.length > 0 && (
                  <>
                    <ApproachPathReplay
                      runway={runway}
                      flightPath={pathFollowingResult.flightPath}
                      referencePath={pathFollowingResult.referencePath || (() => {
                        if (pathFollowingResult.pathName && savedLandingPaths.length > 0) {
                          const refPath = savedLandingPaths.find(p => p.path_name === pathFollowingResult.pathName)
                          return refPath?.path_data || null
                        }
                        return null
                      })()}
                    />
                    <div style={{ marginTop: '24px' }}>
                      <FlightPath3D 
                        flightPath={pathFollowingResult.flightPath}
                        entry={pathFollowingResult.flightPath[0]}
                        referencePath={pathFollowingResult.referencePath || (() => {
                          if (pathFollowingResult.pathName && savedLandingPaths.length > 0) {
                            const refPath = savedLandingPaths.find(p => p.path_name === pathFollowingResult.pathName)
                            return refPath?.path_data || null
                          }
                          return null
                        })()}
                        runway={runway}
                        runwayName={getRunwayDisplayName(selectedRunway, customRunways)}
                        maneuverType="path_following"
                      />
                    </div>
                  </>
                )}

                {/* AI Feedback Section */}
                {aiFeedback ? (
                  <div className="ai-feedback-section" style={{ marginTop: '24px' }}>
                    <h3>AI Feedback</h3>
                    {aiFocus && (
                      <div className="ai-focus">
                        <strong>Focus:</strong> {aiFocus}
                      </div>
                    )}
                    <div className="ai-feedback-text">
                      {aiFeedback.split('\n').map((line, idx) => (
                        <div key={idx}>{line}</div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: '24px' }}>
                    <button
                      className="btn-primary"
                      onClick={handlePathFollowingAiFeedbackRequest}
                      disabled={aiLoading}
                    >
                      {aiLoading ? 'Loading...' : 'Get AI Feedback'}
                    </button>
                    {aiError && (
                      <div style={{ color: '#ff4444', marginTop: '8px', fontSize: '0.9rem' }}>
                        {aiError}
                      </div>
                    )}
                  </div>
                )}

                <button className="big-button reset" onClick={reset}>
                  Reset & Try Again
                </button>
              </div>
            )}

            {!tracking && state === 'ready' && !pathFollowingResult && (
              <div className="card">
                <h2>KJKA Approach Standards</h2>
                <div className="info-section">
                  <p><strong>Airport:</strong> Jack Edwards Airport (KJKA)</p>
                  <p><strong>Location:</strong> Gulf Shores, Alabama</p>
                  <p><strong>Field Elevation:</strong> {JKA_AIRPORT.elevation} ft MSL</p>
                  <p><strong>Pattern Altitude:</strong> {JKA_AIRPORT.patternAltitude} ft MSL</p>
                  <p><strong>Glidepath:</strong> {GLIDEPATH.angle}°</p>
                  
                  <h3 style={{ marginTop: '20px' }}>Phases</h3>
                  <ul className="phases-list">
                    <li><strong>Downwind:</strong> {JKA_AIRPORT.patternAltitude} ft, Vref+20 kt</li>
                    <li><strong>Base:</strong> 800-900 ft, Vref+15 kt, 400-800 fpm descent</li>
                    <li><strong>Final:</strong> On glidepath, Vref to Vref+10 kt, stabilized by 500 AGL</li>
                    <li><strong>Threshold:</strong> 30-60 ft AGL crossing, Vref ±5 kt</li>
                    <li><strong>Touchdown:</strong> 500-1500 ft past threshold, ≤360 fpm</li>
                  </ul>
                  
                  <p style={{ marginTop: '20px', fontSize: '14px', color: 'var(--text-muted)' }}>
                    Click <strong>Start Tracking</strong> to begin monitoring your approach. The system will automatically 
                    detect which phase you're in and check compliance with standards in real-time.
                  </p>
                </div>
                <button
                  className="grading-scale-button"
                  onClick={() => setShowGradingScale(true)}
                >
                  View Grading Scale
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Save Landing Path Dialog */}
      {showSavePathDialog && (
        <div className="modal-overlay" onClick={() => setShowSavePathDialog(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Save Landing Path</h2>
            <p>Save your current flight path as a reference for future landings.</p>
            <label>
              Path Name
              <input
                type="text"
                value={savePathName}
                onChange={(e) => setSavePathName(e.target.value)}
                placeholder="e.g., Standard Approach, Practice Run 1"
                style={{ width: '100%', padding: '8px', marginTop: '4px' }}
              />
            </label>
            <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
              <button className="btn-primary" onClick={isSavingRecordedPath ? saveRecordedPath : saveCurrentPath}>
                Save
              </button>
              <button className="btn-secondary" onClick={() => {
                setShowSavePathDialog(false)
                setSavePathName('')
                setIsSavingRecordedPath(false)
                if (isSavingRecordedPath) {
                  setPathRecording([])
                }
              }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
