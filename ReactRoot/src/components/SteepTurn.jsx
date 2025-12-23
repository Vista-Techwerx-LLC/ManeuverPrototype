import { useState, useEffect, useRef, useMemo } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { supabase } from '../lib/supabase'
import AutoStart from './AutoStart'
import FlightPath3D from './FlightPath3D'
import { SKILL_LEVELS, MANEUVER_TYPES, checkSteepTurnInRange, getSteepTurnEstablishmentThreshold, getSteepTurnPassTolerances } from '../utils/autoStartTolerances'
import './SteepTurn.css'

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
    return false
  }
  
  saveInProgress.add(saveKey)
  
  try {
    const { error } = await supabase
      .from('maneuver_results')
      .insert({
        user_id: userId,
        maneuver_type: 'steep_turn',
        grade: maneuverData.grade,
        result_data: maneuverData.details,
        skill_level: maneuverData.details.autoStart?.enabled ? maneuverData.details.autoStart.skillLevel : null
      })
    
    if (error) {
      console.error('Error saving maneuver:', error)
      saveInProgress.delete(saveKey)
      return false
    }
    
    console.log('✅ Maneuver saved to database')
    setTimeout(() => saveInProgress.delete(saveKey), 10000)
    return true
  } catch (error) {
    console.error('Error saving maneuver:', error)
    saveInProgress.delete(saveKey)
    return false
  }
}

