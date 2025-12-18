import { useState, useEffect, useRef } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { supabase } from '../lib/supabase'
import AutoStart from './AutoStart'
import { SKILL_LEVELS, MANEUVER_TYPES, checkSteepTurnInRange } from '../utils/autoStartTolerances'
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
    }
  })
  const [pendingStart, setPendingStart] = useState(false)
  const [autoStartEnabled, setAutoStartEnabled] = useState(false)
  const [autoStartSkillLevel, setAutoStartSkillLevel] = useState(SKILL_LEVELS.BEGINNER)
  const [autoStartStatus, setAutoStartStatus] = useState(null)
  const autoStartInRangeStartTime = useRef(null)
  const autoStartPendingTracking = useRef(false)
  const progressCircleRef = useRef(null)
  const hasBeenSaved = useRef(false)

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
      if (autoStartPendingTracking.current && state === 'tracking') {
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
          }
        })
      }
      autoStartInRangeStartTime.current = null
      autoStartPendingTracking.current = false
      setAutoStartStatus(null)
      return
    }

    if (state !== 'ready' && state !== 'tracking') {
      return
    }

    if (state === 'tracking' && !autoStartPendingTracking.current) {
      setAutoStartStatus(null)
      return
    }

    if (state === 'tracking' && autoStartPendingTracking.current) {
      const inRange = checkSteepTurnInRange(data, autoStartSkillLevel)
      
      if (inRange) {
        const timeInRange = (Date.now() - autoStartInRangeStartTime.current) / 1000
        const remainingTime = Math.max(0, 2 - timeInRange)
        
        if (remainingTime > 0) {
          setAutoStartStatus({ 
            type: 'countdown', 
            message: `Confirming in ${remainingTime.toFixed(1)}s...` 
          })
        } else {
          setAutoStartStatus({ type: 'ready', message: 'Auto-started tracking!' })
          autoStartInRangeStartTime.current = null
          autoStartPendingTracking.current = false
        }
      } else {
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
          }
        })
        autoStartPendingTracking.current = false
        autoStartInRangeStartTime.current = null
        const bankAbs = Math.abs(data.bank_deg || 0)
        setAutoStartStatus({ type: 'monitoring', message: `Bank: ${Math.round(bankAbs)}° (target: 45°)` })
      }
      return
    }

    if (state === 'ready') {
      const inRange = checkSteepTurnInRange(data, autoStartSkillLevel)

      if (inRange) {
        if (autoStartInRangeStartTime.current === null) {
          autoStartInRangeStartTime.current = Date.now()
          autoStartPendingTracking.current = true
          
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
            }
          })
          setState('tracking')
          setAutoStartStatus({ type: 'monitoring', message: 'Monitoring...' })
          hasBeenSaved.current = false
        }
      } else {
        autoStartInRangeStartTime.current = null
        const bankAbs = Math.abs(data.bank_deg || 0)
        setAutoStartStatus({ type: 'monitoring', message: `Bank: ${Math.round(bankAbs)}° (target: 45°)` })
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
        }
      })
      setState('tracking')
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

    setTracking(prev => {
      let newTracking = { ...prev }

      // Determine turn direction
      if (newTracking.turnDirection === null && Math.abs(bank) > 20) {
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
      const bankAbs = Math.abs(bank)
      const bankDev = bankAbs - 45

      // Track all values for averages (only when in significant bank)
      if (bankAbs > 20) {
        newTracking.samples.bank.push(bankAbs)
        newTracking.samples.alt.push(alt)
        newTracking.samples.spd.push(spd)
      }

      if (Math.abs(altDev) > Math.abs(newTracking.maxAltDev)) newTracking.maxAltDev = altDev
      if (Math.abs(spdDev) > Math.abs(newTracking.maxSpdDev)) newTracking.maxSpdDev = spdDev
      if (Math.abs(bankDev) > Math.abs(newTracking.maxBankDev)) newTracking.maxBankDev = bankDev

      if (Math.abs(altDev) > 100) newTracking.busted.alt = true
      if (Math.abs(spdDev) > 10) newTracking.busted.spd = true
      if (bankAbs < 40 || bankAbs > 50) newTracking.busted.bank = true

      // Check for completion
      if (newTracking.totalTurn >= 360) {
        const hdgErr = Math.abs(normalizeAngle(hdg - entry.hdg))
        setTimeout(() => {
          setState('complete')
          const hdgPass = hdgErr <= 10
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
  }, [data, state, entry])

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
      }
    })
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
      }
    })
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
          airspeed: entry.spd
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

  const altDev = entry ? (data?.alt_ft || 0) - entry.alt : 0
  const spdDev = entry ? (data?.ias_kt || 0) - entry.spd : 0
  const bankAbs = data?.bank_deg ? Math.abs(data.bank_deg) : 0
  const bankDev = bankAbs - 45

  const altInTolerance = Math.abs(altDev) <= 100
  const spdInTolerance = Math.abs(spdDev) <= 10
  const bankInTolerance = bankAbs >= 40 && bankAbs <= 50

  const altPct = Math.min(Math.abs(altDev) / 100, 1) * 50
  const spdPct = Math.min(Math.abs(spdDev) / 10, 1) * 50
  const bankPct = Math.min(Math.abs(bankDev) / 5, 1) * 50

  const grade = tracking.grade
  const allPass = grade?.allPass ?? false
  const summary = grade ? (
    allPass
      ? 'All parameters within ACS standards!'
      : [
          tracking.busted.alt && 'altitude exceeded ±100 ft',
          tracking.busted.spd && 'airspeed exceeded ±10 kt',
          tracking.busted.bank && 'bank outside 40-50°',
          !grade.hdgPass && 'rollout heading error > 10°'
        ].filter(Boolean).join(', ')
  ) : ''

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
                    <span className="tolerance-name">Altitude (±100 ft)</span>
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
                    <span>-100</span>
                    <span>0</span>
                    <span>+100</span>
                  </div>
                </div>

                <div className="tolerance-item">
                  <div className="tolerance-header">
                    <span className="tolerance-name">Airspeed (±10 kt)</span>
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
                    <span>-10</span>
                    <span>0</span>
                    <span>+10</span>
                  </div>
                </div>

                <div className="tolerance-item">
                  <div className="tolerance-header">
                    <span className="tolerance-name">Bank Angle (45° ±5°)</span>
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
                    <span>40°</span>
                    <span>45°</span>
                    <span>50°</span>
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
                <div className="summary">{summary || 'Rolled out within ±10° of entry heading'}</div>

                <div className="deviations-list">
                  <div className="deviation-row">
                    <span className="param">Max Altitude Deviation</span>
                    <span className={`max ${Math.abs(tracking.maxAltDev) <= 100 ? 'pass' : 'fail'}`}>
                      {(tracking.maxAltDev >= 0 ? '+' : '') + Math.round(tracking.maxAltDev)} ft
                    </span>
                  </div>
                  <div className="deviation-row">
                    <span className="param">Max Airspeed Deviation</span>
                    <span className={`max ${Math.abs(tracking.maxSpdDev) <= 10 ? 'pass' : 'fail'}`}>
                      {(tracking.maxSpdDev >= 0 ? '+' : '') + Math.round(tracking.maxSpdDev)} kt
                    </span>
                  </div>
                  <div className="deviation-row">
                    <span className="param">Max Bank Deviation</span>
                    <span className={`max ${Math.abs(tracking.maxBankDev) <= 5 ? 'pass' : 'fail'}`}>
                      {(tracking.maxBankDev >= 0 ? '+' : '') + Math.round(tracking.maxBankDev)}° from 45°
                    </span>
                  </div>
                  <div className="deviation-row">
                    <span className="param">Rollout Heading Error</span>
                    <span className={`max ${grade?.hdgErr <= 10 ? 'pass' : 'fail'}`}>
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

                <button className="big-button reset" onClick={reset}>
                  Reset & Try Again
                </button>
              </div>
            )}

            {state !== 'tracking' && state !== 'complete' && (
              <div className="card">
                <h2>Waiting to Start</h2>
                <p style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
                  <strong>ACS Standards (PA.V.A.S5):</strong><br />
                  • Altitude: ±100 feet<br />
                  • Airspeed: ±10 knots<br />
                  • Bank: 45° ±5°<br />
                  • Rollout heading: ±10°<br /><br />
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
