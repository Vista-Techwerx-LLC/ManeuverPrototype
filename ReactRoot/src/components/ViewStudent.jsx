import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts'
import { getSteepTurnPassTolerances, SKILL_LEVELS } from '../utils/autoStartTolerances'
import { getGradeColorClass } from '../utils/steepTurnGrading'
import FlightPath3D from './FlightPath3D'
import ApproachPathReplay from './ApproachPathReplay'
import { hydrateRunway } from '../utils/runwayHelpers'
import { analyzeManeuversByType, findBestAttempt, generateReport, analyzeCommonMistakes, analyzeImprovementTrend } from '../utils/progressAnalysis'
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

function getGradeScore(grade) {
  const gradeMap = {
    'A+': 10, 'A': 9, 'A-': 8,
    'B+': 7, 'B': 6, 'B-': 5,
    'C+': 4, 'C': 3, 'C-': 2,
    'D+': 1, 'D': 0, 'F': -1,
    'PASS': 5, 'FAIL': 0
  }
  return gradeMap[grade] || 0
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
  const [skillLevelFilter, setSkillLevelFilter] = useState('all')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [reportDropdownOpen, setReportDropdownOpen] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [reportType, setReportType] = useState('all')
  const dropdownRef = useRef(null)
  const reportDropdownRef = useRef(null)

  useEffect(() => {
    if (studentId && user.id) {
      checkAccess()
      loadCustomRunways(user).then(setCustomRunways)
    }
  }, [user.id, studentId])

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false)
      }
      if (reportDropdownRef.current && !reportDropdownRef.current.contains(event.target)) {
        setReportDropdownOpen(false)
      }
    }

    if (dropdownOpen || reportDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [dropdownOpen, reportDropdownOpen])

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

  // Filter maneuvers by skill level
  const filteredManeuvers = maneuvers.filter(m => {
    if (skillLevelFilter === 'all') return true
    // Get skill level from maneuver - check both direct field and nested in result_data
    const maneuverSkillLevel = m.skill_level || m.result_data?.autoStart?.skillLevel || m.result_data?.skillLevel
    // Only include maneuvers that have a matching skill level (exclude null/undefined)
    return maneuverSkillLevel && maneuverSkillLevel === skillLevelFilter
  })

  // Organize by maneuver type
  const maneuversByType = analyzeManeuversByType(filteredManeuvers)

  // Find best attempts
  const bestSteepTurn = findBestAttempt(maneuversByType.steepTurns, 'steep_turn')
  const bestLanding = findBestAttempt(maneuversByType.landings, 'landing')

  // Generate report
  const report = generateReport(filteredManeuvers, reportType)

  // Prepare steep turn chart data
  const steepTurnChartData = maneuversByType.steepTurns
    .map((m, index) => ({
      id: m.id,
      attempt: maneuversByType.steepTurns.length - index,
      date: new Date(m.created_at).toLocaleDateString(),
      time: new Date(m.created_at).toLocaleTimeString(),
      grade: m.grade === 'PASS' ? 1 : 0,
      maxAltDev: Math.abs(m.result_data?.deviations?.maxAltitude || 0),
      maxSpdDev: Math.abs(m.result_data?.deviations?.maxAirspeed || 0),
      maxBankDev: Math.abs(m.result_data?.deviations?.maxBank || 0),
      rolloutError: m.result_data?.deviations?.rolloutHeadingError || 0,
      avgBank: m.result_data?.averages?.bank || 0,
      isBest: m.id === bestSteepTurn?.id
    }))
    .reverse()

  // Prepare landing chart data
  const landingChartData = maneuversByType.landings
    .map((m, index) => ({
      id: m.id,
      attempt: maneuversByType.landings.length - index,
      date: new Date(m.created_at).toLocaleDateString(),
      time: new Date(m.created_at).toLocaleTimeString(),
      grade: m.grade,
      gradeScore: getGradeScore(m.grade),
      maxAltDev: Math.abs(m.result_data?.maxDeviations?.altitude || 0),
      maxSpdDev: Math.abs(m.result_data?.maxDeviations?.speed || 0),
      maxBankDev: Math.abs(m.result_data?.maxDeviations?.bank || 0),
      maxPitchDev: Math.abs(m.result_data?.maxDeviations?.pitch || 0),
      lateralDev: Math.abs(m.result_data?.maxDeviations?.lateral || 0),
      touchdownVS: Math.abs(m.result_data?.touchdown?.verticalSpeed || 0),
      isBest: m.id === bestLanding?.id
    }))
    .reverse()

  const stats = {
    total: filteredManeuvers.length,
    passed: filteredManeuvers.filter(m => m.grade === 'PASS' || !['F', 'FAIL'].includes(m.grade)).length,
    failed: filteredManeuvers.filter(m => m.grade === 'FAIL' || m.grade === 'F').length,
    passRate: filteredManeuvers.length > 0 
      ? Math.round((filteredManeuvers.filter(m => m.grade === 'PASS' || !['F', 'FAIL'].includes(m.grade)).length / filteredManeuvers.length) * 100)
      : 0,
    steepTurns: maneuversByType.steepTurns.length,
    landings: maneuversByType.landings.length
  }

  // Always show all three skill levels
  const skillLevelOptions = [
    { value: 'all', label: 'All Skill Levels' },
    { value: SKILL_LEVELS.BEGINNER, label: 'Beginner' },
    { value: SKILL_LEVELS.NOVICE, label: 'Novice' },
    { value: SKILL_LEVELS.ACS, label: 'ACS' }
  ]

  const getSelectedLabel = () => {
    const option = skillLevelOptions.find(opt => opt.value === skillLevelFilter)
    return option ? option.label : 'All Skill Levels'
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

        <div className="skill-level-filter">
          <label>Filter by Skill Level:</label>
          <div className="runway-custom-dropdown" ref={dropdownRef}>
            <div
              className={`dropdown-selected ${dropdownOpen ? 'open' : ''}`}
              onClick={() => setDropdownOpen(!dropdownOpen)}
            >
              <div className="selected-info">
                <span className="selected-name">{getSelectedLabel()}</span>
              </div>
              <div className="dropdown-arrow">▼</div>
            </div>
            {dropdownOpen && (
              <div className="dropdown-options">
                {skillLevelOptions.map(option => (
                  <div
                    key={option.value}
                    className={`dropdown-option ${skillLevelFilter === option.value ? 'active' : ''}`}
                    onClick={() => {
                      setSkillLevelFilter(option.value)
                      setDropdownOpen(false)
                    }}
                  >
                    <div className="option-main">{option.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {skillLevelFilter !== 'all' && (
            <span className="filter-indicator">
              Showing {filteredManeuvers.length} of {maneuvers.length} maneuvers
            </span>
          )}
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
          <div className="stat-card">
            <div className="stat-value">{stats.steepTurns}</div>
            <div className="stat-label">Steep Turns</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.landings}</div>
            <div className="stat-label">Landings</div>
          </div>
        </div>

        {/* AI Performance Report */}
        <div className="dashboard-card ai-report-card">
          <div className="report-header">
            <div>
              <h2>🤖 AI Performance Analysis</h2>
              <p className="report-subtitle">Detailed breakdown and personalized recommendations</p>
            </div>
            <div className="report-controls">
              <div className="runway-custom-dropdown report-dropdown" ref={reportDropdownRef}>
                <div
                  className={`dropdown-selected ${reportDropdownOpen ? 'open' : ''}`}
                  onClick={() => setReportDropdownOpen(!reportDropdownOpen)}
                >
                  <div className="selected-info">
                    <span className="selected-name">{reportType === 'all' ? 'All Maneuvers' : 'Last 5 Maneuvers'}</span>
                  </div>
                  <div className="dropdown-arrow">▼</div>
                </div>
                {reportDropdownOpen && (
                  <div className="dropdown-options">
                    <div
                      className={`dropdown-option ${reportType === 'all' ? 'active' : ''}`}
                      onClick={() => {
                        setReportType('all')
                        setReportDropdownOpen(false)
                      }}
                    >
                      <div className="option-main">All Maneuvers</div>
                    </div>
                    <div
                      className={`dropdown-option ${reportType === 'last5' ? 'active' : ''}`}
                      onClick={() => {
                        setReportType('last5')
                        setReportDropdownOpen(false)
                      }}
                    >
                      <div className="option-main">Last 5 Maneuvers</div>
                    </div>
                  </div>
                )}
              </div>
              <div 
                className={`dropdown-selected report-toggle ${showReport ? 'open' : ''}`}
                onClick={() => setShowReport(!showReport)}
              >
                <div className="selected-info">
                  <span className="selected-name">{showReport ? 'Hide Report' : 'Show Detailed Analysis'}</span>
                </div>
                <div className="dropdown-arrow">▼</div>
              </div>
            </div>
          </div>
          
          {showReport && (
            <div className="report-content">
              {/* AI Summary */}
              <div className="ai-summary-section">
                <h3>📊 Overall Performance Summary</h3>
                <p className="ai-text">{report.summary.aiSummary}</p>
                <div className="report-grid">
                  <div className="report-item">
                    <span className="report-label">Total Attempts:</span>
                    <span className="report-value">{report.summary.totalAttempts}</span>
                  </div>
                  <div className="report-item">
                    <span className="report-label">Pass Rate:</span>
                    <span className="report-value">{report.summary.passRate}%</span>
                  </div>
                  <div className="report-item">
                    <span className="report-label">Steep Turns:</span>
                    <span className="report-value">{report.byManeuverType.steepTurns.total}</span>
                  </div>
                  <div className="report-item">
                    <span className="report-label">Landings:</span>
                    <span className="report-value">{report.byManeuverType.landings.total}</span>
                  </div>
                </div>
              </div>

              {/* Steep Turns AI Analysis */}
              {report.byManeuverType.steepTurns.total > 0 && report.byManeuverType.steepTurns.aiAnalysis && (
                <div className="ai-analysis-section">
                  <h3>🛩️ Steep Turns - AI Analysis</h3>
                  <p className="ai-text">{report.byManeuverType.steepTurns.aiAnalysis.overview}</p>
                  
                  {report.byManeuverType.steepTurns.aiAnalysis.strengths.length > 0 && (
                    <div className="strengths-section">
                      <h4>✅ Strengths</h4>
                      <ul className="analysis-list">
                        {report.byManeuverType.steepTurns.aiAnalysis.strengths.map((strength, idx) => (
                          <li key={idx} className="strength-item">{strength}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {report.byManeuverType.steepTurns.aiAnalysis.weaknesses.length > 0 && (
                    <div className="weaknesses-section">
                      <h4>⚠️ Areas for Improvement</h4>
                      <ul className="analysis-list">
                        {report.byManeuverType.steepTurns.aiAnalysis.weaknesses.map((weakness, idx) => (
                          <li key={idx} className="weakness-item">{weakness}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {report.byManeuverType.steepTurns.aiAnalysis.insights.length > 0 && (
                    <div className="insights-section">
                      <h4>💡 Key Insights</h4>
                      <ul className="analysis-list">
                        {report.byManeuverType.steepTurns.aiAnalysis.insights.map((insight, idx) => (
                          <li key={idx} className="insight-item">{insight}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {report.byManeuverType.steepTurns.recommendations && Array.isArray(report.byManeuverType.steepTurns.recommendations) && (
                    <div className="recommendations-section">
                      <h4>📚 Personalized Recommendations</h4>
                      {report.byManeuverType.steepTurns.recommendations.map((rec, idx) => (
                        <div key={idx} className="recommendation-category">
                          <h5>{rec.category} {rec.priority === 'high' && <span className="priority-badge high">HIGH PRIORITY</span>}</h5>
                          <ul className="tips-list">
                            {rec.tips.map((tip, tipIdx) => (
                              <li key={tipIdx}>{tip}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Landings AI Analysis */}
              {report.byManeuverType.landings.total > 0 && report.byManeuverType.landings.aiAnalysis && (
                <div className="ai-analysis-section">
                  <h3>🛬 Landings - AI Analysis</h3>
                  <p className="ai-text">{report.byManeuverType.landings.aiAnalysis.overview}</p>
                  
                  {report.byManeuverType.landings.aiAnalysis.strengths.length > 0 && (
                    <div className="strengths-section">
                      <h4>✅ Strengths</h4>
                      <ul className="analysis-list">
                        {report.byManeuverType.landings.aiAnalysis.strengths.map((strength, idx) => (
                          <li key={idx} className="strength-item">{strength}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {report.byManeuverType.landings.aiAnalysis.weaknesses.length > 0 && (
                    <div className="weaknesses-section">
                      <h4>⚠️ Areas for Improvement</h4>
                      <ul className="analysis-list">
                        {report.byManeuverType.landings.aiAnalysis.weaknesses.map((weakness, idx) => (
                          <li key={idx} className="weakness-item">{weakness}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {report.byManeuverType.landings.aiAnalysis.insights.length > 0 && (
                    <div className="insights-section">
                      <h4>💡 Key Insights</h4>
                      <ul className="analysis-list">
                        {report.byManeuverType.landings.aiAnalysis.insights.map((insight, idx) => (
                          <li key={idx} className="insight-item">{insight}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {report.byManeuverType.landings.recommendations && Array.isArray(report.byManeuverType.landings.recommendations) && (
                    <div className="recommendations-section">
                      <h4>📚 Personalized Recommendations</h4>
                      {report.byManeuverType.landings.recommendations.map((rec, idx) => (
                        <div key={idx} className="recommendation-category">
                          <h5>{rec.category} {rec.priority === 'high' && <span className="priority-badge high">HIGH PRIORITY</span>}</h5>
                          <ul className="tips-list">
                            {rec.tips.map((tip, tipIdx) => (
                              <li key={tipIdx}>{tip}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Steep Turns Section */}
        {steepTurnChartData.length > 0 && (
          <div className="maneuver-type-section">
            <div className="section-header">
              <h2>🛩️ Steep Turns Performance</h2>
              {bestSteepTurn && (
                <div className="best-attempt-badge">
                  ⭐ Best: Attempt #{steepTurnChartData.find(d => d.isBest)?.attempt} on {bestSteepTurn.created_at ? new Date(bestSteepTurn.created_at).toLocaleDateString() : 'N/A'}
                </div>
              )}
            </div>
            <div className="chart-section">
              <div className="chart-card">
                <h3>Pass/Fail Trend</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={steepTurnChartData}>
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
              <h3>Deviation Analysis</h3>
              <div className="charts-grid">
                <div className="chart-card">
                  <h4>Max Altitude Deviation</h4>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={steepTurnChartData}>
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
                  <h4>Max Airspeed Deviation</h4>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={steepTurnChartData}>
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
                  <h4>Rollout Heading Error</h4>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={steepTurnChartData}>
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
                  <h4>Average Bank Angle</h4>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={steepTurnChartData}>
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
          </div>
        )}

        {/* Landings Section */}
        {landingChartData.length > 0 && (
          <div className="maneuver-type-section">
            <div className="section-header">
              <h2>🛬 Landing Performance</h2>
              {bestLanding && (
                <div className="best-attempt-badge">
                  ⭐ Best: Grade {bestLanding.grade} on {bestLanding.created_at ? new Date(bestLanding.created_at).toLocaleDateString() : 'N/A'}
                </div>
              )}
            </div>
            <div className="chart-section">
              <div className="chart-card">
                <h3>Grade Progress</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={landingChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis 
                      dataKey="attempt" 
                      stroke="var(--text-muted)"
                      label={{ value: 'Attempt Number', position: 'insideBottom', offset: -5 }}
                    />
                    <YAxis 
                      stroke="var(--text-muted)"
                      domain={[-2, 11]}
                      ticks={[-1, 1, 4, 7, 10]}
                      allowDecimals={false}
                      interval={0}
                      tickFormatter={(value) => {
                        if (value === 10) return 'A'
                        if (value === 7) return 'B'
                        if (value === 4) return 'C'
                        if (value === 1) return 'D'
                        if (value === -1) return 'F'
                        return ''
                      }}
                      label={{ value: 'Grade', angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'var(--card)', 
                        border: '1px solid var(--border)',
                        borderRadius: '8px'
                      }}
                      formatter={(value, name, props) => {
                        if (name === 'gradeScore') {
                          return [props.payload.grade, 'Grade']
                        }
                        return [value, name]
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="gradeScore" 
                      stroke="var(--blue)" 
                      strokeWidth={2}
                      dot={(props) => {
                        const { cx, cy, payload } = props
                        return (
                          <circle
                            cx={cx}
                            cy={cy}
                            r={payload.isBest ? 8 : 4}
                            fill={payload.isBest ? 'var(--yellow)' : 'var(--blue)'}
                            stroke={payload.isBest ? 'var(--yellow)' : 'var(--blue)'}
                            strokeWidth={payload.isBest ? 3 : 2}
                          />
                        )
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="chart-section">
              <h3>Deviation Analysis</h3>
              <div className="charts-grid">
                <div className="chart-card">
                  <h4>Altitude Deviations</h4>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={landingChartData}>
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
                        name="Max Altitude Deviation"
                        fill="var(--blue)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="chart-card">
                  <h4>Speed Deviations</h4>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={landingChartData}>
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
                        name="Max Speed Deviation"
                        fill="var(--purple)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="chart-card">
                  <h4>Touchdown Vertical Speed</h4>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={landingChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="attempt" stroke="var(--text-muted)" />
                      <YAxis stroke="var(--text-muted)" label={{ value: 'fpm', angle: -90, position: 'insideLeft' }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'var(--card)', 
                          border: '1px solid var(--border)',
                          borderRadius: '8px'
                        }}
                        formatter={(value) => `${Math.round(value)} fpm`}
                      />
                      <Bar 
                        dataKey="touchdownVS" 
                        name="Touchdown VS"
                        fill="var(--green-bright)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="chart-card">
                  <h4>Bank Angle Deviations</h4>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={landingChartData}>
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
                        dataKey="maxBankDev" 
                        name="Max Bank Deviation"
                        fill="var(--yellow)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="maneuver-list-section">
          <h2>Recent Maneuvers</h2>
          {maneuvers.length === 0 ? (
            <div className="empty-state">
              <p>No maneuvers logged yet</p>
            </div>
          ) : (
            <div className="maneuver-list">
              {filteredManeuvers.slice(0, 10).map(maneuver => (
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
  const [selectedPhase, setSelectedPhase] = useState(null)
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
              {details.gradeDetails && (
                <div className="details-section">
                  <div className="grade-breakdown">
                    {details.gradeDetails.phaseGrades && Object.keys(details.gradeDetails.phaseGrades).length > 0 ? (
                      <>
                        <h3>Phase Grades</h3>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                          {Object.entries(details.gradeDetails.phaseGrades).map(([phase, grade]) => {
                            const phaseName = phase.charAt(0).toUpperCase() + phase.slice(1)
                            const isSelected = selectedPhase === phase
                            return (
                              <button
                                key={phase}
                                onClick={() => setSelectedPhase(isSelected ? null : phase)}
                                style={{
                                  padding: '8px 16px',
                                  borderRadius: '6px',
                                  border: `2px solid ${isSelected ? '#4CAF50' : 'rgba(255, 255, 255, 0.2)'}`,
                                  backgroundColor: isSelected ? 'rgba(76, 175, 80, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                                  color: '#fff',
                                  cursor: 'pointer',
                                  fontWeight: isSelected ? '600' : '400',
                                  transition: 'all 0.2s',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px'
                                }}
                                onMouseEnter={(e) => {
                                  if (!isSelected) {
                                    e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!isSelected) {
                                    e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'
                                  }
                                }}
                              >
                                <span>{phaseName}</span>
                                <span className={getGradeColorClass(grade)} style={{ fontWeight: '600' }}>
                                  {grade}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                        {selectedPhase && details.gradeDetails.breakdown?.[selectedPhase] && (
                          <div style={{ padding: '16px', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                            <h4 style={{ marginBottom: '12px', fontSize: '1.1em' }}>
                              {selectedPhase.charAt(0).toUpperCase() + selectedPhase.slice(1)} Breakdown
                            </h4>
                            <div className="breakdown-grid">
                              {Object.entries(details.gradeDetails.breakdown[selectedPhase]).map(([category, categoryGrade]) => {
                                const categoryNames = {
                                  altitude: 'Altitude',
                                  lateral: 'Lateral',
                                  speed: 'Speed',
                                  bank: 'Bank',
                                  pitch: 'Pitch'
                                }
                                const maxByPhase = details.gradeDetails.maxByPhase?.[selectedPhase]
                                let maxDeviation = null
                                let unit = ''
                                
                                if (maxByPhase) {
                                  if (category === 'altitude') {
                                    maxDeviation = maxByPhase.altitudeFt
                                    unit = 'ft'
                                  } else if (category === 'lateral') {
                                    maxDeviation = maxByPhase.lateralFt
                                    unit = 'ft'
                                  } else if (category === 'speed') {
                                    maxDeviation = maxByPhase.speedKt
                                    unit = 'kt'
                                  } else if (category === 'bank') {
                                    maxDeviation = maxByPhase.bankDeg
                                    unit = '°'
                                  } else if (category === 'pitch') {
                                    maxDeviation = maxByPhase.pitchDeg
                                    unit = '°'
                                  }
                                }
                                
                                return (
                                  <div key={category} className="breakdown-item">
                                    <span>{categoryNames[category] || category}:</span>
                                    <span>
                                      <span className={getGradeColorClass(categoryGrade)}>
                                        {categoryGrade}
                                      </span>
                                      {maxDeviation !== null && maxDeviation !== undefined && (
                                        <span style={{ marginLeft: '8px', fontSize: '0.9em', opacity: 0.8 }}>
                                          ({Math.round(maxDeviation)}{unit})
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </>
                    ) : details.gradeDetails.breakdown && (
                      <>
                        <h3>Grade Breakdown</h3>
                        <div className="breakdown-grid">
                          <div className="breakdown-item">
                            <span>Altitude:</span>
                            <span>
                              <span className={getGradeColorClass(details.gradeDetails.breakdown.altitude)}>
                                {details.gradeDetails.breakdown.altitude}
                              </span>
                              {details.maxDeviations?.altitude !== undefined && (
                                <span style={{ marginLeft: '8px', fontSize: '0.9em', opacity: 0.8 }}>
                                  ({(details.maxDeviations.altitude >= 0 ? '+' : '') + Math.round(details.maxDeviations.altitude)} ft)
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="breakdown-item">
                            <span>Speed:</span>
                            <span>
                              <span className={getGradeColorClass(details.gradeDetails.breakdown.speed)}>
                                {details.gradeDetails.breakdown.speed}
                              </span>
                              {details.maxDeviations?.speed !== undefined && (
                                <span style={{ marginLeft: '8px', fontSize: '0.9em', opacity: 0.8 }}>
                                  ({(details.maxDeviations.speed >= 0 ? '+' : '') + Math.round(details.maxDeviations.speed)} kt)
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="breakdown-item">
                            <span>Bank:</span>
                            <span>
                              <span className={getGradeColorClass(details.gradeDetails.breakdown.bank)}>
                                {details.gradeDetails.breakdown.bank}
                              </span>
                              {details.maxDeviations?.bank !== undefined && (
                                <span style={{ marginLeft: '8px', fontSize: '0.9em', opacity: 0.8 }}>
                                  ({(details.maxDeviations.bank >= 0 ? '+' : '') + Math.round(details.maxDeviations.bank)}°)
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="breakdown-item">
                            <span>Pitch:</span>
                            <span>
                              <span className={getGradeColorClass(details.gradeDetails.breakdown.pitch)}>
                                {details.gradeDetails.breakdown.pitch}
                              </span>
                              {details.maxDeviations?.pitch !== undefined && (
                                <span style={{ marginLeft: '8px', fontSize: '0.9em', opacity: 0.8 }}>
                                  ({(details.maxDeviations.pitch >= 0 ? '+' : '') + Math.round(details.maxDeviations.pitch)}°)
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                      </>
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
              {details.gradeDetails && (
                <div className="details-section">
                  <div className="grade-breakdown">
                    {details.gradeDetails.phaseGrades && Object.keys(details.gradeDetails.phaseGrades).length > 0 ? (
                      <>
                        <h3>Phase Grades</h3>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                          {Object.entries(details.gradeDetails.phaseGrades).map(([phase, grade]) => {
                            const phaseName = phase.charAt(0).toUpperCase() + phase.slice(1)
                            const isSelected = selectedPhase === phase
                            return (
                              <button
                                key={phase}
                                onClick={() => setSelectedPhase(isSelected ? null : phase)}
                                style={{
                                  padding: '8px 16px',
                                  borderRadius: '6px',
                                  border: `2px solid ${isSelected ? '#4CAF50' : 'rgba(255, 255, 255, 0.2)'}`,
                                  backgroundColor: isSelected ? 'rgba(76, 175, 80, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                                  color: '#fff',
                                  cursor: 'pointer',
                                  fontWeight: isSelected ? '600' : '400',
                                  transition: 'all 0.2s',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px'
                                }}
                                onMouseEnter={(e) => {
                                  if (!isSelected) {
                                    e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!isSelected) {
                                    e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'
                                  }
                                }}
                              >
                                <span>{phaseName}</span>
                                <span className={getGradeColorClass(grade)} style={{ fontWeight: '600' }}>
                                  {grade}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                        {selectedPhase && details.gradeDetails.breakdown?.[selectedPhase] && (
                          <div style={{ padding: '16px', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                            <h4 style={{ marginBottom: '12px', fontSize: '1.1em' }}>
                              {selectedPhase.charAt(0).toUpperCase() + selectedPhase.slice(1)} Breakdown
                            </h4>
                            <div className="breakdown-grid">
                              {Object.entries(details.gradeDetails.breakdown[selectedPhase]).map(([category, categoryGrade]) => {
                                const categoryNames = {
                                  altitude: 'Altitude',
                                  lateral: 'Lateral',
                                  speed: 'Speed',
                                  bank: 'Bank',
                                  pitch: 'Pitch'
                                }
                                const maxByPhase = details.gradeDetails.maxByPhase?.[selectedPhase]
                                let maxDeviation = null
                                let unit = ''
                                
                                if (maxByPhase) {
                                  if (category === 'altitude') {
                                    maxDeviation = maxByPhase.altitudeFt
                                    unit = 'ft'
                                  } else if (category === 'lateral') {
                                    maxDeviation = maxByPhase.lateralFt
                                    unit = 'ft'
                                  } else if (category === 'speed') {
                                    maxDeviation = maxByPhase.speedKt
                                    unit = 'kt'
                                  } else if (category === 'bank') {
                                    maxDeviation = maxByPhase.bankDeg
                                    unit = '°'
                                  } else if (category === 'pitch') {
                                    maxDeviation = maxByPhase.pitchDeg
                                    unit = '°'
                                  }
                                }
                                
                                return (
                                  <div key={category} className="breakdown-item">
                                    <span>{categoryNames[category] || category}:</span>
                                    <span>
                                      <span className={getGradeColorClass(categoryGrade)}>
                                        {categoryGrade}
                                      </span>
                                      {maxDeviation !== null && maxDeviation !== undefined && (
                                        <span style={{ marginLeft: '8px', fontSize: '0.9em', opacity: 0.8 }}>
                                          ({Math.round(maxDeviation)}{unit})
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </>
                    ) : details.gradeDetails.breakdown && (
                      <>
                        <h3>Grade Breakdown</h3>
                        <div className="breakdown-grid">
                          <div className="breakdown-item">
                            <span>Altitude:</span>
                            <span>
                              <span className={getGradeColorClass(details.gradeDetails.breakdown.altitude)}>
                                {details.gradeDetails.breakdown.altitude}
                              </span>
                              {details.maxDeviations?.altitude !== undefined && (
                                <span style={{ marginLeft: '8px', fontSize: '0.9em', opacity: 0.8 }}>
                                  ({(details.maxDeviations.altitude >= 0 ? '+' : '') + Math.round(details.maxDeviations.altitude)} ft)
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="breakdown-item">
                            <span>Lateral:</span>
                            <span>
                              <span className={getGradeColorClass(details.gradeDetails.breakdown.lateral)}>
                                {details.gradeDetails.breakdown.lateral}
                              </span>
                              {details.maxDeviations?.lateral !== undefined && (
                                <span style={{ marginLeft: '8px', fontSize: '0.9em', opacity: 0.8 }}>
                                  ({(details.maxDeviations.lateral >= 0 ? '+' : '') + Math.round(details.maxDeviations.lateral * 6076)} ft)
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="breakdown-item">
                            <span>Speed:</span>
                            <span>
                              <span className={getGradeColorClass(details.gradeDetails.breakdown.speed)}>
                                {details.gradeDetails.breakdown.speed}
                              </span>
                              {details.maxDeviations?.speed !== undefined && (
                                <span style={{ marginLeft: '8px', fontSize: '0.9em', opacity: 0.8 }}>
                                  ({(details.maxDeviations.speed >= 0 ? '+' : '') + Math.round(details.maxDeviations.speed)} kt)
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="breakdown-item">
                            <span>Bank:</span>
                            <span>
                              <span className={getGradeColorClass(details.gradeDetails.breakdown.bank)}>
                                {details.gradeDetails.breakdown.bank}
                              </span>
                              {details.maxDeviations?.bank !== undefined && (
                                <span style={{ marginLeft: '8px', fontSize: '0.9em', opacity: 0.8 }}>
                                  ({(details.maxDeviations.bank >= 0 ? '+' : '') + Math.round(details.maxDeviations.bank)}°)
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="breakdown-item">
                            <span>Pitch:</span>
                            <span>
                              <span className={getGradeColorClass(details.gradeDetails.breakdown.pitch)}>
                                {details.gradeDetails.breakdown.pitch}
                              </span>
                              {details.maxDeviations?.pitch !== undefined && (
                                <span style={{ marginLeft: '8px', fontSize: '0.9em', opacity: 0.8 }}>
                                  ({(details.maxDeviations.pitch >= 0 ? '+' : '') + Math.round(details.maxDeviations.pitch)}°)
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                      </>
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