export default function SteepTurn({ user }) {
  const { connected, data } = useWebSocket(user.id)
  const [state, setState] = useState('disconnected')
  const [entry, setEntry] = useState(null)
  const [tracking, setTracking] = useState({
    turnDirection: null,
    totalTurn: 0,
    lastHdg: null,
    maxAltDev: 0,
    maxSpdDev: 0,
    maxBankDev: 0,
    busted: { alt: false, spd: false, bank: false },
    // Track all values for averages
    samples: {
      bank: [],
      alt: [],
      spd: []
    },
    // Track full flight path for 3D visualization
    flightPath: [],
    // Track if turn is fully established (bank >= 40°) before checking violations
    turnEstablished: false
  })
  const [pendingStart, setPendingStart] = useState(false)
  const [autoStartEnabled, setAutoStartEnabled] = useState(false)
  const [autoStartSkillLevel, setAutoStartSkillLevel] = useState(SKILL_LEVELS.BEGINNER)
  const [autoStartStatus, setAutoStartStatus] = useState(null)
  const autoStartPhase = useRef('waiting_for_level')
  const levelDetectedTime = useRef(null)
  const baselineData = useRef(null)
  const hasReachedSignificantBank = useRef(false)
  const hasReached25Degrees = useRef(false)
  const progressCircleRef = useRef(null)
  const hasBeenSaved = useRef(false)
  const levelAfterEstablishmentTime = useRef(null)

  // Update state based on connection
  useEffect(() => {
    if (connected && state === 'disconnected') {
      setState('ready')
    } else if (!connected) {
      setState('disconnected')
    }
  }, [connected, state])

  // Auto-start monitoring
  useEffect(() => {
    if (!autoStartEnabled || !data || !connected) {
      if (state === 'tracking' && autoStartPhase.current !== 'idle') {
        cancelTracking()
      }
      autoStartPhase.current = 'waiting_for_level'
      levelDetectedTime.current = null
      baselineData.current = null
      hasReachedSignificantBank.current = false
      hasReached25Degrees.current = false
      levelAfterEstablishmentTime.current = null
      setAutoStartStatus(null)
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
            maxAltDev: 0,
            maxSpdDev: 0,
            maxBankDev: 0,
            busted: { alt: false, spd: false, bank: false },
            samples: {
              bank: [],
              alt: [],
              spd: []
            },
            flightPath: [],
            baselineData: baselineData.current,
            turnEstablished: false
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
        maxAltDev: 0,
        maxSpdDev: 0,
        maxBankDev: 0,
        busted: { alt: false, spd: false, bank: false },
        samples: {
          bank: [],
          alt: [],
          spd: []
        },
        turnEstablished: false
      })
      setState('tracking')
      autoStartPhase.current = 'idle'
      setAutoStartStatus(null)
      hasBeenSaved.current = false
    }
  }, [data, state, pendingStart])

  // Update tracking when in tracking state
  useEffect(() => {
    if (!data || state !== 'tracking' || !entry) return

    const hdg = data.hdg_true
    const alt = data.alt_ft
    const spd = data.ias_kt
    const bank = data.bank_deg

    if (hdg == null || alt == null || spd == null || bank == null) return

    const establishmentThreshold = getSteepTurnEstablishmentThreshold(autoStartSkillLevel)
    const passTolerances = getSteepTurnPassTolerances(autoStartSkillLevel)
    const bankAbs = Math.abs(bank)

    // Track when bank reaches 25 degrees
    if (bankAbs >= 25) {
      hasReached25Degrees.current = true
    }

    // Cancel tracking if bank drops below 20 degrees after reaching 25 degrees, but before establishment (only for auto-start tracking)
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

      // Determine turn direction
      if (newTracking.turnDirection === null && bankAbs > 20) {
        newTracking.turnDirection = bank > 0 ? 'right' : 'left'
      }

      // Calculate turn progress
      if (newTracking.turnDirection && newTracking.lastHdg != null) {
        let delta = hdg - newTracking.lastHdg
        delta = normalizeAngle(delta)

        if (newTracking.turnDirection === 'right' && delta > 0) {
          newTracking.totalTurn += delta
        } else if (newTracking.turnDirection === 'left' && delta < 0) {
          newTracking.totalTurn += Math.abs(delta)
        }
      }
      newTracking.lastHdg = hdg

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
      const now = Date.now()
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

      // Track max deviations only after turn is established
      if (newTracking.turnEstablished) {
        if (Math.abs(altDev) > Math.abs(newTracking.maxAltDev)) newTracking.maxAltDev = altDev
        if (Math.abs(spdDev) > Math.abs(newTracking.maxSpdDev)) newTracking.maxSpdDev = spdDev
        if (Math.abs(bankDev) > Math.abs(newTracking.maxBankDev)) newTracking.maxBankDev = bankDev
      }

      // Only check for skill-level violations after turn is fully established
      if (newTracking.turnEstablished) {
        if (Math.abs(altDev) > passTolerances.altitude) newTracking.busted.alt = true
        if (Math.abs(spdDev) > passTolerances.airspeed) newTracking.busted.spd = true
        if (bankAbs < passTolerances.bank.min || bankAbs > passTolerances.bank.max) newTracking.busted.bank = true
      }

      // Check for completion
      if (newTracking.totalTurn >= 360) {
        const hdgErr = Math.abs(normalizeAngle(hdg - entry.hdg))
        const passTolerancesForCompletion = passTolerances
        setTimeout(() => {
          setState('complete')
          const hdgPass = hdgErr <= passTolerancesForCompletion.rolloutHeading
          const allPass = !newTracking.busted.alt && !newTracking.busted.spd && !newTracking.busted.bank && hdgPass
          
          // Calculate averages
          const avgBank = newTracking.samples.bank.length > 0
            ? newTracking.samples.bank.reduce((a, b) => a + b, 0) / newTracking.samples.bank.length
            : 0
          const avgAlt = newTracking.samples.alt.length > 0
            ? newTracking.samples.alt.reduce((a, b) => a + b, 0) / newTracking.samples.alt.length
            : 0
          const avgSpd = newTracking.samples.spd.length > 0
            ? newTracking.samples.spd.reduce((a, b) => a + b, 0) / newTracking.samples.spd.length
            : 0
          
          const gradeData = { 
            allPass, 
            hdgErr, 
            hdgPass,
            averages: {
              bank: avgBank,
              alt: avgAlt,
              spd: avgSpd,
              altDev: avgAlt - entry.alt,
              spdDev: avgSpd - entry.spd
            }
          }
          
          setTracking(prev => ({ ...prev, grade: gradeData }))
          
          // Save to database (only once)
          if (!hasBeenSaved.current) {
            hasBeenSaved.current = true
            saveManeuver(allPass, hdgErr, newTracking, avgBank, avgAlt, avgSpd)
          }
        }, 0)
      }

      return newTracking
    })
  }, [data, state, entry, autoStartSkillLevel])

  function cancelTracking() {
    setEntry(null)
    setState('ready')
    setTracking({
      turnDirection: null,
      totalTurn: 0,
      lastHdg: null,
      maxAltDev: 0,
      maxSpdDev: 0,
      maxBankDev: 0,
      busted: { alt: false, spd: false, bank: false },
      samples: {
        bank: [],
        alt: [],
        spd: []
      },
      turnEstablished: false
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
    setState('ready')
    setTracking({
      turnDirection: null,
      totalTurn: 0,
      lastHdg: null,
      maxAltDev: 0,
      maxSpdDev: 0,
      maxBankDev: 0,
      busted: { alt: false, spd: false, bank: false },
      samples: {
        bank: [],
        alt: [],
        spd: []
      },
      turnEstablished: false
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

  function saveManeuver(allPass, hdgErr, finalTracking, avgBank, avgAlt, avgSpd) {
    const maneuverData = {
      grade: allPass ? 'PASS' : 'FAIL',
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
          rolloutHeadingError: hdgErr
        },
        averages: {
          bank: avgBank,
          altitude: avgAlt,
          airspeed: avgSpd,
          altitudeDeviation: avgAlt - entry.alt,
          airspeedDeviation: avgSpd - entry.spd
        },
        busted: finalTracking.busted,
        turnDirection: finalTracking.turnDirection,
        totalTurn: finalTracking.totalTurn,
        flightPath: finalTracking.flightPath || [],
        autoStart: {
          enabled: autoStartEnabled,
          skillLevel: autoStartSkillLevel
        },
        timestamp: new Date().toISOString()
      }
    }
    
    saveManeuverToDatabase(user.id, maneuverData)
  }

  function handleStartClick() {
    if (state === 'ready') {
      setPendingStart(true)
    } else if (state === 'tracking') {
      cancelTracking()
    }
  }

  const progress = Math.min(tracking.totalTurn / 360, 1)
  const circumference = 263.89
  const progressOffset = circumference * (1 - progress)

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
              <h2>Control</h2>
              <div className={`status-badge ${state}`}>
                ● {state === 'disconnected' ? 'Disconnected' : 
                   state === 'ready' ? 'Ready' : 
                   state === 'tracking' ? 'Tracking Turn' : 'Complete'}
              </div>

              <button
                className={`big-button ${state === 'tracking' ? 'stop' : 'start'}`}
                disabled={state === 'disconnected' || state === 'complete'}
                onClick={handleStartClick}
              >
                {state === 'tracking' ? 'Cancel' : 'Start Tracking'}
              </button>

              <AutoStart
                enabled={autoStartEnabled}
                skillLevel={autoStartSkillLevel}
                onToggle={setAutoStartEnabled}
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
            {state === 'tracking' && (
              <div className="card">
                <h2>Turn Progress</h2>

                <div className="heading-ring">
                  <svg viewBox="0 0 100 100">
                    <circle className="bg-circle" cx="50" cy="50" r="42" />
                    <circle
                      ref={progressCircleRef}
                      className="progress-circle"
                      cx="50"
                      cy="50"
                      r="42"
                      strokeDasharray="263.89"
                      style={{ strokeDashoffset: progressOffset }}
                    />
                  </svg>
                  <div className="center-text">
                    <div className="degrees">{Math.round(tracking.totalTurn)}°</div>
                    <div className="label">of 360°</div>
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
              </div>
            )}

            {state === 'complete' && (
              <div className="card grade-card">
                <h2>Maneuver Complete</h2>
                <div className={`grade ${allPass ? 'pass' : 'fail'}`}>
                  {allPass ? 'PASS' : 'FAIL'}
                </div>
                <div className="summary">{summary || `Rolled out within ±${passTolerances.rolloutHeading}° of entry heading`}</div>

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
                <p style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
                  <strong>Skill-Level Standards ({autoStartSkillLevel.charAt(0).toUpperCase() + autoStartSkillLevel.slice(1)}):</strong><br />
                  • Altitude: ±{passTolerances.altitude} feet<br />
                  • Airspeed: ±{passTolerances.airspeed} knots<br />
                  • Bank: {passTolerances.bank.min}°-{passTolerances.bank.max}°<br />
                  • Rollout heading: ±{passTolerances.rolloutHeading}°<br /><br />
                  Establish level flight at maneuvering speed, then click <strong>Start Tracking</strong> to capture entry parameters and begin monitoring your 360° steep turn.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
