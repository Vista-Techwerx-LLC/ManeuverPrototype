import { useState, useEffect, useRef, useMemo } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { supabase } from '../lib/supabase'
import { fetchSteepTurnFeedback } from '../lib/aiFeedback'
import AutoStart from './AutoStart'
import FlightPath3D from './FlightPath3D'
import { SKILL_LEVELS, MANEUVER_TYPES, checkSteepTurnInRange, getSteepTurnEstablishmentThreshold, getSteepTurnPassTolerances } from '../utils/autoStartTolerances'
import './SteepTurn.css'
import { gradeSteepTurn, getGradeColorClass, getThresholds } from '../utils/steepTurnGrading'

function normalizeAngle(angle) {
  let normalized = angle
  while (normalized > 180) normalized -= 360
  while (normalized < -180) normalized += 360
  return normalized
}

const saveInProgress = new Set()

async function saveManeuverToDatabase(userId, maneuverData) {
  const entry = maneuverData.details.entry
  const saveKey = `${userId}-${entry.heading}-${entry.altitude}-${entry.airspeed}-${maneuverData.details.timestamp}`
  
  if (saveInProgress.has(saveKey)) {
    console.log('⚠️ Save already in progress for this maneuver, skipping duplicate')
    return null
  }
  
  saveInProgress.add(saveKey)
  
  try {
    const { data, error } = await supabase
      .from('maneuver_results')
      .insert({
        user_id: userId,
        maneuver_type: 'steep_turn',
        grade: maneuverData.grade,
        result_data: maneuverData.details,
        skill_level: maneuverData.details.autoStart?.enabled ? maneuverData.details.autoStart.skillLevel : null
      })
      .select('id')
      .single()
    
    if (error) {
      console.error('Error saving maneuver:', error)
      saveInProgress.delete(saveKey)
      return null
    }
    
    console.log('✅ Maneuver saved to database')
    setTimeout(() => saveInProgress.delete(saveKey), 10000)
    return data?.id || null
  } catch (error) {
    console.error('Error saving maneuver:', error)
    saveInProgress.delete(saveKey)
    return null
  }
}

async function updateManeuverWithFeedback(maneuverId, feedback) {
  if (!maneuverId) return false
  
  try {
    const { data: existingData, error: fetchError } = await supabase
      .from('maneuver_results')
      .select('result_data')
      .eq('id', maneuverId)
      .single()
    
    if (fetchError || !existingData) {
      console.error('Error fetching maneuver data:', fetchError)
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
      console.error('Error updating maneuver with feedback:', error)
      return false
    }
    
    return true
  } catch (error) {
    console.error('Error updating maneuver with feedback:', error)
    return false
  }
}

async function getManeuverFeedback(maneuverId) {
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
    console.error('Error fetching maneuver feedback:', error)
    return null
  }
}

