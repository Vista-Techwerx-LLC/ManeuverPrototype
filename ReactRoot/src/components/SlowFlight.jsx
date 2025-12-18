import { useState, useEffect, useRef } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import AutoStart from './AutoStart'
import { SKILL_LEVELS, MANEUVER_TYPES, checkSlowFlightInRange } from '../utils/autoStartTolerances'
import './SlowFlight.css'

function normalizeAngle(angle) {
  let normalized = angle
  while (normalized > 180) normalized -= 360
  while (normalized < -180) normalized += 360
  return normalized
}

function detectPhase(bank, vs_fpm) {
  const bankAbs = Math.abs(bank || 0)
  const vs = vs_fpm || 0
  
  if (bankAbs > 5) {
    return 'turn'
  } else if (vs > 100) {
    return 'climb'
  } else if (vs < -100) {
    return 'descent'
  } else {
    return 'straight'
  }
}

export default function SlowFlight({ user }) {
  const { connected, data } = useWebSocket(user.id)
  const [state, setState] = useState('disconnected')
  const [entry, setEntry] = useState(null)
  const [startTime, setStartTime] = useState(null)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [tracking, setTracking] = useState({
    maxAltDev: 0,
    maxSpdDev: 0,
    maxHdgDev: 0,
    maxBankDev: 0,
    busted: { alt: false, spd: false, hdg: false, bank: false },
    phases: {
      straight: 0,
      turn: 0,
      climb: 0,
      descent: 0
    },
    samples: {
      alt: [],
      spd: [],
      hdg: [],
      bank: [],
      yawRate: []
    }
  })
  const [pendingStart, setPendingStart] = useState(false)
  const [autoStartEnabled, setAutoStartEnabled] = useState(false)
  const [autoStartSkillLevel, setAutoStartSkillLevel] = useState(SKILL_LEVELS.BEGINNER)
  const [autoStartStatus, setAutoStartStatus] = useState(null)
  const autoStartInRangeStartTime = useRef(null)
  const autoStartReferenceEntry = useRef(null)
  const autoStartBaselineEstablishedTime = useRef(null)
  const autoStartOutOfRangeStartTime = useRef(null)

  useEffect(() => {
    if (connected && state === 'disconnected') {
      setState('ready')
    } else if (!connected) {
      setState('disconnected')
    }
  }, [connected, state])

  useEffect(() => {
    if (!autoStartEnabled || state !== 'ready' || !data || !connected) {
      autoStartInRangeStartTime.current = null
      autoStartReferenceEntry.current = null
      autoStartBaselineEstablishedTime.current = null
      autoStartOutOfRangeStartTime.current = null
      setAutoStartStatus(null)
      return
    }

    if (!autoStartReferenceEntry.current) {
      autoStartReferenceEntry.current = {
        hdg: data.hdg_true,
        alt: data.alt_ft,
        spd: data.ias_kt
      }
      autoStartBaselineEstablishedTime.current = Date.now()
      autoStartOutOfRangeStartTime.current = null
      setAutoStartStatus({ type: 'monitoring', message: 'Establishing baseline...' })
      return
    }

    const baselineAge = (Date.now() - autoStartBaselineEstablishedTime.current) / 1000
    if (baselineAge < 0.5) {
      setAutoStartStatus({ type: 'monitoring', message: 'Establishing baseline...' })
      return
    }

    const inRange = checkSlowFlightInRange(data, autoStartReferenceEntry.current, autoStartSkillLevel)

    if (inRange) {
      autoStartOutOfRangeStartTime.current = null
      
      if (autoStartInRangeStartTime.current === null) {
        autoStartInRangeStartTime.current = Date.now()
        setAutoStartStatus({ type: 'monitoring', message: 'Monitoring...' })
      } else {
        const timeInRange = (Date.now() - autoStartInRangeStartTime.current) / 1000
        const remainingTime = Math.max(0, 2 - timeInRange)
        
        if (remainingTime > 0) {
          setAutoStartStatus({ 
            type: 'countdown', 
            message: `Starting in ${remainingTime.toFixed(1)}s...` 
          })
        } else {
          setAutoStartStatus({ type: 'ready', message: 'Starting tracking...' })
          setPendingStart(true)
          autoStartInRangeStartTime.current = null
          autoStartReferenceEntry.current = null
          autoStartBaselineEstablishedTime.current = null
          autoStartOutOfRangeStartTime.current = null
        }
      }
    } else {
      autoStartInRangeStartTime.current = null
      
      if (autoStartOutOfRangeStartTime.current === null) {
        autoStartOutOfRangeStartTime.current = Date.now()
      }
      
      const timeOutOfRange = (Date.now() - autoStartOutOfRangeStartTime.current) / 1000
      
      if (timeOutOfRange > 2) {
        autoStartReferenceEntry.current = null
        autoStartBaselineEstablishedTime.current = null
        autoStartOutOfRangeStartTime.current = null
        setAutoStartStatus({ type: 'monitoring', message: 'Waiting for stable flight...' })
      } else {
        setAutoStartStatus({ type: 'monitoring', message: 'Waiting for stable flight...' })
      }
    }
  }, [autoStartEnabled, state, data, connected, autoStartSkillLevel])

  useEffect(() => {
    if (data && state === 'ready' && pendingStart) {
      setPendingStart(false)
      const newEntry = {
        hdg: data.hdg_true,
        alt: data.alt_ft,
        spd: data.ias_kt
      }
      setEntry(newEntry)
      setStartTime(Date.now())
      setElapsedTime(0)
      setTracking({
        maxAltDev: 0,
        maxSpdDev: 0,
        maxHdgDev: 0,
        maxBankDev: 0,
        busted: { alt: false, spd: false, hdg: false, bank: false },
        phases: {
          straight: 0,
          turn: 0,
          climb: 0,
          descent: 0
        },
        samples: {
          alt: [],
          spd: [],
          hdg: [],
          bank: [],
          yawRate: []
        }
      })
      setState('tracking')
    }
  }, [data, state, pendingStart])

  useEffect(() => {
    if (state === 'tracking' && startTime) {
      const interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000))
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [state, startTime])

  useEffect(() => {
    if (!data || state !== 'tracking' || !entry) return

    const hdg = data.hdg_true
    const alt = data.alt_ft
    const spd = data.ias_kt
    const bank = data.bank_deg
    const vs_fpm = data.vs_fpm
    const yawRate = data.yaw_rate

    if (hdg == null || alt == null || spd == null || bank == null) return

    setTracking(prev => {
      let newTracking = { ...prev }

      const altDev = alt - entry.alt
      const spdDev = spd - entry.spd
      const hdgDev = Math.abs(normalizeAngle(hdg - entry.hdg))
      const bankAbs = Math.abs(bank)

      if (Math.abs(altDev) > Math.abs(newTracking.maxAltDev)) newTracking.maxAltDev = altDev
      if (spdDev < 0) {
        if (newTracking.maxSpdDev >= 0 || spdDev < newTracking.maxSpdDev) {
          newTracking.maxSpdDev = spdDev
        }
      } else if (spdDev > newTracking.maxSpdDev) {
        newTracking.maxSpdDev = spdDev
      }
      if (hdgDev > newTracking.maxHdgDev) newTracking.maxHdgDev = hdgDev
      if (bankAbs > newTracking.maxBankDev) newTracking.maxBankDev = bankAbs

      if (Math.abs(altDev) > 100) newTracking.busted.alt = true
      if (spdDev < 0 || spdDev > 10) newTracking.busted.spd = true
      if (hdgDev > 10) newTracking.busted.hdg = true
      if (bankAbs > 10) newTracking.busted.bank = true

      const phase = detectPhase(bank, vs_fpm)
      newTracking.phases[phase] = (newTracking.phases[phase] || 0) + 1

      newTracking.samples.alt.push(alt)
      newTracking.samples.spd.push(spd)
      newTracking.samples.hdg.push(hdg)
      newTracking.samples.bank.push(bankAbs)
      if (yawRate != null) newTracking.samples.yawRate.push(Math.abs(yawRate))

      return newTracking
    })
  }, [data, state, entry])

  function cancelTracking() {
    setEntry(null)
    setStartTime(null)
    setElapsedTime(0)
    setState('ready')
    setTracking({
      maxAltDev: 0,
      maxSpdDev: 0,
      maxHdgDev: 0,
      maxBankDev: 0,
      busted: { alt: false, spd: false, hdg: false, bank: false },
      phases: {
        straight: 0,
        turn: 0,
        climb: 0,
        descent: 0
      },
      samples: {
        alt: [],
        spd: [],
        hdg: [],
        bank: [],
        yawRate: []
      }
    })
  }

  function completeManeuver() {
    if (!entry || !tracking.samples.alt.length) return

    const avgAlt = tracking.samples.alt.reduce((a, b) => a + b, 0) / tracking.samples.alt.length
    const avgSpd = tracking.samples.spd.reduce((a, b) => a + b, 0) / tracking.samples.spd.length
    const avgBank = tracking.samples.bank.reduce((a, b) => a + b, 0) / tracking.samples.bank.length
    const avgYawRate = tracking.samples.yawRate.length > 0
      ? tracking.samples.yawRate.reduce((a, b) => a + b, 0) / tracking.samples.yawRate.length
      : 0

    const allPass = !tracking.busted.alt && !tracking.busted.spd && !tracking.busted.hdg && !tracking.busted.bank

    setTracking(prev => ({
      ...prev,
      grade: {
        allPass,
        averages: {
          alt: avgAlt,
          spd: avgSpd,
          bank: avgBank,
          yawRate: avgYawRate,
          altDev: avgAlt - entry.alt,
          spdDev: avgSpd - entry.spd
        }
      }
    }))
    setState('complete')
  }

  function reset() {
    setEntry(null)
    setStartTime(null)
    setElapsedTime(0)
    setState('ready')
    setTracking({
      maxAltDev: 0,
      maxSpdDev: 0,
      maxHdgDev: 0,
      maxBankDev: 0,
      busted: { alt: false, spd: false, hdg: false, bank: false },
      phases: {
        straight: 0,
        turn: 0,
        climb: 0,
        descent: 0
      },
      samples: {
        alt: [],
        spd: [],
        hdg: [],
        bank: [],
        yawRate: []
      }
    })
  }

  function handleStartClick() {
    if (state === 'ready') {
      setPendingStart(true)
    } else if (state === 'tracking') {
      cancelTracking()
    }
  }

  const altDev = entry ? (data?.alt_ft || 0) - entry.alt : 0
  const spdDev = entry ? (data?.ias_kt || 0) - entry.spd : 0
  const hdgDev = entry && data?.hdg_true != null ? Math.abs(normalizeAngle(data.hdg_true - entry.hdg)) : 0
  const bankAbs = data?.bank_deg ? Math.abs(data.bank_deg) : 0

  const altInTolerance = Math.abs(altDev) <= 100
  const spdInTolerance = spdDev >= 0 && spdDev <= 10
  const hdgInTolerance = hdgDev <= 10
  const bankInTolerance = bankAbs <= 10

  const altPct = Math.min(Math.abs(altDev) / 100, 1) * 50
  const spdPct = spdDev < 0 ? 50 : Math.min(spdDev / 10, 1) * 50
  const hdgPct = Math.min(hdgDev / 10, 1) * 50
  const bankPct = Math.min(bankAbs / 10, 1) * 50

  const currentPhase = data ? detectPhase(data.bank_deg, data.vs_fpm) : 'straight'
  const phaseLabels = {
    straight: 'Straight & Level',
    turn: 'Turn',
    climb: 'Climb',
    descent: 'Descent'
  }

  const grade = tracking.grade
  const allPass = grade?.allPass ?? false
  const summary = grade ? (
    allPass
      ? 'All parameters within ACS standards!'
      : [
          tracking.busted.alt && 'altitude exceeded ±100 ft',
          tracking.busted.spd && 'airspeed outside +10/-0 kt',
          tracking.busted.hdg && 'heading exceeded ±10°',
          tracking.busted.bank && 'bank angle exceeded ±10°'
        ].filter(Boolean).join(', ')
  ) : ''

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="slow-flight-page">
      <div className="slow-flight-container">
        <h1>Slow Flight Tracker</h1>
        <p className="subtitle">ACS PA.V.B — Private Pilot Slow Flight</p>

        <div className="slow-flight-grid">
          <div className="left-col">
            <div className="card">
              <h2>Control</h2>
              <div className={`status-badge ${state}`}>
                ● {state === 'disconnected' ? 'Disconnected' : 
                   state === 'ready' ? 'Ready' : 
                   state === 'tracking' ? 'Tracking' : 'Complete'}
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
                maneuverType={MANEUVER_TYPES.SLOW_FLIGHT}
              />

              {state === 'tracking' && (
                <button
                  className="big-button complete"
                  onClick={completeManeuver}
                >
                  Complete Maneuver
                </button>
              )}

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
                      <label>Elapsed Time</label>
                      <div className="value">{formatTime(elapsedTime)}</div>
                    </div>
                  </div>

                  {state === 'tracking' && (
                    <div className="phase-indicator">
                      <div className="phase-label">Current Phase:</div>
                      <div className={`phase-badge ${currentPhase}`}>
                        {phaseLabels[currentPhase]}
                      </div>
                    </div>
                  )}
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
                  <div className="val">{data?.vs_fpm != null ? Math.round(data.vs_fpm) : '---'}</div>
                  <div className="lbl">VS fpm</div>
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
                <h2>Tolerances</h2>

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
                    <span className="tolerance-name">Airspeed (+10 / -0 kt)</span>
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
                    <span>-0</span>
                    <span>Entry</span>
                    <span>+10</span>
                  </div>
                </div>

                <div className="tolerance-item">
                  <div className="tolerance-header">
                    <span className="tolerance-name">Heading (±10°)</span>
                    <span className={`tolerance-value ${hdgInTolerance ? 'pass' : 'fail'}`}>
                      {Math.round(hdgDev)}°
                    </span>
                  </div>
                  <div className="tolerance-bar">
                    <div
                      className="fill"
                      style={{
                        left: '50%',
                        width: `${hdgPct}%`,
                        background: hdgInTolerance ? 'var(--green)' : 'var(--red)'
                      }}
                    />
                    <div className="center-line" />
                  </div>
                  <div className="tolerance-limits">
                    <span>0°</span>
                    <span>Entry</span>
                    <span>±10°</span>
                  </div>
                </div>

                <div className="tolerance-item">
                  <div className="tolerance-header">
                    <span className="tolerance-name">Bank Angle (max ±10°)</span>
                    <span className={`tolerance-value ${bankInTolerance ? 'pass' : 'fail'}`}>
                      {Math.round(bankAbs)}°
                    </span>
                  </div>
                  <div className="tolerance-bar">
                    <div
                      className="fill"
                      style={{
                        left: '50%',
                        width: `${bankPct}%`,
                        background: bankInTolerance ? 'var(--green)' : 'var(--red)'
                      }}
                    />
                    <div className="center-line" />
                  </div>
                  <div className="tolerance-limits">
                    <span>0°</span>
                    <span>Coordinated</span>
                    <span>10°</span>
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
                <div className="summary">{summary || 'All parameters within tolerance'}</div>

                <div className="deviations-list">
                  <div className="deviation-row">
                    <span className="param">Max Altitude Deviation</span>
                    <span className={`max ${Math.abs(tracking.maxAltDev) <= 100 ? 'pass' : 'fail'}`}>
                      {(tracking.maxAltDev >= 0 ? '+' : '') + Math.round(tracking.maxAltDev)} ft
                    </span>
                  </div>
                  <div className="deviation-row">
                    <span className="param">Max Airspeed Deviation</span>
                    <span className={`max ${tracking.maxSpdDev >= 0 && tracking.maxSpdDev <= 10 ? 'pass' : 'fail'}`}>
                      {(tracking.maxSpdDev >= 0 ? '+' : '') + Math.round(tracking.maxSpdDev)} kt
                    </span>
                  </div>
                  <div className="deviation-row">
                    <span className="param">Max Heading Deviation</span>
                    <span className={`max ${tracking.maxHdgDev <= 10 ? 'pass' : 'fail'}`}>
                      {Math.round(tracking.maxHdgDev)}°
                    </span>
                  </div>
                  <div className="deviation-row">
                    <span className="param">Max Bank Angle</span>
                    <span className={`max ${tracking.maxBankDev <= 10 ? 'pass' : 'fail'}`}>
                      {Math.round(tracking.maxBankDev)}°
                    </span>
                  </div>
                  
                  {grade?.averages && (
                    <>
                      <div className="deviation-row" style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
                        <span className="param" style={{ fontWeight: '600', color: 'var(--text)' }}>Averages</span>
                        <span className="param"></span>
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
                      <div className="deviation-row">
                        <span className="param">Average Bank Angle</span>
                        <span className="max">
                          {Math.round(grade.averages.bank)}°
                        </span>
                      </div>
                      <div className="deviation-row">
                        <span className="param">Average Yaw Rate</span>
                        <span className="max">
                          {grade.averages.yawRate.toFixed(1)}°/s
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
                  <strong>ACS Standards (PA.V.B.S5):</strong><br />
                  • Altitude: ±100 feet<br />
                  • Airspeed: +10 / -0 knots<br />
                  • Heading: ±10°<br />
                  • Bank Angle: ±10° (coordinated flight)<br />
                  • No stall warning<br /><br />
                  Establish slow flight at the minimum controllable airspeed, then click <strong>Start Tracking</strong>. 
                  Practice straight-and-level flight, turns, climbs, and descents while maintaining coordinated flight within tolerances.
                  Click <strong>Complete Maneuver</strong> when finished.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

