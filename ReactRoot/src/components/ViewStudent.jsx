import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { getSteepTurnPassTolerances, SKILL_LEVELS } from '../utils/autoStartTolerances'
import FlightPath3D from './FlightPath3D'
import './ViewStudent.css'

export default function ViewStudent({ user }) {
  const { studentId } = useParams()
  const navigate = useNavigate()
  const [student, setStudent] = useState(null)
  const [maneuvers, setManeuvers] = useState([])
  const [loading, setLoading] = useState(true)
  const [hasAccess, setHasAccess] = useState(false)

  useEffect(() => {
    if (studentId && user.id) {
      checkAccess()
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
                <ManeuverCard key={maneuver.id} maneuver={maneuver} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ManeuverCard({ maneuver }) {
  const [expanded, setExpanded] = useState(false)
  const details = maneuver.result_data
  const isPassed = maneuver.grade === 'PASS'
  const date = new Date(maneuver.created_at)
  const skillLevel = maneuver.skill_level

  const formatSkillLevel = (level) => {
    if (!level) return null
    return level.charAt(0).toUpperCase() + level.slice(1)
  }

  return (
    <div className={`maneuver-card ${isPassed ? 'pass' : 'fail'}`}>
      <div className="maneuver-header" onClick={() => setExpanded(!expanded)}>
        <div className="maneuver-info">
          <div className="maneuver-type">
            {maneuver.maneuver_type.replace('_', ' ').toUpperCase()}
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
          <span className={`grade-text ${isPassed ? 'pass' : 'fail'}`}>
            {maneuver.grade}
          </span>
        </div>
      </div>

      {expanded && details && (
        <div className="maneuver-details">
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
                         Math.round(details.deviations?.maxBank || 0)}° from 45°
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
              <FlightPath3D 
                flightPath={details.flightPath} 
                entry={details.entry}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