export default function SteepTurn({ user }) {
  const { connected, data } = useWebSocket(user.id)
  const [state, setState] = useState('disconnected')
  const [entry, setEntry] = useState(null)
  const rolloutStartTimeRef = useRef(null)
  const rolloutLevelStartRef = useRef(null)
  const [tracking, setTracking] = useState({
    turnDirection: null,
    totalTurn: 0,
    lastHdg: null,
    lastBankAbs: null,
    maxAltDev: 0,
    maxSpdDev: 0,
    maxBankDev: 0,
    maxBankReached: 0,
    busted: { alt: false, spd: false, bank: false },
    samples: {
      bank: [],
      alt: [],
      spd: []
    },
    flightPath: [],
    turnEstablished: false,
    rolloutStarted: false,
    rolloutCompleted: false,
    rolloutStartHdg: null,
    rolloutEndHdg: null
  })
  const [pendingStart, setPendingStart] = useState(false)
  const [autoStartEnabled, setAutoStartEnabled] = useState(false)
  const [autoStartSkillLevel, setAutoStartSkillLevel] = useState(SKILL_LEVELS.ACS)
  const [autoStartStatus, setAutoStartStatus] = useState(null)
  const autoStartPhase = useRef('waiting_for_level')
  const levelDetectedTime = useRef(null)
  const baselineData = useRef(null)
  const hasReachedSignificantBank = useRef(false)
  const hasReached25Degrees = useRef(false)
  const progressCircleRef = useRef(null)
  const hasBeenSaved = useRef(false)
  const levelAfterEstablishmentTime = useRef(null)
  const [aiFeedback, setAiFeedback] = useState('')
  const [aiFocus, setAiFocus] = useState('Altitude')
  const [aiError, setAiError] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [lastManeuverData, setLastManeuverData] = useState(null)
  const [currentManeuverId, setCurrentManeuverId] = useState(null)
  const [showAllTips, setShowAllTips] = useState(false)
  const [showGradingScale, setShowGradingScale] = useState(false)

  // Update state based on connection
  useEffect(() => {
    if (connected && state === 'disconnected') {
      setState('ready')
    } else if (!connected) {
      setState('disconnected')
    }
  }, [connected, state])

  // Set skill level to ACS when auto-start is first enabled
  const prevAutoStartEnabled = useRef(false)
  useEffect(() => {
    if (autoStartEnabled && !prevAutoStartEnabled.current) {
      setAutoStartSkillLevel(SKILL_LEVELS.ACS)
    }
    prevAutoStartEnabled.current = autoStartEnabled
  }, [autoStartEnabled])

  // Auto-start monitoring
  useEffect(() => {
    if (!autoStartEnabled || !data || !connected) {
      // Only cancel if auto-start was the one that started tracking
      // Don't cancel manual tracking (when autoStartPhase is 'idle')
      if (state === 'tracking' && autoStartPhase.current !== 'idle' && autoStartPhase.current !== 'waiting_for_level') {
        cancelTracking()
      }
      // Only reset auto-start state if it's not manual tracking
      if (!autoStartEnabled && autoStartPhase.current !== 'idle') {
        autoStartPhase.current = 'waiting_for_level'
        levelDetectedTime.current = null
        baselineData.current = null
        hasReachedSignificantBank.current = false
        hasReached25Degrees.current = false
        levelAfterEstablishmentTime.current = null
        setAutoStartStatus(null)
      }
      return
    }

    if (state !== 'ready' && state !== 'tracking') {
      return
    }

    const bank = data.bank_deg || 0
    const bankAbs = Math.abs(bank)

    if (state === 'tracking' && autoStartPhase.current === 'tracking') {
      if (bankAbs >= 30) {
        hasReachedSignificantBank.current = true
      }
      setAutoStartStatus(null)
      return
    }

    if (state === 'ready') {
      if (autoStartPhase.current === 'waiting_for_level') {
        if (bankAbs <= 3) {
          if (levelDetectedTime.current === null) {
            levelDetectedTime.current = Date.now()
            baselineData.current = {
              hdg: data.hdg_true,
              alt: data.alt_ft,
              spd: data.ias_kt,
              lat: data.lat,
              lon: data.lon,
              samples: []
            }
          }
          
          const timeLevel = (Date.now() - levelDetectedTime.current) / 1000
          if (timeLevel >= 1.0) {
            autoStartPhase.current = 'waiting_for_turn'
            setAutoStartStatus({ type: 'monitoring', message: 'Level flight detected - waiting for turn...' })
          } else {
            setAutoStartStatus({ type: 'monitoring', message: `Leveling... (${timeLevel.toFixed(1)}s)` })
          }
          
          if (baselineData.current) {
            baselineData.current.samples.push({
              hdg: data.hdg_true,
              alt: data.alt_ft,
              spd: data.ias_kt,
              bank: bank,
              timestamp: Date.now()
            })
            if (baselineData.current.samples.length > 20) {
              baselineData.current.samples.shift()
            }
          }
        } else {
          levelDetectedTime.current = null
          baselineData.current = null
          setAutoStartStatus({ type: 'monitoring', message: `Waiting for level flight... (Bank: ${Math.round(bankAbs)}°)` })
        }
      } else if (autoStartPhase.current === 'waiting_for_turn') {
        if (bankAbs <= 3) {
          if (baselineData.current) {
            baselineData.current.samples.push({
              hdg: data.hdg_true,
              alt: data.alt_ft,
              spd: data.ias_kt,
              bank: bank,
              timestamp: Date.now()
            })
            if (baselineData.current.samples.length > 20) {
              baselineData.current.samples.shift()
            }
          }
          setAutoStartStatus({ type: 'monitoring', message: 'Level flight - waiting for turn...' })
        } else if (bankAbs > 5) {
          const avgHdg = baselineData.current && baselineData.current.samples.length > 0
            ? baselineData.current.samples.reduce((sum, s) => sum + (s.hdg || 0), 0) / baselineData.current.samples.length
            : baselineData.current?.hdg || data.hdg_true
          const avgAlt = baselineData.current && baselineData.current.samples.length > 0
            ? baselineData.current.samples.reduce((sum, s) => sum + (s.alt || 0), 0) / baselineData.current.samples.length
            : baselineData.current?.alt || data.alt_ft
          const avgSpd = baselineData.current && baselineData.current.samples.length > 0
            ? baselineData.current.samples.reduce((sum, s) => sum + (s.spd || 0), 0) / baselineData.current.samples.length
            : baselineData.current?.spd || data.ias_kt
          
          const newEntry = {
            hdg: avgHdg,
            alt: avgAlt,
            spd: avgSpd,
            lat: baselineData.current?.lat || data.lat,
            lon: baselineData.current?.lon || data.lon
          }
          
          setEntry(newEntry)
          setTracking({
            turnDirection: null,
            totalTurn: 0,
            lastHdg: newEntry.hdg,
            lastBankAbs: null,
            maxAltDev: 0,
            maxSpdDev: 0,
            maxBankDev: 0,
            maxBankReached: 0,
            busted: { alt: false, spd: false, bank: false },
            samples: {
              bank: [],
              alt: [],
              spd: []
            },
            flightPath: [],
            baselineData: baselineData.current,
            turnEstablished: false,
            rolloutStarted: false,
            rolloutCompleted: false,
            rolloutStartHdg: null,
            rolloutEndHdg: null
          })
          setState('tracking')
          autoStartPhase.current = 'tracking'
          hasReachedSignificantBank.current = false
          hasReached25Degrees.current = false
          setAutoStartStatus({ type: 'ready', message: 'Turn detected - tracking started!' })
          hasBeenSaved.current = false
          
          levelDetectedTime.current = null
          baselineData.current = null
        }
      }
    }
  }, [autoStartEnabled, state, data, connected, autoStartSkillLevel])

  // Handle start tracking when data arrives and pending
  useEffect(() => {
    if (data && state === 'ready' && pendingStart) {
      setPendingStart(false)
        const newEntry = {
          hdg: data.hdg_true,
          alt: data.alt_ft,
          spd: data.ias_kt
        }
      setEntry(newEntry)
      setTracking({
        turnDirection: null,
        totalTurn: 0,
        lastHdg: newEntry.hdg,
        lastBankAbs: null,
        maxAltDev: 0,
        maxSpdDev: 0,
        maxBankDev: 0,
        maxBankReached: 0,
        busted: { alt: false, spd: false, bank: false },
        samples: {
          bank: [],
          alt: [],
          spd: []
        },
        turnEstablished: false,
        rolloutStarted: false,
        rolloutCompleted: false,
        rolloutStartHdg: null,
        rolloutEndHdg: null
      })
      setState('tracking')
      autoStartPhase.current = 'idle'
      setAutoStartStatus(null)
      hasBeenSaved.current = false
      setAiFeedback('')
      setAiFocus('Altitude')
      setAiError('')
      setAiLoading(false)
      setLastManeuverData(null)
    }
  }, [data, state, pendingStart])

  // Update tracking when in tracking state
  useEffect(() => {
    if (!data || (state !== 'tracking' && state !== 'rollout') || !entry) return

    const hdg = data.hdg_true
    const alt = data.alt_ft
    const spd = data.ias_kt
    const bank = data.bank_deg

    if (hdg == null || alt == null || spd == null || bank == null) return

    const establishmentThreshold = getSteepTurnEstablishmentThreshold(autoStartSkillLevel)
    const passTolerances = getSteepTurnPassTolerances(autoStartSkillLevel)
    const bankAbs = Math.abs(bank)
    const now = Date.now()

    // Track when bank reaches 25 degrees
    if (bankAbs >= 25) {
      hasReached25Degrees.current = true
    }

    // Cancel tracking if bank drops below 20 degrees after reaching 25 degrees, but before establishment (only for auto-start tracking)
    // Don't cancel manual tracking (when autoStartPhase is 'idle')
    if (autoStartPhase.current === 'tracking' && !tracking.turnEstablished && hasReached25Degrees.current && bankAbs < 20) {
      setTimeout(() => {
        cancelTracking()
        autoStartPhase.current = 'waiting_for_level'
        levelDetectedTime.current = null
        baselineData.current = null
        hasReachedSignificantBank.current = false
        hasReached25Degrees.current = false
        levelAfterEstablishmentTime.current = null
        setAutoStartStatus({ type: 'monitoring', message: 'Turn canceled - bank angle dropped below 20° before establishing turn' })
      }, 0)
      return
    }

    // Cancel tracking if bank goes back to level before turn is established (only for auto-start tracking)
    // Don't cancel manual tracking (when autoStartPhase is 'idle')
    if (autoStartPhase.current === 'tracking' && !tracking.turnEstablished && bankAbs <= 3) {
      setTimeout(() => {
        cancelTracking()
        autoStartPhase.current = 'waiting_for_level'
        levelDetectedTime.current = null
        baselineData.current = null
        hasReachedSignificantBank.current = false
        hasReached25Degrees.current = false
        levelAfterEstablishmentTime.current = null
        setAutoStartStatus({ type: 'monitoring', message: 'Turn canceled - leveled out before establishing turn' })
      }, 0)
      return
    }

    // After turn is established, cancel only if bank is between -5 to 5 degrees for 3 seconds (only for auto-start tracking)
    // Don't cancel manual tracking (when autoStartPhase is 'idle')
    if (autoStartPhase.current === 'tracking' && tracking.turnEstablished) {
      if (bankAbs <= 5) {
        // Bank is level (between -5 to 5 degrees) - start or continue timer
        if (levelAfterEstablishmentTime.current === null) {
          levelAfterEstablishmentTime.current = Date.now()
        } else {
          // Check if we've been level for 3 seconds
          const timeLevel = (Date.now() - levelAfterEstablishmentTime.current) / 1000
          if (timeLevel >= 3) {
            setTimeout(() => {
              cancelTracking()
              autoStartPhase.current = 'waiting_for_level'
              levelDetectedTime.current = null
              baselineData.current = null
              hasReachedSignificantBank.current = false
              hasReached25Degrees.current = false
              levelAfterEstablishmentTime.current = null
              setAutoStartStatus({ type: 'monitoring', message: 'Turn canceled - leveled out for 3 seconds' })
            }, 0)
            return
          }
        }
      } else {
        // Bank is not level - reset timer
        levelAfterEstablishmentTime.current = null
      }
    }

    setTracking(prev => {
      let newTracking = { 
        ...prev,
        flightPath: prev.flightPath || [],
        samples: prev.samples || {
          bank: [],
          alt: [],
          spd: []
        }
      }

      if (newTracking.turnDirection === null && bankAbs > 20) {
        newTracking.turnDirection = bank > 0 ? 'right' : 'left'
      }

      // Track max bank reached during the turn
      if (bankAbs > newTracking.maxBankReached) {
        newTracking.maxBankReached = bankAbs
      }

      // Calculate turn progress (continue tracking even past 360)
      if ((state === 'tracking' || state === 'rollout') && newTracking.turnDirection && newTracking.lastHdg != null && !newTracking.rolloutCompleted) {
        let delta = hdg - newTracking.lastHdg
        delta = normalizeAngle(delta)

        if (newTracking.turnDirection === 'right' && delta > 0) {
          newTracking.totalTurn += delta
        } else if (newTracking.turnDirection === 'left' && delta < 0) {
          newTracking.totalTurn += Math.abs(delta)
        }
      }
      newTracking.lastHdg = hdg

      const prevBankAbs = newTracking.lastBankAbs ?? bankAbs
      const targetBank = 45
      const rolloutTriggerBank = targetBank * 0.5
      if (
        !newTracking.rolloutStarted &&
        newTracking.totalTurn >= 325 &&
        prevBankAbs > rolloutTriggerBank &&
        bankAbs < prevBankAbs
      ) {
        newTracking.rolloutStarted = true
        newTracking.rolloutStartHdg = hdg
        if (rolloutStartTimeRef.current === null) {
          rolloutStartTimeRef.current = now
          rolloutLevelStartRef.current = null
          setTimeout(() => setState('rollout'), 0)
        }
      }

      // Detect rollout completion: wings level (bank ≤ 5°)
      const WINGS_LEVEL_THRESHOLD = 5
      if (
        newTracking.rolloutStarted &&
        !newTracking.rolloutCompleted &&
        bankAbs <= WINGS_LEVEL_THRESHOLD
      ) {
        newTracking.rolloutCompleted = true
        newTracking.rolloutEndHdg = hdg
      }
      
      newTracking.lastBankAbs = bankAbs

      // Calculate deviations
      const altDev = alt - entry.alt
      const spdDev = spd - entry.spd
      const bankDev = bankAbs - 45

      // Mark turn as established when bank reaches the skill-level threshold
      if (bankAbs >= establishmentThreshold && !newTracking.turnEstablished) {
        newTracking.turnEstablished = true
      }

      // Track all values for averages (only when in significant bank)
      if (bankAbs > 20) {
        newTracking.samples.bank.push(bankAbs)
        newTracking.samples.alt.push(alt)
        newTracking.samples.spd.push(spd)
      }

      // Capture flight path data (sample every ~0.5 seconds to avoid too much data)
      const lastSampleTime = newTracking.lastSampleTime || 0
      if (now - lastSampleTime >= 500 || newTracking.flightPath.length === 0) {
        newTracking.flightPath.push({
          timestamp: now,
          lat: data.lat,
          lon: data.lon,
          alt: alt,
          heading: hdg,
          bank: bank,
          airspeed: spd,
          pitch: data.pitch_deg || 0
        })
        newTracking.lastSampleTime = now
      }

      // Track max deviations for altitude and airspeed from the start
      if (Math.abs(altDev) > Math.abs(newTracking.maxAltDev)) newTracking.maxAltDev = altDev
      if (Math.abs(spdDev) > Math.abs(newTracking.maxSpdDev)) newTracking.maxSpdDev = spdDev
      
      // Only track max bank deviation after turn is established, after 45° of turn, when bank is at least 40°, and during tracking (not during rollout)
      // Stop tracking bank deviation after 330° to avoid penalizing during rollout when bank decreases
      // During rollout, bank should be decreasing to 0°, so we don't track deviations from 45°
      if (newTracking.turnEstablished && state === 'tracking' && newTracking.totalTurn >= 45 && newTracking.totalTurn < 330 && bankAbs >= 40) {
        if (Math.abs(bankDev) > Math.abs(newTracking.maxBankDev)) newTracking.maxBankDev = bankDev
      }

      // Only check for skill-level violations after turn is fully established
      // During rollout, we don't check bank violations since bank should be decreasing to level
      if (newTracking.turnEstablished && state === 'tracking') {
        if (Math.abs(altDev) > passTolerances.altitude) newTracking.busted.alt = true
        if (Math.abs(spdDev) > passTolerances.airspeed) newTracking.busted.spd = true
        if (bankAbs < passTolerances.bank.min || bankAbs > passTolerances.bank.max) newTracking.busted.bank = true
      }
      
      // During rollout, only check altitude and airspeed (not bank)
      if (state === 'rollout' && newTracking.turnEstablished) {
        if (Math.abs(altDev) > passTolerances.altitude) newTracking.busted.alt = true
        if (Math.abs(spdDev) > passTolerances.airspeed) newTracking.busted.spd = true
      }

      // Complete maneuver when rollout is completed (wings level)
      if (newTracking.rolloutCompleted && state === 'rollout') {
        const hdgErr = Math.abs(normalizeAngle(newTracking.rolloutEndHdg - entry.hdg))
        const hdgPass = hdgErr <= passTolerances.rolloutHeading
        const allPass = !newTracking.busted.alt && !newTracking.busted.spd && !newTracking.busted.bank && hdgPass

        const avgBank = newTracking.samples.bank.length > 0
          ? newTracking.samples.bank.reduce((a, b) => a + b, 0) / newTracking.samples.bank.length
          : 0
        const avgAlt = newTracking.samples.alt.length > 0
          ? newTracking.samples.alt.reduce((a, b) => a + b, 0) / newTracking.samples.alt.length
          : 0
        const avgSpd = newTracking.samples.spd.length > 0
          ? newTracking.samples.spd.reduce((a, b) => a + b, 0) / newTracking.samples.spd.length
          : 0

        const gradeResult = gradeSteepTurn({
          avgBank,
          maxBankDev: newTracking.maxBankDev,
          maxAltDev: newTracking.maxAltDev,
          maxSpdDev: newTracking.maxSpdDev,
          busted: newTracking.busted,
          skillLevel: autoStartSkillLevel
        })

        const gradeData = {
          ...gradeResult,
          allPass,
          hdgErr,
          hdgPass,
          totalTurn: newTracking.totalTurn,
          averages: {
            bank: avgBank,
            alt: avgAlt,
            spd: avgSpd,
            altDev: avgAlt - entry.alt,
            spdDev: avgSpd - entry.spd
          }
        }

        setTimeout(async () => {
          setState('complete')
          setTracking(prev2 => ({ ...prev2, grade: gradeData }))
          if (!hasBeenSaved.current) {
            hasBeenSaved.current = true
            await saveManeuver(newTracking, gradeData)
          }
          rolloutStartTimeRef.current = null
          rolloutLevelStartRef.current = null
        }, 0)
      }

      return newTracking
    })
  }, [data, state, entry, autoStartSkillLevel])

  function cancelTracking() {
    setEntry(null)
    setState(connected ? 'ready' : 'disconnected')
    rolloutStartTimeRef.current = null
    rolloutLevelStartRef.current = null
    setAiFeedback('')
    setAiFocus('Altitude')
    setAiError('')
    setAiLoading(false)
    setLastManeuverData(null)
    setCurrentManeuverId(null)
    setTracking({
      turnDirection: null,
      totalTurn: 0,
      lastHdg: null,
      lastBankAbs: null,
      maxAltDev: 0,
      maxSpdDev: 0,
      maxBankDev: 0,
      maxBankReached: 0,
      busted: { alt: false, spd: false, bank: false },
      samples: {
        bank: [],
        alt: [],
        spd: []
      },
      turnEstablished: false,
      rolloutStarted: false,
      rolloutCompleted: false,
      rolloutStartHdg: null,
      rolloutEndHdg: null
    })
    if (autoStartEnabled) {
      autoStartPhase.current = 'waiting_for_level'
      levelDetectedTime.current = null
      baselineData.current = null
      hasReachedSignificantBank.current = false
      hasReached25Degrees.current = false
      levelAfterEstablishmentTime.current = null
    }
    hasBeenSaved.current = false
  }


  function reset() {
    setEntry(null)
    setState(connected ? 'ready' : 'disconnected')
    rolloutStartTimeRef.current = null
    rolloutLevelStartRef.current = null
    setAiFeedback('')
    setAiFocus('Altitude')
    setAiError('')
    setAiLoading(false)
    setLastManeuverData(null)
    setCurrentManeuverId(null)
    setTracking({
      turnDirection: null,
      totalTurn: 0,
      lastHdg: null,
      lastBankAbs: null,
      maxAltDev: 0,
      maxSpdDev: 0,
      maxBankDev: 0,
      maxBankReached: 0,
      busted: { alt: false, spd: false, bank: false },
      samples: {
        bank: [],
        alt: [],
        spd: []
      },
      turnEstablished: false,
      rolloutStarted: false,
      rolloutCompleted: false,
      rolloutStartHdg: null,
      rolloutEndHdg: null
    })
    if (autoStartEnabled) {
      autoStartPhase.current = 'waiting_for_level'
      levelDetectedTime.current = null
      baselineData.current = null
      hasReachedSignificantBank.current = false
      hasReached25Degrees.current = false
      levelAfterEstablishmentTime.current = null
    }
    if (progressCircleRef.current) {
      progressCircleRef.current.style.strokeDashoffset = '263.89'
    }
    hasBeenSaved.current = false
  }

  async function saveManeuver(finalTracking, gradeData) {
    const maneuverData = {
      grade: gradeData?.finalGrade || 'F',
      details: {
        entry: {
          heading: entry.hdg,
          altitude: entry.alt,
          airspeed: entry.spd,
          lat: entry.lat,
          lon: entry.lon
        },
        deviations: {
          maxAltitude: finalTracking.maxAltDev,
          maxAirspeed: finalTracking.maxSpdDev,
          maxBank: finalTracking.maxBankDev,
          rolloutHeadingError: gradeData?.hdgErr ?? 0
        },
        averages: {
          ...gradeData?.averages
        },
        busted: finalTracking.busted,
        turnDirection: finalTracking.turnDirection,
        totalTurn: finalTracking.totalTurn,
        flightPath: finalTracking.flightPath || [],
        autoStart: {
          enabled: autoStartEnabled,
          skillLevel: autoStartSkillLevel
        },
        timestamp: new Date().toISOString(),
        gradeDetails: gradeData || null
      }
    }
    
    setLastManeuverData(maneuverData)
    const maneuverId = await saveManeuverToDatabase(user.id, maneuverData)
    if (maneuverId) {
      setCurrentManeuverId(maneuverId)
      const existingFeedback = await getManeuverFeedback(maneuverId)
      if (existingFeedback) {
        setAiFeedback(existingFeedback)
      }
    }
  }

  function getManeuverDataForFeedback() {
    if (lastManeuverData) return lastManeuverData
    if (!entry || !tracking.grade) return null

    const gradeDetails = tracking.grade
    return {
      grade: gradeDetails?.finalGrade || 'F',
      gradeDetails,
      details: {
        entry: {
          heading: entry.hdg,
          altitude: entry.alt,
          airspeed: entry.spd,
          lat: entry.lat,
          lon: entry.lon
        },
        deviations: {
          maxAltitude: tracking.maxAltDev,
          maxAirspeed: tracking.maxSpdDev,
          maxBank: tracking.maxBankDev,
          rolloutHeadingError: tracking.grade?.hdgErr
        },
        averages: tracking.grade?.averages || null,
        busted: tracking.busted,
        turnDirection: tracking.turnDirection,
        totalTurn: tracking.totalTurn,
        flightPath: tracking.flightPath || [],
        autoStart: {
          enabled: autoStartEnabled,
          skillLevel: autoStartSkillLevel
        },
        timestamp: new Date().toISOString()
      }
    }
  }

  async function handleAiFeedbackRequest(options = {}) {
    const { force = false, reset = false } = options

    if (aiFeedback && !force) {
      return
    }

    if (reset) {
      setAiFeedback('')
      setAiFocus('Altitude')
      setAiError('')
    }

    const payload = getManeuverDataForFeedback()
    if (!payload) {
      setAiError('Maneuver data unavailable. Complete a steep turn first.')
      return
    }

    setAiLoading(true)
    setAiError('')

    try {
      const result = await fetchSteepTurnFeedback({
        maneuver: payload,
        maneuverType: 'steep_turn',
        user: {
          id: user.id,
          email: user.email
        }
      })
      
      if (typeof result === 'object' && result.focus && result.feedback) {
        setAiFocus(result.focus)
        setAiFeedback(result.feedback)
        const feedbackToSave = `FOCUS: ${result.focus}\n\n${result.feedback}`
        if (currentManeuverId) {
          await updateManeuverWithFeedback(currentManeuverId, feedbackToSave)
        }
      } else {
        const feedbackText = typeof result === 'string' ? result : JSON.stringify(result)
        const focusMatch = feedbackText.match(/^FOCUS:\s*(.+?)(?:\n|$)/i)
        if (focusMatch) {
          setAiFocus(focusMatch[1].trim())
          setAiFeedback(feedbackText.replace(/^FOCUS:\s*.+?\n/i, '').trim())
        } else {
          setAiFocus('Altitude')
          setAiFeedback(feedbackText)
        }
        if (currentManeuverId) {
          await updateManeuverWithFeedback(currentManeuverId, feedbackText)
        }
      }
    } catch (error) {
      setAiError(error.message || 'Unable to get AI feedback')
    } finally {
      setAiLoading(false)
    }
  }

  function handleStartClick() {
    if (state === 'ready') {
      if (data && data.hdg_true != null && data.alt_ft != null && data.ias_kt != null) {
        const newEntry = {
          hdg: data.hdg_true,
          alt: data.alt_ft,
          spd: data.ias_kt
        }
        setEntry(newEntry)
        setTracking({
          turnDirection: null,
          totalTurn: 0,
          lastHdg: newEntry.hdg,
          lastBankAbs: null,
          maxAltDev: 0,
          maxSpdDev: 0,
          maxBankDev: 0,
          maxBankReached: 0,
          busted: { alt: false, spd: false, bank: false },
          samples: {
            bank: [],
            alt: [],
            spd: []
          },
          turnEstablished: false,
          rolloutStarted: false,
          rolloutCompleted: false,
          rolloutStartHdg: null,
          rolloutEndHdg: null
        })
        setState('tracking')
        autoStartPhase.current = 'idle'
        setAutoStartStatus(null)
        hasBeenSaved.current = false
        setAiFeedback('')
        setAiFocus('Altitude')
        setAiError('')
        setAiLoading(false)
        setLastManeuverData(null)
      } else {
        setPendingStart(true)
      }
    } else if (state === 'tracking' || state === 'rollout') {
      cancelTracking()
    }
  }

  const progress = Math.min(tracking.totalTurn / 360, 1)
  const circumference = 263.89
  const progressOffset = circumference * (1 - progress)
  
  // Calculate rollout heading error for display during rollout
  const rolloutHeadingError = state === 'rollout' && entry && data?.hdg_true != null
    ? Math.abs(normalizeAngle(data.hdg_true - entry.hdg))
    : null

  const passTolerances = getSteepTurnPassTolerances(autoStartSkillLevel)
  
  const altDev = entry ? (data?.alt_ft || 0) - entry.alt : 0
  const spdDev = entry ? (data?.ias_kt || 0) - entry.spd : 0
  const bankAbs = data?.bank_deg ? Math.abs(data.bank_deg) : 0
  const bankDev = bankAbs - 45

  const altInTolerance = Math.abs(altDev) <= passTolerances.altitude
  const spdInTolerance = Math.abs(spdDev) <= passTolerances.airspeed
  const bankInTolerance = bankAbs >= passTolerances.bank.min && bankAbs <= passTolerances.bank.max

  const altPct = Math.min(Math.abs(altDev) / passTolerances.altitude, 1) * 50
  const spdPct = Math.min(Math.abs(spdDev) / passTolerances.airspeed, 1) * 50
  const bankPct = Math.min(Math.abs(bankDev) / 5, 1) * 50

  const grade = tracking.grade
  const finalGrade = grade?.finalGrade
  const breakdown = grade?.breakdown || {}
  const allPass = grade?.allPass ?? false
  const summary = grade ? (
    allPass
      ? 'All parameters within skill-level standards!'
      : [
          tracking.busted.alt && `altitude exceeded ±${passTolerances.altitude} ft`,
          tracking.busted.spd && `airspeed exceeded ±${passTolerances.airspeed} kt`,
          tracking.busted.bank && `bank outside ${passTolerances.bank.min}-${passTolerances.bank.max}°`,
          !grade.hdgPass && `rollout heading error > ${passTolerances.rolloutHeading}°`
        ].filter(Boolean).join(', ')
  ) : ''

  const flightPathEntry = useMemo(() => {
    if (!entry) return null
    return {
      heading: entry.hdg,
      altitude: entry.alt,
      airspeed: entry.spd,
      lat: entry.lat,
      lon: entry.lon
    }
  }, [entry?.hdg, entry?.alt, entry?.spd, entry?.lat, entry?.lon])

  return (
    <div className="steep-turn-page">
      <div className="steep-turn-container">
        <h1>Steep Turn Tracker</h1>
        <p className="subtitle">ACS PA.V.A — Private Pilot Steep Turns</p>

        <div className="steep-turn-grid">
          <div className="left-col">
            <div className="card">
              <div className={`status-badge ${!connected || !data ? 'disconnected' : state}`}>
                ● {!connected || !data ? 'Disconnected' : 
                   state === 'ready' ? 'Ready' : 
                   state === 'tracking' ? 'Tracking Turn' :
                   state === 'rollout' ? 'Tracking Rollout' : 'Complete'}
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
                className={`big-button ${(state === 'tracking' || state === 'rollout') ? 'stop' : 'start'}`}
                disabled={!connected || !data || state === 'disconnected' || state === 'complete'}
                onClick={handleStartClick}
              >
                {(state === 'tracking' || state === 'rollout') ? 'Cancel' : 'Start Tracking'}
              </button>

              <AutoStart
                enabled={autoStartEnabled && connected && data}
                skillLevel={autoStartSkillLevel}
                onToggle={(value) => {
                  if (!connected || !data) return
                  setAutoStartEnabled(value)
                }}
                onSkillLevelChange={setAutoStartSkillLevel}
                status={autoStartStatus}
                maneuverType={MANEUVER_TYPES.STEEP_TURN}
              />

              {entry && (
                <>
                  <div className="entry-values">
                    <div className="entry-item">
                      <label>Entry Heading</label>
                      <div className="value">{Math.round(entry.hdg)}°</div>
                    </div>
                    <div className="entry-item">
                      <label>Entry Altitude</label>
                      <div className="value">{Math.round(entry.alt)} ft</div>
                    </div>
                    <div className="entry-item">
                      <label>Entry Airspeed</label>
                      <div className="value">{Math.round(entry.spd)} kt</div>
                    </div>
                    <div className="entry-item">
                      <label>Target Bank</label>
                      <div className="value">45°</div>
                    </div>
                  </div>

                  <div className="direction-indicator">
                    <div className={`direction-btn ${tracking.turnDirection === 'left' ? 'active' : ''}`}>
                      ← LEFT
                    </div>
                    <div className={`direction-btn ${tracking.turnDirection === 'right' ? 'active' : ''}`}>
                      RIGHT →
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="card" style={{ marginTop: '16px' }}>
              <h2>Live Data</h2>
              <div className="live-values">
                <div className="live-item">
                  <div className="val">{data?.hdg_true != null ? Math.round(data.hdg_true) : '---'}</div>
                  <div className="lbl">HDG °</div>
                </div>
                <div className="live-item">
                  <div className="val">{data?.alt_ft != null ? Math.round(data.alt_ft) : '---'}</div>
                  <div className="lbl">ALT ft</div>
                </div>
                <div className="live-item">
                  <div className="val">{data?.ias_kt != null ? Math.round(data.ias_kt) : '---'}</div>
                  <div className="lbl">IAS kt</div>
                </div>
                <div className="live-item">
                  <div className="val">{data?.bank_deg != null ? Math.round(Math.abs(data.bank_deg)) : '---'}</div>
                  <div className="lbl">BANK °</div>
                </div>
                <div className="live-item">
                  <div className="val">{data?.g_force != null ? data.g_force.toFixed(1) : '---'}</div>
                  <div className="lbl">G-FORCE</div>
                </div>
                <div className="live-item">
                  <div className="val">{data?.yaw_rate != null ? Math.round(data.yaw_rate) : '---'}</div>
                  <div className="lbl">YAW °/s</div>
                </div>
              </div>
            </div>
          </div>

          <div className="right-col">
            {(state === 'tracking' || state === 'rollout') && (
              <div className="card">
                <h2>{state === 'rollout' ? 'Rollout' : 'Turn Progress'}</h2>

                <div className="heading-ring">
                  <svg viewBox="0 0 100 100">
                    <circle className="bg-circle" cx="50" cy="50" r="42" />
                    {state === 'rollout' ? (
                      <circle
                        ref={progressCircleRef}
                        className="progress-circle"
                        cx="50"
                        cy="50"
                        r="42"
                        strokeDasharray="263.89"
                        style={{ 
                          strokeDashoffset: rolloutHeadingError != null 
                            ? circumference * (1 - Math.min(rolloutHeadingError / passTolerances.rolloutHeading, 1))
                            : circumference
                        }}
                      />
                    ) : (
                      <circle
                        ref={progressCircleRef}
                        className="progress-circle"
                        cx="50"
                        cy="50"
                        r="42"
                        strokeDasharray="263.89"
                        style={{ strokeDashoffset: progressOffset }}
                      />
                    )}
                  </svg>
                  <div className="center-text">
                    {state === 'rollout' ? (
                      <>
                        <div className="degrees">{rolloutHeadingError != null ? Math.round(rolloutHeadingError) : '---'}°</div>
                        <div className="label">Heading Error</div>
                        <div className="label" style={{ fontSize: '12px', marginTop: '4px', opacity: 0.7 }}>
                          Target: ±{passTolerances.rolloutHeading}°
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="degrees">{Math.round(tracking.totalTurn)}°</div>
                        <div className="label">of 360°</div>
                      </>
                    )}
                  </div>
                </div>

                <div className="tolerance-item">
                  <div className="tolerance-header">
                    <span className="tolerance-name">Altitude (±{passTolerances.altitude} ft)</span>
                    <span className={`tolerance-value ${altInTolerance ? 'pass' : 'fail'}`}>
                      {(altDev >= 0 ? '+' : '') + Math.round(altDev)} ft
                    </span>
                  </div>
                  <div className="tolerance-bar">
                    <div
                      className="fill"
                      style={{
                        left: altDev >= 0 ? '50%' : `${50 - altPct}%`,
                        width: `${altPct}%`,
                        background: altInTolerance ? 'var(--green)' : 'var(--red)'
                      }}
                    />
                    <div className="center-line" />
                  </div>
                  <div className="tolerance-limits">
                    <span>-{passTolerances.altitude}</span>
                    <span>0</span>
                    <span>+{passTolerances.altitude}</span>
                  </div>
                </div>

                <div className="tolerance-item">
                  <div className="tolerance-header">
                    <span className="tolerance-name">Airspeed (±{passTolerances.airspeed} kt)</span>
                    <span className={`tolerance-value ${spdInTolerance ? 'pass' : 'fail'}`}>
                      {(spdDev >= 0 ? '+' : '') + Math.round(spdDev)} kt
                    </span>
                  </div>
                  <div className="tolerance-bar">
                    <div
                      className="fill"
                      style={{
                        left: spdDev >= 0 ? '50%' : `${50 - spdPct}%`,
                        width: `${spdPct}%`,
                        background: spdInTolerance ? 'var(--green)' : 'var(--red)'
                      }}
                    />
                    <div className="center-line" />
                  </div>
                  <div className="tolerance-limits">
                    <span>-{passTolerances.airspeed}</span>
                    <span>0</span>
                    <span>+{passTolerances.airspeed}</span>
                  </div>
                </div>

                {state === 'tracking' && (
                  <div className="tolerance-item">
                    <div className="tolerance-header">
                      <span className="tolerance-name">Bank Angle ({passTolerances.bank.min}°-{passTolerances.bank.max}°)</span>
                      <span className={`tolerance-value ${bankInTolerance ? 'pass' : 'fail'}`}>
                        {Math.round(bankAbs)}°
                      </span>
                    </div>
                    <div className="tolerance-bar">
                      <div
                        className="fill"
                        style={{
                          left: bankDev >= 0 ? '50%' : `${50 - bankPct}%`,
                          width: `${bankPct}%`,
                          background: bankInTolerance ? 'var(--green)' : 'var(--red)'
                        }}
                      />
                      <div className="center-line" />
                    </div>
                    <div className="tolerance-limits">
                      <span>{passTolerances.bank.min}°</span>
                      <span>45°</span>
                      <span>{passTolerances.bank.max}°</span>
                    </div>
                  </div>
                )}
                {state === 'rollout' && (
                  <div className="tolerance-item">
                    <div className="tolerance-header">
                      <span className="tolerance-name">Bank Angle (Rolling Out)</span>
                      <span className="tolerance-value">
                        {Math.round(bankAbs)}°
                      </span>
                    </div>
                    <div className="tolerance-bar">
                      <div
                        className="fill"
                        style={{
                          left: '50%',
                          width: `${Math.min((bankAbs / 45) * 50, 50)}%`,
                          background: bankAbs <= 5 ? 'var(--green)' : 'var(--yellow)'
                        }}
                      />
                      <div className="center-line" />
                    </div>
                    <div className="tolerance-limits">
                      <span>0°</span>
                      <span>Level</span>
                      <span>45°</span>
                    </div>
                    <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                      {bankAbs <= 5 ? '✓ Wings Level' : 'Rolling out...'}
                    </div>
                  </div>
                )}
              </div>
            )}

            {state === 'complete' && (
        <div className="card grade-card">
          <h2>Maneuver Complete</h2>
          <div className={`grade ${getGradeColorClass(finalGrade)}`}>
            {finalGrade || '—'}
          </div>
          <div className="grade-breakdown">
            <span className={`grade-chip ${getGradeColorClass(breakdown.bank)} ${breakdown.bank === finalGrade ? 'worst' : ''}`}>
              Bank: {breakdown.bank || '—'}
            </span>
            <span className={`grade-chip ${getGradeColorClass(breakdown.alt)} ${breakdown.alt === finalGrade ? 'worst' : ''}`}>
              Alt: {breakdown.alt || '—'}
            </span>
            <span className={`grade-chip ${getGradeColorClass(breakdown.spd)} ${breakdown.spd === finalGrade ? 'worst' : ''}`}>
              Spd: {breakdown.spd || '—'}
            </span>
          </div>
          <div className="summary">{summary || `Rolled out within ±${passTolerances.rolloutHeading}° of entry heading`}</div>

                <div className="ai-feedback">
                  <div className="ai-feedback-header">
                    <div className="ai-title-group">
                      <div className="ai-title">AI Debrief</div>
                      <svg className="ai-title-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M7.775 3.275a.75.75 0 001.06 1.06l1.25-1.25a2 2 0 112.83 2.83l-2.5 2.5a2 2 0 01-2.83 0 .75.75 0 00-1.06 1.06 3.5 3.5 0 004.95 0l2.5-2.5a3.5 3.5 0 00-4.95-4.95l-1.25 1.25zm-4.69 9.64a2 2 0 010-2.83l2.5-2.5a2 2 0 012.83 0 .75.75 0 001.06-1.06 3.5 3.5 0 00-4.95 0l-2.5 2.5a3.5 3.5 0 004.95 4.95l1.25-1.25a.75.75 0 00-1.06-1.06l-1.25 1.25a2 2 0 01-2.83 0z"/>
                      </svg>
                      <svg className="ai-title-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z"/>
                      </svg>
                    </div>
                    {!aiFeedback && (
                      <div className="ai-header-actions">
                        <button className="ai-feedback-button" onClick={handleAiFeedbackRequest} disabled={aiLoading}>
                          {aiLoading ? 'Requesting...' : 'Get AI Feedback'}
                        </button>
                      </div>
                    )}
                  </div>
                  
                  {aiError && <div className="ai-feedback-error">{aiError}</div>}
                  
                  {aiFeedback && (
                    <div className="ai-feedback-content">
                      <div className="ai-overall-focus">
                        <div className="ai-overall-focus-label">Overall Focus</div>
                        <div className="ai-overall-focus-value">
                          {aiFocus} →
                        </div>
                      </div>
                      
                      <div className="ai-corrections-section">
                        <div className="ai-corrections-title">
                          Top Corrections ({aiFeedback.split('\n').filter(line => {
                            const trimmed = line.trim();
                            return trimmed && (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.match(/^\d+[\.\)]/));
                          }).length || 0})
                        </div>
                        <div className="ai-corrections-list">
                          {aiFeedback.split('\n').filter(line => {
                            const trimmed = line.trim();
                            return trimmed && (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.match(/^\d+[\.\)]/));
                          }).slice(0, showAllTips ? undefined : 3).map((line, idx) => {
                            const trimmed = line.replace(/^[•\-\d+\.\)]\s*/, '').trim();
                            const isHigh = trimmed.toLowerCase().includes('high') || idx === 0;
                            const isMed = trimmed.toLowerCase().includes('med') || idx === 1;
                            const priority = isHigh ? 'high' : isMed ? 'med' : 'low';
                            const categoryMatch = trimmed.match(/(HIGH|MED|LOW)\s*-\s*(\w+)/i);
                            const category = categoryMatch ? categoryMatch[2] : ['ENTRY', 'PITCH', 'AIRSPEED', 'BANK', 'ROLLOUT'][idx] || 'GENERAL';
                            
                            const parts = trimmed.split(/[\.:]/);
                            const instruction = parts[0] || trimmed;
                            const cue = parts.slice(1).join('.').trim();
                            
                            return (
                              <div key={idx} className={`ai-correction-item ${priority}`}>
                                <div className={`ai-correction-number ${priority}`}>
                                  {idx + 1}
                                </div>
                                <div className="ai-correction-content">
                                  <div className={`ai-correction-category ${priority}`}>
                                    {priority.toUpperCase()} - {category}
                                  </div>
                                  <div className="ai-correction-instruction">
                                    {instruction}
                                  </div>
                                  {cue && (
                                    <div className="ai-correction-cue">
                                      {cue}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      
                      <div className="ai-feedback-footer">
                        <div className="ai-footer-actions">
                          <button className="ai-footer-button" onClick={() => setShowAllTips(!showAllTips)}>
                            <svg viewBox="0 0 16 16" fill="currentColor" style={{ transform: showAllTips ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                              <path d="M4.427 9.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 9H4.604a.25.25 0 00-.177.427z"/>
                            </svg>
                            {showAllTips ? 'Show less' : 'Show all tips'}
                          </button>
                          <button className="ai-footer-button" onClick={() => {
                            navigator.clipboard.writeText(aiFeedback);
                          }}>
                            <svg viewBox="0 0 16 16" fill="currentColor">
                              <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z"/>
                              <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z"/>
                            </svg>
                            Copy coaching
                          </button>
                        </div>
                        <button className="ai-footer-button" onClick={() => {
                          setShowAllTips(false);
                          handleAiFeedbackRequest({ force: true, reset: true });
                        }} disabled={aiLoading}>
                          <svg viewBox="0 0 16 16" fill="currentColor">
                            <path fillRule="evenodd" d="M8 2.5a5.487 5.487 0 00-4.131 1.869l1.204 1.204A.25.25 0 014.896 6H1.25A.25.25 0 011 5.75V2.104a.25.25 0 01.427-.177L2.627 3.27A6.991 6.991 0 018 1.5c3.866 0 7 3.134 7 7a6.991 6.991 0 01-1.77 4.627l1.204 1.204A.25.25 0 0114.896 14H11.25a.25.25 0 01-.25-.25v-3.646a.25.25 0 01.427-.177l1.204 1.204A5.487 5.487 0 008 12.5c-3.038 0-5.5-2.462-5.5-5.5S4.962 1.5 8 1.5z"/>
                          </svg>
                          Regenerate
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {!aiFeedback && !aiError && !aiLoading && (
                    <div className="ai-feedback-placeholder">
                      Tap the button to fetch personalized coaching from the AI.
                    </div>
                  )}
                </div>

                <div className="deviations-list">
                  <div className="deviation-row">
                    <span className="param">Max Altitude Deviation</span>
                    <span className={`max ${Math.abs(tracking.maxAltDev) <= passTolerances.altitude ? 'pass' : 'fail'}`}>
                      {(tracking.maxAltDev >= 0 ? '+' : '') + Math.round(tracking.maxAltDev)} ft
                    </span>
                  </div>
                  <div className="deviation-row">
                    <span className="param">Max Airspeed Deviation</span>
                    <span className={`max ${Math.abs(tracking.maxSpdDev) <= passTolerances.airspeed ? 'pass' : 'fail'}`}>
                      {(tracking.maxSpdDev >= 0 ? '+' : '') + Math.round(tracking.maxSpdDev)} kt
                    </span>
                  </div>
                  <div className="deviation-row">
                    <span className="param">Max Bank Deviation</span>
                    <span className={`max ${Math.abs(tracking.maxBankDev) <= Math.max(passTolerances.bank.max - 45, 45 - passTolerances.bank.min) ? 'pass' : 'fail'}`}>
                      {(tracking.maxBankDev >= 0 ? '+' : '') + Math.round(tracking.maxBankDev)}° from 45°
                    </span>
                  </div>
                  <div className="deviation-row">
                    <span className="param">Rollout Heading Error</span>
                    <span className={`max ${grade?.hdgErr <= passTolerances.rolloutHeading ? 'pass' : 'fail'}`}>
                      {grade ? Math.round(grade.hdgErr) : 0}°
                    </span>
                  </div>
                  
                  {grade?.averages && (
                    <>
                      <div className="deviation-row" style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
                        <span className="param" style={{ fontWeight: '600', color: 'var(--text)' }}>Averages</span>
                        <span className="param"></span>
                      </div>
                      <div className="deviation-row">
                        <span className="param">Average Bank Angle</span>
                        <span className="max">
                          {Math.round(grade.averages.bank)}°
                        </span>
                      </div>
                      <div className="deviation-row">
                        <span className="param">Average Altitude</span>
                        <span className="max">
                          {Math.round(grade.averages.alt)} ft
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                            ({(grade.averages.altDev >= 0 ? '+' : '') + Math.round(grade.averages.altDev)} from entry)
                          </span>
                        </span>
                      </div>
                      <div className="deviation-row">
                        <span className="param">Average Airspeed</span>
                        <span className="max">
                          {Math.round(grade.averages.spd)} kt
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                            ({(grade.averages.spdDev >= 0 ? '+' : '') + Math.round(grade.averages.spdDev)} from entry)
                          </span>
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {tracking.flightPath && tracking.flightPath.length > 0 && (
                  <div style={{ marginTop: '24px' }}>
                    <FlightPath3D 
                      flightPath={tracking.flightPath} 
                      entry={flightPathEntry}
                      maneuverType={MANEUVER_TYPES.STEEP_TURN}
                      skillLevel={autoStartSkillLevel}
                    />
                  </div>
                )}

                <button className="big-button reset" onClick={reset}>
                  Reset & Try Again
                </button>
              </div>
            )}

            {state !== 'tracking' && state !== 'complete' && (
              <div className="card">
                <h2>Waiting to Start</h2>
                <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', marginBottom: '20px' }}>
                  Establish level flight at maneuvering speed, then click <strong>Start Tracking</strong> to capture entry parameters and begin monitoring your 360° steep turn.<br /><br />
                  Alternatively, enable <strong>Auto-Start</strong> to automatically begin tracking when you establish level flight and initiate your turn. Auto-Start will detect when you're level, wait for you to begin your turn, and automatically capture entry parameters.
                </p>
                <div style={{ marginBottom: '16px' }}>
                  <strong style={{ color: 'var(--text)', display: 'block', marginBottom: '8px' }}>
                    Skill-Level Standards ({autoStartSkillLevel === 'acs' ? 'ACS' : autoStartSkillLevel.charAt(0).toUpperCase() + autoStartSkillLevel.slice(1)}):
                  </strong>
                  <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', margin: 0 }}>
                    • Altitude: ±{passTolerances.altitude} feet<br />
                    • Airspeed: ±{passTolerances.airspeed} knots<br />
                    • Bank: {passTolerances.bank.min}°-{passTolerances.bank.max}°<br />
                    • Rollout heading: ±{passTolerances.rolloutHeading}°
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

      {showGradingScale && (
        <div className="modal-overlay" onClick={() => setShowGradingScale(false)}>
          <div className="modal-content grading-scale-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Grading Scale - {autoStartSkillLevel === 'acs' ? 'ACS' : autoStartSkillLevel.charAt(0).toUpperCase() + autoStartSkillLevel.slice(1)}</h2>
            {(() => {
              const thresholds = getThresholds(autoStartSkillLevel)
              const grades = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-']
              
              return (
                <div className="grading-scale-content">
                  <div className="grading-scale-section">
                    <h3>Bank Angle</h3>
                    <p className="grading-scale-note">Based on average error from 45° and maximum deviation</p>
                    <table className="grading-table">
                      <thead>
                        <tr>
                          <th>Grade</th>
                          <th>Avg Error</th>
                          <th>Max Dev</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grades.map(grade => {
                          const gradeKey = grade.replace('+', 'plus').replace('-', 'minus')
                          const bankData = thresholds.bank[gradeKey]
                          if (!bankData) return null
                          return (
                            <tr key={grade}>
                              <td className={`grade-cell ${getGradeColorClass(grade)}`}>{grade}</td>
                              <td>≤ {bankData.avgError}°</td>
                              <td>≤ {bankData.maxDev}°</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="grading-scale-section grading-scale-section-altitude">
                    <h3>Altitude</h3>
                    <p className="grading-scale-note">Maximum deviation from entry altitude</p>
                    <table className="grading-table grading-table-narrow">
                      <thead>
                        <tr>
                          <th>Grade</th>
                          <th>Max Dev</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grades.map(grade => {
                          const gradeKey = grade.replace('+', 'plus').replace('-', 'minus')
                          const altValue = thresholds.altitude[gradeKey]
                          if (altValue === undefined) return null
                          return (
                            <tr key={grade}>
                              <td className={`grade-cell ${getGradeColorClass(grade)}`}>{grade}</td>
                              <td>≤ {altValue} ft</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="grading-scale-section">
                    <h3>Airspeed</h3>
                    <p className="grading-scale-note">Maximum deviation from entry airspeed</p>
                    <table className="grading-table grading-table-narrow">
                      <thead>
                        <tr>
                          <th>Grade</th>
                          <th>Max Dev</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grades.map(grade => {
                          const gradeKey = grade.replace('+', 'plus').replace('-', 'minus')
                          const spdValue = thresholds.airspeed[gradeKey]
                          if (spdValue === undefined) return null
                          return (
                            <tr key={grade}>
                              <td className={`grade-cell ${getGradeColorClass(grade)}`}>{grade}</td>
                              <td>≤ {spdValue} kt</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ gridColumn: '1 / -1', marginTop: '8px', padding: '12px 16px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                    <strong style={{ color: 'var(--text)', display: 'block', marginBottom: '6px' }}>Note:</strong>
                    The final grade is determined by the worst of the three categories (Bank, Altitude, Airspeed). 
                    Violations of skill-level standards may cap the grade (e.g., altitude/airspeed violations cap at C-, bank violations cap at D).
                  </div>
                </div>
              )
            })()}
            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setShowGradingScale(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}