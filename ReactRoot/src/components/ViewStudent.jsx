import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { getSteepTurnPassTolerances, SKILL_LEVELS } from '../utils/autoStartTolerances'
import { getGradeColorClass } from '../utils/steepTurnGrading'
import FlightPath3D from './FlightPath3D'
import ApproachPathReplay from './ApproachPathReplay'
import { hydrateRunway } from '../utils/runwayHelpers'
import './ViewStudent.css'

async function loadCustomRunways(user) {
  if (!user) return []

  try {
    // Get accepted connections (both as student and instructor)
    const { data: relationships, error: relError } = await supabase
      .from('instructor_relationships')
      .select('student_id, instructor_id, status')
      .or(`and(student_id.eq.${user.id},status.eq.accepted),and(instructor_id.eq.${user.id},status.eq.accepted)`)

    // Collect all connected user IDs (including own)
    const connectedUserIds = new Set([user.id])
    relationships?.forEach(rel => {
      if (rel.student_id === user.id) {
        connectedUserIds.add(rel.instructor_id)
      } else if (rel.instructor_id === user.id) {
        connectedUserIds.add(rel.student_id)
      }
    })

    const { data: dbRunways, error: dbError } = await supabase
      .from('custom_runways')
      .select('user_id, runway_data, runway_name, created_at')
      .in('user_id', Array.from(connectedUserIds))
      .order('created_at', { ascending: false })

    if (dbError) {
      console.error('Error loading runways from database:', dbError)
      return []
    }

    return dbRunways?.map(r => ({
      ...r.runway_data,
      id: r.runway_data?.id || `db_${r.user_id}_${r.runway_name}`,
      name: r.runway_data?.name || r.runway_name
    })) || []
  } catch (error) {
    console.error('Error loading custom runways:', error)
    return []
  }
}

function getDisplayManeuverType(maneuverType) {
  if (maneuverType === 'path_following') {
    return 'LANDING'
  }
  return maneuverType.replace('_', ' ').toUpperCase()
}

function getRunwayDisplayName(runwayData, customRunways = []) {
  if (typeof runwayData === 'string') {
    // Handle old format - just the ID string
    if (runwayData === '27') {
      return 'KJKA 27 (Jack Edwards)'
    }
    if (runwayData.startsWith('custom_')) {
      // Look up the runway name from custom runways
      const customRunway = customRunways.find(r => r.id === runwayData)
      if (customRunway) {
        const airportCode = customRunway.name.match(/^([A-Z]{3,4})\s/)?.[1]
        const airportName = airportCode ? {
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
        }[airportCode] : null
        return airportName ? `${customRunway.name} (${airportName})` : customRunway.name
      }
      return 'Custom Runway'
    }
    return runwayData
  }

  // Handle new format - object with name property
  if (runwayData?.name) {
    return runwayData.name
  }

  // Fallback
  return runwayData?.id || 'Unknown'
}

