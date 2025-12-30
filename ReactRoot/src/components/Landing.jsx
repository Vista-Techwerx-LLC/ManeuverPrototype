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
import RunwayCalibration, { loadCustomRunways } from './RunwayCalibration'
import FlightPath3D from './FlightPath3D'
import { gradePathFollowing } from '../utils/pathFollowingGrading'
import { fetchPathFollowingFeedback } from '../lib/aiFeedback'
import { getGradeColorClass } from '../utils/steepTurnGrading'
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
  const [selectedRunway, setSelectedRunway] = useState('27') // KJKA Runway 27
  const [customRunways, setCustomRunways] = useState([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [pathDropdownOpen, setPathDropdownOpen] = useState(false)
  const [showCalibration, setShowCalibration] = useState(false)
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
  const [pathFollowingSkillLevel, setPathFollowingSkillLevel] = useState('pro') // Skill level: beginner, amateur, pro
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
  const dropdownRef = useRef(null)
  const pathDropdownRef = useRef(null)

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
    // Check if selected runway is a custom runway
    if (selectedRunway.startsWith('custom_')) {
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
    }
    // Default to KJKA Runway 27
    if (selectedRunway === '27') return JKA_AIRPORT.runway27
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
      }
    }

    // Track deviations from reference path if path following is active
    if (pathFollowingTracking && pathFollowingTracking.referencePath && isAirborne && isMoving) {
      // Check if we've reached the start of the path
      if (!pathStartReached.current) {
        const pathStart = pathFollowingTracking.referencePath[0]
        const distToStart = calculateDistance(
          data.lat, data.lon,
          pathStart.lat, pathStart.lon
        )
        
        // Consider start reached if within 0.3 NM of the first point
        if (distToStart <= 0.3) {
          pathStartReached.current = true
          console.log('Path start reached! Beginning deviation tracking.')
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
          // Calculate deviations
          const altDev = data.alt_ft - closestPoint.alt
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
                closestPointAlt: closestPoint.alt,
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
    setState('tracking')
    
    // Initialize path following tracking if a reference path is selected
    if (selectedLandingPath) {
      const referencePath = savedLandingPaths.find(p => p.id === selectedLandingPath)
      if (referencePath && referencePath.path_data) {
        pathStartReached.current = false // Reset start reached flag
        pathFollowingCompleting.current = false // Reset completion flag
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
        console.log('Started path following tracking with reference:', referencePath.path_name, '- Waiting for path start...')
      }
    } else {
      setPathFollowingTracking(null)
      pathStartReached.current = false
    }
    
    console.log('Started tracking landing approach')
  }

  function stopTracking() {
    // If path following is active and we've started tracking, complete it
    if (pathFollowingTracking && pathStartReached.current && !pathFollowingResult && !pathFollowingCompleting.current) {
      pathFollowingCompleting.current = true
      completePathFollowing()
    } else {
      setTracking(false)
      setState('ready')
      setCurrentPhase(LANDING_PHASES.NONE)
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
      
      // Calculate grade
      const criticalViolations = violations.filter(v => 
        v.phase === LANDING_PHASES.FINAL || 
        v.phase === LANDING_PHASES.THRESHOLD
      )
      
      const unstableApproach = gatesPassed.some(g => !g.compliant)
      const hardLanding = touchdownData.current?.firmness === 'hard'
      
      const allPass = criticalViolations.length === 0 && !unstableApproach && !hardLanding
      const grade = allPass ? 'PASS' : 'FAIL'
      
      const result = {
        grade,
        phaseHistory,
        phaseMetrics,
        gatesPassed,
        violations,
        touchdown: touchdownData.current,
        flightPath,
        runway: selectedRunway,
        vref,
        timestamp: new Date().toISOString()
      }
      
      setLandingResult(result)
      setState('complete')
      
      // Save to database
      saveLandingToDatabase(user.id, {
        grade,
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
      runway: selectedRunway,
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
    setState('ready')
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
    pathFollowingCompleting.current = false
    hasBeenSaved.current = false
    previousPhase.current = LANDING_PHASES.NONE
    lastGateCheck.current = {}
    touchdownData.current = null
  }

  async function handleCalibrationComplete(newRunway) {
    // Reload custom runways
    const loaded = await loadCustomRunways(user)
    setCustomRunways(loaded)
    // Select the newly created runway
    setSelectedRunway(newRunway.id)
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

  return (
    <div className="landing-page">
      <div className="landing-container">
        <h1>Landing Approach Tracker</h1>
        <p className="subtitle">
          {selectedRunway.startsWith('custom_') 
            ? customRunways.find(r => r.id === selectedRunway)?.name || 'Custom Runway'
            : `KJKA (Jack Edwards Airport, Gulf Shores AL) — Runway ${selectedRunway}`
          }
        </p>

        <div className="landing-grid">
          {/* Left Column: Controls and Configuration */}
          <div className="left-col">
            <div className={`card ${dropdownOpen ? 'dropdown-active' : ''}`}>
              <h2>Control</h2>
              <div className={`status-badge ${state}`}>
                ● {state === 'disconnected' ? 'Disconnected' : 
                   state === 'ready' ? 'Ready' : 
                   state === 'tracking' ? `Tracking - ${phaseStandards?.name || 'Monitoring'}` : 
                   'Complete'}
              </div>

              <button
                className={`big-button ${tracking ? 'stop' : 'start'}`}
                disabled={state === 'disconnected' || state === 'complete' || recordingPath}
                onClick={tracking ? stopTracking : startTracking}
              >
                {tracking ? 'Stop Tracking' : 'Start Tracking'}
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
                          {selectedRunway === '27' 
                            ? 'KJKA 27 (Jack Edwards)' 
                            : (() => {
                                const rwy = customRunways.find(r => r.id === selectedRunway)
                                if (!rwy) return 'Custom Runway'
                                const airportCode = extractAirportCode(rwy.name)
                                const airportName = airportCode ? getAirportName(airportCode) : null
                                return airportName ? `${rwy.name} (${airportName})` : rwy.name
                              })()
                          }
                        </span>
                        <span className="selected-details">
                          {selectedRunway === '27' 
                            ? 'Heading 270° (West) — 6,969 ft' 
                            : (() => {
                                const rwy = customRunways.find(r => r.id === selectedRunway)
                                if (!rwy) return ''
                                const direction = getCardinalDirection(rwy.heading)
                                const length = rwy.length ? `${rwy.length.toLocaleString()} ft` : 'Custom'
                                return `Heading ${rwy.heading}° (${direction}) — ${length}`
                              })()
                          }
                        </span>
                      </div>
                      <div className="dropdown-arrow">▼</div>
                    </div>

                    {dropdownOpen && (
                      <div className="dropdown-options">
                        <div 
                          className={`dropdown-option ${selectedRunway === '27' ? 'active' : ''}`}
                          onClick={() => {
                            setSelectedRunway('27')
                            setDropdownOpen(false)
                          }}
                        >
                          <div className="option-main">KJKA 27 (Jack Edwards)</div>
                          <div className="option-sub">Heading 270° (West) — 6,969 ft</div>
                        </div>
                        {customRunways.map(rwy => {
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

                {selectedLandingPath && (
                  <label>
                    Skill Level
                    <select
                      value={pathFollowingSkillLevel}
                      onChange={(e) => setPathFollowingSkillLevel(e.target.value)}
                      disabled={tracking}
                      style={{ width: '100%', padding: '8px', marginTop: '4px' }}
                    >
                      <option value="beginner">Beginner</option>
                      <option value="amateur">Amateur</option>
                      <option value="pro">Pro</option>
                    </select>
                  </label>
                )}

                <div className={`record-path-section ${recordingPath ? 'recording' : ''}`}>
                  <div className="record-path-header">
                    <span className="record-path-title">Record Landing Path</span>
                    {recordingPath && (
                      <span className="recording-indicator">● Recording...</span>
                    )}
                  </div>
                  <p className="record-path-description">
                    Record a flight path independently of landing tracking. The path will be saved for the selected runway.
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

                <button
                  className="btn-calibrate"
                  onClick={() => setShowCalibration(true)}
                  disabled={tracking}
                >
                  + Calibrate New Runway
                </button>
              </div>
            </div>

            {/* Live Telemetry */}
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
                        <div style={{ fontSize: '1.2rem', marginBottom: '8px' }}>⏳ Waiting for Path Start</div>
                        <div style={{ fontSize: '0.9rem', color: '#aaa' }}>
                          Navigate to the start of the path to begin tracking deviations
                        </div>
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

                {/* Approach Path Visualization */}
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

            {/* Complete Summary */}
            {state === 'complete' && landingResult && (
              <div className="card grade-card">
                <h2>Landing Complete</h2>
                <div className={`grade ${landingResult.grade.toLowerCase()}`}>
                  {landingResult.grade}
                </div>

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

                {violations.length > 0 && (
                  <div className="violations-summary">
                    <h3>Deviations ({violations.length})</h3>
                    <div className="violations-list">
                      {violations.slice(-10).reverse().map((v, idx) => (
                        <div key={idx} className="violation-item">
                          <span className="phase-badge">{PHASE_STANDARDS[v.phase]?.name}</span>
                          <span className="violation-text">{v.violation}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button className="big-button reset" onClick={reset}>
                  Reset & Try Again
                </button>
              </div>
            )}

            {pathFollowingResult && (
              <div className={`card grade-card ${getGradeColorClass(pathFollowingResult.grade)}`}>
                <h2>Path Following Complete</h2>
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
                  <div style={{ marginTop: '24px' }}>
                    <FlightPath3D 
                      flightPath={pathFollowingResult.flightPath}
                      entry={pathFollowingResult.flightPath[0]}
                      referencePath={pathFollowingResult.referencePath || (() => {
                        // Fallback: Get reference path from saved paths if available
                        if (pathFollowingResult.pathName && savedLandingPaths.length > 0) {
                          const refPath = savedLandingPaths.find(p => p.path_name === pathFollowingResult.pathName)
                          return refPath?.path_data || null
                        }
                        return null
                      })()}
                    />
                  </div>
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
                    <li><strong>Final:</strong> On glidepath, Vref to Vref+20 kt, stabilized by 500 AGL</li>
                    <li><strong>Threshold:</strong> 30-60 ft AGL crossing, Vref ±5 kt</li>
                    <li><strong>Touchdown:</strong> 500-1500 ft past threshold, ≤360 fpm</li>
                  </ul>
                  
                  <p style={{ marginTop: '20px', fontSize: '14px', color: 'var(--text-muted)' }}>
                    Click <strong>Start Tracking</strong> to begin monitoring your approach. The system will automatically 
                    detect which phase you're in and check compliance with standards in real-time.
                  </p>
                </div>
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
