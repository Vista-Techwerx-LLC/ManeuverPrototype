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
import './Landing.css'

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
  const [selectedRunway, setSelectedRunway] = useState('25') // JKA Runway 25
  const [flightPath, setFlightPath] = useState([])
  const [phaseMetrics, setPhaseMetrics] = useState({})
  const [gatesPassed, setGatesPassed] = useState([])
  const [violations, setViolations] = useState([])
  const [landingResult, setLandingResult] = useState(null)
  const hasBeenSaved = useRef(false)
  const previousPhase = useRef(LANDING_PHASES.NONE)
  const lastGateCheck = useRef({})
  const touchdownData = useRef(null)

  const runway = useMemo(() => {
    if (selectedRunway === '25') return JKA_AIRPORT.runway25
    return null
  }, [selectedRunway])

  // Update state based on connection
  useEffect(() => {
    if (connected && state === 'disconnected') {
      setState('ready')
    } else if (!connected) {
      setState('disconnected')
    }
  }, [connected, state])

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

    // Capture flight path (sample every ~0.5 seconds)
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
  }, [data, connected, tracking, runway, currentPhase, vref, state])

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
    hasBeenSaved.current = false
    previousPhase.current = LANDING_PHASES.NONE
    lastGateCheck.current = {}
    touchdownData.current = null
    setState('tracking')
    console.log('Started tracking landing approach')
  }

  function stopTracking() {
    setTracking(false)
    setState('ready')
    setCurrentPhase(LANDING_PHASES.NONE)
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
    hasBeenSaved.current = false
    previousPhase.current = LANDING_PHASES.NONE
    lastGateCheck.current = {}
    touchdownData.current = null
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

  return (
    <div className="landing-page">
      <div className="landing-container">
        <h1>Landing Approach Tracker</h1>
        <p className="subtitle">JKA (Jack Northrop Field) — Runway {selectedRunway}</p>

        <div className="landing-grid">
          {/* Left Column: Controls and Configuration */}
          <div className="left-col">
            <div className="card">
              <h2>Control</h2>
              <div className={`status-badge ${state}`}>
                ● {state === 'disconnected' ? 'Disconnected' : 
                   state === 'ready' ? 'Ready' : 
                   state === 'tracking' ? `Tracking - ${phaseStandards?.name || 'Monitoring'}` : 
                   'Complete'}
              </div>

              <button
                className={`big-button ${tracking ? 'stop' : 'start'}`}
                disabled={state === 'disconnected' || state === 'complete'}
                onClick={tracking ? stopTracking : startTracking}
              >
                {tracking ? 'Stop Tracking' : 'Start Tracking'}
              </button>

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
                  <select
                    value={selectedRunway}
                    onChange={(e) => setSelectedRunway(e.target.value)}
                    disabled={tracking}
                  >
                    <option value="25">25 (Heading 250°)</option>
                  </select>
                </label>
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

            {!tracking && state === 'ready' && (
              <div className="card">
                <h2>JKA Approach Standards</h2>
                <div className="info-section">
                  <p><strong>Airport:</strong> Jack Northrop Field (JKA)</p>
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
    </div>
  )
}