export default function ViewStudent({ user }) {
  const { studentId } = useParams()
  const navigate = useNavigate()
  const [student, setStudent] = useState(null)
  const [maneuvers, setManeuvers] = useState([])
  const [loading, setLoading] = useState(true)
  const [hasAccess, setHasAccess] = useState(false)
  const [customRunways, setCustomRunways] = useState([])

  useEffect(() => {
    if (studentId && user.id) {
      checkAccess()
      loadCustomRunways(user).then(setCustomRunways)
    }
  }, [user.id, studentId])

  async function checkAccess() {
    if (!studentId || !user.id) {
      console.log('Missing studentId or userId:', { studentId, userId: user.id })
      setHasAccess(false)
      setLoading(false)
      return
    }

    // If viewing your own progress, skip access check
    if (studentId === user.id) {
      console.log('Viewing own progress - access granted')
      setHasAccess(true)
      loadStudentData()
      return
    }

    try {
      // Check if users are connected (bidirectional - either direction works)
      // Check both directions separately for better reliability
      const { data: asInstructor, error: e1 } = await supabase
        .from('instructor_relationships')
        .select('*')
        .eq('instructor_id', user.id)
        .eq('student_id', studentId)
        .eq('status', 'accepted')
        .maybeSingle()

      const { data: asStudent, error: e2 } = await supabase
        .from('instructor_relationships')
        .select('*')
        .eq('instructor_id', studentId)
        .eq('student_id', user.id)
        .eq('status', 'accepted')
        .maybeSingle()

      const hasAccess = (asInstructor && !e1) || (asStudent && !e2)

      console.log('Access check:', { 
        userId: user.id, 
        studentId, 
        asInstructor, 
        asStudent,
        e1, 
        e2,
        hasAccess
      })

      if (!hasAccess) {
        console.log('No accepted relationship found')
        setHasAccess(false)
        setLoading(false)
        return
      }

      setHasAccess(true)
      loadStudentData()
    } catch (error) {
      console.error('Error checking access:', error)
      setHasAccess(false)
      setLoading(false)
    }
  }

  async function loadStudentData() {
    try {
      // Get student profile
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', studentId)
        .single()

      setStudent(profile)

      // Get all maneuvers
      const { data: maneuversData, error } = await supabase
        .from('maneuver_results')
        .select('*')
        .eq('user_id', studentId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error loading maneuvers:', error)
        return
      }

      setManeuvers(maneuversData || [])
    } catch (error) {
      console.error('Error loading student data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Prepare chart data
  const chartData = maneuvers
    .filter(m => m.maneuver_type === 'steep_turn')
    .map((m, index) => ({
      attempt: maneuvers.length - index,
      date: new Date(m.created_at).toLocaleDateString(),
      grade: m.grade === 'PASS' ? 1 : 0,
      maxAltDev: Math.abs(m.result_data?.deviations?.maxAltitude || 0),
      maxSpdDev: Math.abs(m.result_data?.deviations?.maxAirspeed || 0),
      maxBankDev: Math.abs(m.result_data?.deviations?.maxBank || 0),
      rolloutError: m.result_data?.deviations?.rolloutHeadingError || 0,
      avgBank: m.result_data?.averages?.bank || 0
    }))
    .reverse()

  const stats = {
    total: maneuvers.length,
    passed: maneuvers.filter(m => m.grade === 'PASS').length,
    failed: maneuvers.filter(m => m.grade === 'FAIL').length,
    passRate: maneuvers.length > 0 
      ? Math.round((maneuvers.filter(m => m.grade === 'PASS').length / maneuvers.length) * 100)
      : 0
  }

  if (loading) {
    return (
      <div className="view-student-page">
        <div className="view-student-container">
          <h1>Loading...</h1>
        </div>
      </div>
    )
  }

  if (!hasAccess) {
    return (
      <div className="view-student-page">
        <div className="view-student-container">
          <h1>Access Denied</h1>
          <p>You don't have permission to view this user's progress.</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '8px' }}>
            Make sure you're both connected and the connection has been accepted.
          </p>
          <button onClick={() => navigate('/friends')} className="back-btn">
            Back to Instructor Portal
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="view-student-page">
      <div className="view-student-container">
        <div className="student-header">
          {studentId === user.id ? (
            <button onClick={() => navigate('/dashboard')} className="back-btn">
              ← Back to Dashboard
            </button>
          ) : (
            <button onClick={() => navigate('/friends')} className="back-btn">
              ← Back to Connections
            </button>
          )}
          <div>
            <h1>{studentId === user.id ? 'My Progress & Logs' : 'Progress & Logs'}</h1>
            <p className="student-email">{student?.email || 'Unknown'}</p>
          </div>
        </div>

        <div className="stats-cards">
          <div className="stat-card">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">Total Maneuvers</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--green-bright)' }}>
              {stats.passed}
            </div>
            <div className="stat-label">Passed</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--red-bright)' }}>
              {stats.failed}
            </div>
            <div className="stat-label">Failed</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.passRate}%</div>
            <div className="stat-label">Pass Rate</div>
          </div>
        </div>

        {chartData.length > 0 && (
          <>
            <div className="chart-section">
              <h2>Progress Over Time</h2>
              <div className="chart-card">
                <h3>Pass/Fail Trend</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis 
                      dataKey="attempt" 
                      stroke="var(--text-muted)"
                      label={{ value: 'Attempt Number', position: 'insideBottom', offset: -5 }}
                    />
                    <YAxis 
                      stroke="var(--text-muted)"
                      domain={[0, 1]}
                      ticks={[0, 1]}
                      tickFormatter={(value) => value === 1 ? 'PASS' : 'FAIL'}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'var(--card)', 
                        border: '1px solid var(--border)',
                        borderRadius: '8px'
                      }}
                      formatter={(value) => value === 1 ? 'PASS' : 'FAIL'}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="grade" 
                      stroke="var(--blue)" 
                      strokeWidth={2}
                      dot={{ fill: 'var(--blue)', r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="chart-section">
              <h2>Deviation Analysis</h2>
              <div className="charts-grid">
                <div className="chart-card">
                  <h3>Max Altitude Deviation</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="attempt" stroke="var(--text-muted)" />
                      <YAxis stroke="var(--text-muted)" label={{ value: 'ft', angle: -90, position: 'insideLeft' }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'var(--card)', 
                          border: '1px solid var(--border)',
                          borderRadius: '8px'
                        }}
                        labelFormatter={() => 'Max Altitude Deviation'}
                        formatter={(value) => `${Math.round(value)} ft`}
                      />
                      <Bar 
                        dataKey="maxAltDev" 
                        name="Max Altitude Deviation"
                        fill="var(--blue)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="chart-card">
                  <h3>Max Airspeed Deviation</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="attempt" stroke="var(--text-muted)" />
                      <YAxis stroke="var(--text-muted)" label={{ value: 'kt', angle: -90, position: 'insideLeft' }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'var(--card)', 
                          border: '1px solid var(--border)',
                          borderRadius: '8px'
                        }}
                        labelFormatter={() => 'Max Airspeed Deviation'}
                        formatter={(value) => `${Math.round(value)} kt`}
                      />
                      <Bar 
                        dataKey="maxSpdDev" 
                        name="Max Airspeed Deviation"
                        fill="var(--purple)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="chart-card">
                  <h3>Rollout Heading Error</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="attempt" stroke="var(--text-muted)" />
                      <YAxis stroke="var(--text-muted)" label={{ value: '°', angle: -90, position: 'insideLeft' }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'var(--card)', 
                          border: '1px solid var(--border)',
                          borderRadius: '8px'
                        }}
                        labelFormatter={() => 'Rollout Heading Error'}
                        formatter={(value) => `${Math.round(value)}°`}
                      />
                      <Bar 
                        dataKey="rolloutError" 
                        name="Rollout Heading Error"
                        fill="var(--yellow)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="chart-card">
                  <h3>Average Bank Angle</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="attempt" stroke="var(--text-muted)" />
                      <YAxis stroke="var(--text-muted)" label={{ value: '°', angle: -90, position: 'insideLeft' }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'var(--card)', 
                          border: '1px solid var(--border)',
                          borderRadius: '8px'
                        }}
                        labelFormatter={() => 'Average Bank Angle'}
                        formatter={(value) => `${Math.round(value)}°`}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="avgBank" 
                        name="Average Bank Angle"
                        stroke="var(--green-bright)" 
                        strokeWidth={2}
                        dot={{ fill: 'var(--green-bright)', r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="maneuver-list-section">
          <h2>Recent Maneuvers</h2>
          {maneuvers.length === 0 ? (
            <div className="empty-state">
              <p>No maneuvers logged yet</p>
            </div>
          ) : (
            <div className="maneuver-list">
              {maneuvers.slice(0, 10).map(maneuver => (
                <ManeuverCard key={maneuver.id} maneuver={maneuver} customRunways={customRunways} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ManeuverCard({ maneuver, customRunways }) {
  const [expanded, setExpanded] = useState(false)
  const details = maneuver.result_data
  const isPassed = maneuver.grade === 'PASS'
  const date = new Date(maneuver.created_at)
  const skillLevel = maneuver.skill_level
  const replayRunway = hydrateRunway(details?.runway, customRunways)
  const isSteepTurn = maneuver.maneuver_type === 'steep_turn'
  const isLanding = maneuver.maneuver_type === 'landing'
  const isPathFollowing = maneuver.maneuver_type === 'path_following'

  const formatSkillLevel = (level) => {
    if (!level) return null
    return level.charAt(0).toUpperCase() + level.slice(1)
  }

  // Determine grade color class - use getGradeColorClass for letter grades, pass/fail for steep turns
  const getGradeClass = () => {
    if (isSteepTurn) {
      return isPassed ? 'pass' : 'fail'
    }
    // For landing and path_following, use letter grade colors
    return getGradeColorClass(maneuver.grade)
  }

  // Determine card border color
  const getCardClass = () => {
    if (isSteepTurn) {
      return isPassed ? 'pass' : 'fail'
    }
    // For landing and path_following, use letter grade colors
    const gradeClass = getGradeColorClass(maneuver.grade)
    if (gradeClass === 'grade-green') return 'pass'
    if (gradeClass === 'grade-yellow') return 'grade-yellow'
    if (gradeClass === 'grade-red') return 'fail'
    return 'fail'
  }

  return (
    <div className={`maneuver-card ${getCardClass()}`}>
      <div className="maneuver-header" onClick={() => setExpanded(!expanded)}>
        <div className="maneuver-info">
          <div className="maneuver-type">
            {getDisplayManeuverType(maneuver.maneuver_type)}
            {skillLevel && (
              <span className="skill-level-badge">
                {formatSkillLevel(skillLevel)}
              </span>
            )}
          </div>
          <div className="maneuver-date">
            {date.toLocaleDateString()} {date.toLocaleTimeString()}
          </div>
        </div>
        <div className="maneuver-grade-badge">
          <span className={`grade-text ${getGradeClass()}`}>
            {maneuver.grade}
          </span>
        </div>
      </div>

      {expanded && details && (
        <div className="maneuver-details">
          {isSteepTurn && (
            <>
              <div className="details-section">
                <h3>Entry Parameters</h3>
                <div className="details-grid">
                  <div>
                    <span className="label">Heading:</span>
                    <span className="value">{Math.round(details.entry?.heading || 0)}°</span>
                  </div>
                  <div>
                    <span className="label">Altitude:</span>
                    <span className="value">{Math.round(details.entry?.altitude || 0)} ft</span>
                  </div>
                  <div>
                    <span className="label">Airspeed:</span>
                    <span className="value">{Math.round(details.entry?.airspeed || 0)} kt</span>
                  </div>
                </div>
              </div>

              <div className="details-section">
                <h3>Maximum Deviations</h3>
                <div className="deviation-grid">
                  {(() => {
                    const maneuverSkillLevel = skillLevel || details.autoStart?.skillLevel || SKILL_LEVELS.ACS
                    const tolerances = getSteepTurnPassTolerances(maneuverSkillLevel)
                    const maxBankTolerance = Math.max(tolerances.bank.max - 45, 45 - tolerances.bank.min)
                    
                    return (
                      <>
                        <div className={Math.abs(details.deviations?.maxAltitude || 0) <= tolerances.altitude ? 'pass' : 'fail'}>
                          <span className="label">Altitude:</span>
                          <span className="value">
                            {(details.deviations?.maxAltitude >= 0 ? '+' : '') + 
                             Math.round(details.deviations?.maxAltitude || 0)} ft
                          </span>
                        </div>
                        <div className={Math.abs(details.deviations?.maxAirspeed || 0) <= tolerances.airspeed ? 'pass' : 'fail'}>
                          <span className="label">Airspeed:</span>
                          <span className="value">
                            {(details.deviations?.maxAirspeed >= 0 ? '+' : '') + 
                             Math.round(details.deviations?.maxAirspeed || 0)} kt
                          </span>
                        </div>
                        <div className={Math.abs(details.deviations?.maxBank || 0) <= maxBankTolerance ? 'pass' : 'fail'}>
                          <span className="label">Bank:</span>
                          <span className="value">
                            {(details.deviations?.maxBank >= 0 ? '+' : '') + 
                             Math.round(details.deviations?.maxBank || 0)}°
                          </span>
                        </div>
                        <div className={(details.deviations?.rolloutHeadingError || 0) <= tolerances.rolloutHeading ? 'pass' : 'fail'}>
                          <span className="label">Rollout:</span>
                          <span className="value">{Math.round(details.deviations?.rolloutHeadingError || 0)}°</span>
                        </div>
                      </>
                    )
                  })()}
                </div>
              </div>

              {details.averages && (
                <div className="details-section">
                  <h3>Averages</h3>
                  <div className="details-grid">
                    <div>
                      <span className="label">Bank:</span>
                      <span className="value">{Math.round(details.averages?.bank || 0)}°</span>
                    </div>
                    <div>
                      <span className="label">Altitude:</span>
                      <span className="value">
                        {Math.round(details.averages?.altitude || 0)} ft
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                          ({(details.averages?.altitudeDeviation >= 0 ? '+' : '') + 
                           Math.round(details.averages?.altitudeDeviation || 0)})
                        </span>
                      </span>
                    </div>
                    <div>
                      <span className="label">Airspeed:</span>
                      <span className="value">
                        {Math.round(details.averages?.airspeed || 0)} kt
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                          ({(details.averages?.airspeedDeviation >= 0 ? '+' : '') + 
                           Math.round(details.averages?.airspeedDeviation || 0)})
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {details.flightPath && details.flightPath.length > 0 && (
                <div className="details-section">
                  {replayRunway && (
                    <ApproachPathReplay
                      runway={replayRunway}
                      flightPath={details.flightPath}
                      referencePath={details.referencePath}
                    />
                  )}
                  <FlightPath3D 
                    flightPath={details.flightPath} 
                    entry={details.entry}
                    runway={replayRunway}
                    referencePath={details.referencePath}
                  />
                </div>
              )}
            </>
          )}

          {isLanding && (
            <>
              {details.gradeDetails && details.gradeDetails.breakdown && (
                <div className="details-section">
                  <div className="grade-breakdown">
                    <h3>Grade Breakdown</h3>
                    <div className="breakdown-grid">
                      <div className="breakdown-item">
                        <span>Altitude:</span>
                        <span className={getGradeColorClass(details.gradeDetails.breakdown.altitude)}>
                          {details.gradeDetails.breakdown.altitude}
                        </span>
                      </div>
                      <div className="breakdown-item">
                        <span>Speed:</span>
                        <span className={getGradeColorClass(details.gradeDetails.breakdown.speed)}>
                          {details.gradeDetails.breakdown.speed}
                        </span>
                      </div>
                      <div className="breakdown-item">
                        <span>Bank:</span>
                        <span className={getGradeColorClass(details.gradeDetails.breakdown.bank)}>
                          {details.gradeDetails.breakdown.bank}
                        </span>
                      </div>
                      <div className="breakdown-item">
                        <span>Pitch:</span>
                        <span className={getGradeColorClass(details.gradeDetails.breakdown.pitch)}>
                          {details.gradeDetails.breakdown.pitch}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {details.maxDeviations && (
                <div className="details-section">
                  <h3>Maximum Deviations</h3>
                  <div className="deviation-grid">
                    {details.maxDeviations.altitude !== undefined && (
                      <div className={details.gradeDetails?.breakdown?.altitude 
                        ? getGradeColorClass(details.gradeDetails.breakdown.altitude)
                        : (Math.abs(details.maxDeviations.altitude) <= 100 ? 'pass' : 'fail')}>
                        <span className="label">Altitude (from glidepath):</span>
                        <span className="value">
                          {Math.round(details.maxDeviations.altitude)} ft
                        </span>
                      </div>
                    )}
                    {details.maxDeviations.speed !== undefined && (
                      <div className={details.gradeDetails?.breakdown?.speed
                        ? getGradeColorClass(details.gradeDetails.breakdown.speed)
                        : (Math.abs(details.maxDeviations.speed) <= 10 ? 'pass' : 'fail')}>
                        <span className="label">Speed (from Vref+5):</span>
                        <span className="value">
                          {Math.round(details.maxDeviations.speed)} kt
                        </span>
                      </div>
                    )}
                    {details.maxDeviations.bank !== undefined && (
                      <div className={details.gradeDetails?.breakdown?.bank
                        ? getGradeColorClass(details.gradeDetails.breakdown.bank)
                        : (Math.abs(details.maxDeviations.bank) <= 5 ? 'pass' : 'fail')}>
                        <span className="label">Bank Angle:</span>
                        <span className="value">
                          {Math.round(details.maxDeviations.bank)}°
                        </span>
                      </div>
                    )}
                    {details.maxDeviations.pitch !== undefined && (
                      <div className={details.gradeDetails?.breakdown?.pitch
                        ? getGradeColorClass(details.gradeDetails.breakdown.pitch)
                        : (Math.abs(details.maxDeviations.pitch) <= 3 ? 'pass' : 'fail')}>
                        <span className="label">Pitch Angle:</span>
                        <span className="value">
                          {Math.round(details.maxDeviations.pitch)}°
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {details.phaseHistory && details.phaseHistory.length > 0 && (
                <div className="details-section">
                  <h3>Phase Timeline</h3>
                  <div className="phases-list">
                    {details.phaseHistory.map((phase, idx) => (
                      <li key={idx}>
                        <div>
                          <strong>{phase.phase}</strong> @ {new Date(phase.timestamp).toLocaleTimeString()}
                        </div>
                        <div>
                          Alt {Math.round(phase.data?.alt_ft || 0)} ft · Speed {Math.round(phase.data?.ias_kt || 0)} kt
                        </div>
                      </li>
                    ))}
                  </div>
                </div>
              )}

              {details.touchdown && (
                <div className="details-section">
                  <h3>Touchdown</h3>
                  <div className="details-grid">
                    <div>
                      <span className="label">Distance from Threshold:</span>
                      <span className="value">{Math.round(details.touchdown.distanceFromThreshold || 0)} ft</span>
                    </div>
                    <div>
                      <span className="label">Speed:</span>
                      <span className="value">{Math.round(details.touchdown.airspeed || 0)} kt</span>
                    </div>
                    <div>
                      <span className="label">Vertical Speed:</span>
                      <span className="value">{Math.round(Math.abs(details.touchdown.verticalSpeed || 0))} fpm</span>
                    </div>
                    <div>
                      <span className="label">Firmness:</span>
                      <span className={`value ${details.touchdown.firmness === 'hard' ? 'fail' : 'pass'}`}>
                        {details.touchdown.firmness || 'normal'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {(details.runway || details.vref) && (
                <div className="details-section">
                  <h3>Runway</h3>
                  <div className="details-grid">
                    <div>
                      <span className="label">Runway:</span>
                      <span className="value">
                        {getRunwayDisplayName(details.runway, customRunways)}
                      </span>
                    </div>
                    {details.vref && (
                      <div>
                        <span className="label">Vref:</span>
                        <span className="value">{details.vref} kt</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {details.violations && details.violations.length > 0 && (
                <div className="details-section">
                  <h3>Violations</h3>
                  <ul className="violations-list">
                    {details.violations.map((violation, idx) => (
                      <li key={idx}>
                        {violation.violation || violation}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {details.flightPath && details.flightPath.length > 0 && (
                <div className="details-section">
                  {replayRunway && (
                    <ApproachPathReplay
                      runway={replayRunway}
                      flightPath={details.flightPath}
                      referencePath={details.referencePath}
                    />
                  )}
                  <FlightPath3D 
                    flightPath={details.flightPath} 
                    entry={details.flightPath[0]}
                    runway={replayRunway}
                    referencePath={details.referencePath}
                    runwayName={getRunwayDisplayName(details.runway, customRunways)}
                    maneuverType="landing"
                  />
                </div>
              )}
            </>
          )}

          {isPathFollowing && (
            <>
              {details.gradeDetails && details.gradeDetails.breakdown && (
                <div className="details-section">
                  <div className="grade-breakdown">
                    <h3>Grade Breakdown</h3>
                    <div className="breakdown-grid">
                      <div className="breakdown-item">
                        <span>Altitude:</span>
                        <span className={getGradeColorClass(details.gradeDetails.breakdown.altitude)}>
                          {details.gradeDetails.breakdown.altitude}
                        </span>
                      </div>
                      <div className="breakdown-item">
                        <span>Lateral:</span>
                        <span className={getGradeColorClass(details.gradeDetails.breakdown.lateral)}>
                          {details.gradeDetails.breakdown.lateral}
                        </span>
                      </div>
                      <div className="breakdown-item">
                        <span>Speed:</span>
                        <span className={getGradeColorClass(details.gradeDetails.breakdown.speed)}>
                          {details.gradeDetails.breakdown.speed}
                        </span>
                      </div>
                      <div className="breakdown-item">
                        <span>Bank:</span>
                        <span className={getGradeColorClass(details.gradeDetails.breakdown.bank)}>
                          {details.gradeDetails.breakdown.bank}
                        </span>
                      </div>
                      <div className="breakdown-item">
                        <span>Pitch:</span>
                        <span className={getGradeColorClass(details.gradeDetails.breakdown.pitch)}>
                          {details.gradeDetails.breakdown.pitch}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {details.maxDeviations && (
                <div className="details-section">
                  <h3>Maximum Deviations</h3>
                  <div className="deviation-grid">
                    {details.maxDeviations.altitude !== undefined && (
                      <div className={details.gradeDetails?.breakdown?.altitude 
                        ? getGradeColorClass(details.gradeDetails.breakdown.altitude)
                        : (Math.abs(details.maxDeviations.altitude) <= 100 ? 'pass' : 'fail')}>
                        <span className="label">Altitude:</span>
                        <span className="value">
                          {(details.maxDeviations.altitude >= 0 ? '+' : '') + Math.round(details.maxDeviations.altitude)} ft
                        </span>
                      </div>
                    )}
                    {details.maxDeviations.lateral !== undefined && (
                      <div className={details.gradeDetails?.breakdown?.lateral
                        ? getGradeColorClass(details.gradeDetails.breakdown.lateral)
                        : (Math.abs(details.maxDeviations.lateral) <= 0.2 ? 'pass' : 'fail')}>
                        <span className="label">Lateral (Path):</span>
                        <span className="value">
                          {Math.round(details.maxDeviations.lateral * 6076)} ft
                        </span>
                      </div>
                    )}
                    {details.maxDeviations.speed !== undefined && (
                      <div className={details.gradeDetails?.breakdown?.speed
                        ? getGradeColorClass(details.gradeDetails.breakdown.speed)
                        : (Math.abs(details.maxDeviations.speed) <= 10 ? 'pass' : 'fail')}>
                        <span className="label">Speed:</span>
                        <span className="value">
                          {(details.maxDeviations.speed >= 0 ? '+' : '') + Math.round(details.maxDeviations.speed)} kt
                        </span>
                      </div>
                    )}
                    {details.maxDeviations.bank !== undefined && (
                      <div className={details.gradeDetails?.breakdown?.bank
                        ? getGradeColorClass(details.gradeDetails.breakdown.bank)
                        : (Math.abs(details.maxDeviations.bank) <= 5 ? 'pass' : 'fail')}>
                        <span className="label">Bank Angle:</span>
                        <span className="value">
                          {(details.maxDeviations.bank >= 0 ? '+' : '') + Math.round(details.maxDeviations.bank)}°
                        </span>
                      </div>
                    )}
                    {details.maxDeviations.pitch !== undefined && (
                      <div className={details.gradeDetails?.breakdown?.pitch
                        ? getGradeColorClass(details.gradeDetails.breakdown.pitch)
                        : (Math.abs(details.maxDeviations.pitch) <= 3 ? 'pass' : 'fail')}>
                        <span className="label">Pitch Angle:</span>
                        <span className="value">
                          {(details.maxDeviations.pitch >= 0 ? '+' : '') + Math.round(details.maxDeviations.pitch)}°
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {(details.runway || details.pathName) && (
                <div className="details-section">
                  <h3>Path Info</h3>
                  <div className="details-grid">
                    {details.runway && (
                      <div>
                        <span className="label">Runway:</span>
                        <span className="value">
                          {getRunwayDisplayName(details.runway, customRunways)}
                        </span>
                      </div>
                    )}
                    {details.pathName && (
                      <div>
                        <span className="label">Reference Path:</span>
                        <span className="value">{details.pathName}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {details.referencePath && details.referencePath.length > 0 && (
                <div className="details-section">
                  <h3>Reference Path</h3>
                  <div className="details-grid">
                    <div>
                      <span className="label">Points:</span>
                      <span className="value">{details.referencePath.length}</span>
                    </div>
                  </div>
                </div>
              )}

              {details.flightPath && details.flightPath.length > 0 && (
                <div className="details-section">
                  {replayRunway && (
                    <ApproachPathReplay
                      runway={replayRunway}
                      flightPath={details.flightPath}
                      referencePath={details.referencePath}
                    />
                  )}
                  <FlightPath3D 
                    flightPath={details.flightPath} 
                    entry={details.flightPath[0]}
                    runway={replayRunway}
                    referencePath={details.referencePath}
                    runwayName={getRunwayDisplayName(details.runway, customRunways)}
                    maneuverType="path_following"
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

