import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts'
import './ViewStudent.css'

export default function ViewStudent({ user }) {
  const { studentId } = useParams()
  const navigate = useNavigate()
  const [student, setStudent] = useState(null)
  const [maneuvers, setManeuvers] = useState([])
  const [loading, setLoading] = useState(true)
  const [hasAccess, setHasAccess] = useState(false)

  useEffect(() => {
    checkAccess()
  }, [user.id, studentId])

  async function checkAccess() {
    try {
      // Check if user has permission to view this student
      const { data, error } = await supabase
        .from('instructor_relationships')
        .select('*')
        .eq('instructor_id', user.id)
        .eq('student_id', studentId)
        .eq('status', 'accepted')
        .single()

      if (error || !data) {
        setHasAccess(false)
        setLoading(false)
        return
      }

      setHasAccess(true)
      loadStudentData()
    } catch (error) {
      console.error('Error checking access:', error)
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
          <p>You don't have permission to view this student's progress.</p>
          <button onClick={() => navigate('/friends')} className="back-btn">
            Back to Friends
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="view-student-page">
      <div className="view-student-container">
        <div className="student-header">
          <button onClick={() => navigate('/friends')} className="back-btn">
            ← Back
          </button>
          <div>
            <h1>Student Progress</h1>
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
                        formatter={(value) => `${Math.round(value)} ft`}
                      />
                      <Bar 
                        dataKey="maxAltDev" 
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
                        formatter={(value) => `${Math.round(value)} kt`}
                      />
                      <Bar 
                        dataKey="maxSpdDev" 
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
                        formatter={(value) => `${Math.round(value)}°`}
                      />
                      <Bar 
                        dataKey="rolloutError" 
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
                        formatter={(value) => `${Math.round(value)}°`}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="avgBank" 
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

  return (
    <div className={`maneuver-card ${isPassed ? 'pass' : 'fail'}`}>
      <div className="maneuver-header" onClick={() => setExpanded(!expanded)}>
        <div className="maneuver-info">
          <div className="maneuver-type">
            {maneuver.maneuver_type.replace('_', ' ').toUpperCase()}
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
              <div className={Math.abs(details.deviations?.maxAltitude || 0) <= 100 ? 'pass' : 'fail'}>
                <span className="label">Altitude:</span>
                <span className="value">
                  {(details.deviations?.maxAltitude >= 0 ? '+' : '') + 
                   Math.round(details.deviations?.maxAltitude || 0)} ft
                </span>
              </div>
              <div className={Math.abs(details.deviations?.maxAirspeed || 0) <= 10 ? 'pass' : 'fail'}>
                <span className="label">Airspeed:</span>
                <span className="value">
                  {(details.deviations?.maxAirspeed >= 0 ? '+' : '') + 
                   Math.round(details.deviations?.maxAirspeed || 0)} kt
                </span>
              </div>
              <div className={Math.abs(details.deviations?.maxBank || 0) <= 5 ? 'pass' : 'fail'}>
                <span className="label">Bank:</span>
                <span className="value">
                  {(details.deviations?.maxBank >= 0 ? '+' : '') + 
                   Math.round(details.deviations?.maxBank || 0)}° from 45°
                </span>
              </div>
              <div className={(details.deviations?.rolloutHeadingError || 0) <= 10 ? 'pass' : 'fail'}>
                <span className="label">Rollout:</span>
                <span className="value">{Math.round(details.deviations?.rolloutHeadingError || 0)}°</span>
              </div>
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
        </div>
      )}
    </div>
  )
}

