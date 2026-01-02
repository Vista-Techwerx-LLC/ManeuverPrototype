import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fetchSteepTurnFeedback, fetchPathFollowingFeedback } from '../lib/aiFeedback'
import FlightPath3D from './FlightPath3D'
import ApproachPathReplay from './ApproachPathReplay'
import { getSteepTurnPassTolerances, SKILL_LEVELS } from '../utils/autoStartTolerances'
import { getGradeColorClass } from '../utils/steepTurnGrading'
import { hydrateRunway } from '../utils/runwayHelpers'
import './History.css'

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

    // Convert database runways to format expected by the app
    return dbRunways?.map(r => r.runway_data) || []
  } catch (error) {
    console.error('Error loading custom runways:', error)
    return []
  }
}

function getManeuverGrade(maneuver) {
  const finalGrade = maneuver.result_data?.gradeDetails?.finalGrade
  if (finalGrade) {
    return finalGrade
  }
  if (maneuver.grade && (maneuver.grade !== 'PASS' && maneuver.grade !== 'FAIL')) {
    return maneuver.grade
  }
  return maneuver.grade === 'PASS' ? 'PASS' : 'FAIL'
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

function isFailGrade(grade) {
  if (!grade) return true
  const gradeUpper = grade.toUpperCase()
  return gradeUpper === 'FAIL' || gradeUpper === 'F' || gradeUpper.startsWith('D')
}

export default function History({ user }) {
  const [maneuvers, setManeuvers] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // 'all', 'pass', 'fail'
  const [customRunways, setCustomRunways] = useState([])

  useEffect(() => {
    loadManeuvers()
    loadCustomRunways(user).then(setCustomRunways)
  }, [user.id])

  async function loadManeuvers() {
    try {
      const { data, error } = await supabase
        .from('maneuver_results')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error loading maneuvers:', error)
        return
      }

      setManeuvers(data || [])
    } catch (error) {
      console.error('Error loading maneuvers:', error)
    } finally {
      setLoading(false)
    }
  }

  async function deleteManeuver(id) {
    if (!confirm('Delete this maneuver log?')) return

    try {
      const { error } = await supabase
        .from('maneuver_results')
        .delete()
        .eq('id', id)

      if (error) {
        console.error('Error deleting maneuver:', error)
        return
      }

      setManeuvers(prev => prev.filter(m => m.id !== id))
    } catch (error) {
      console.error('Error deleting maneuver:', error)
    }
  }

  const filteredManeuvers = maneuvers.filter(m => {
    const gradeText = getManeuverGrade(m)
    if (filter === 'all') return true
    if (filter === 'pass') return !isFailGrade(gradeText)
    if (filter === 'fail') return isFailGrade(gradeText)
    return true
  })

  const stats = {
    total: maneuvers.length,
    passed: maneuvers.filter(m => !isFailGrade(getManeuverGrade(m))).length,
    failed: maneuvers.filter(m => isFailGrade(getManeuverGrade(m))).length
  }

  if (loading) {
    return (
      <div className="history-page">
        <div className="history-container">
          <h1>Loading...</h1>
        </div>
      </div>
    )
  }

  return (
    <div className="history-page">
      <div className="history-container">
        <h1>Maneuver History</h1>
        <p className="subtitle">Review your past performance and track progress</p>

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
            <div className="stat-value">
              {stats.total > 0 ? Math.round((stats.passed / stats.total) * 100) : 0}%
            </div>
            <div className="stat-label">Pass Rate</div>
          </div>
        </div>

        <div className="filter-bar">
          <button 
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({maneuvers.length})
          </button>
          <button 
            className={`filter-btn ${filter === 'pass' ? 'active' : ''}`}
            onClick={() => setFilter('pass')}
          >
            Pass ({stats.passed})
          </button>
          <button 
            className={`filter-btn ${filter === 'fail' ? 'active' : ''}`}
            onClick={() => setFilter('fail')}
          >
            Fail ({stats.failed})
          </button>
        </div>

        {filteredManeuvers.length === 0 ? (
          <div className="empty-state">
            <p>No maneuvers logged yet.</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
              Complete a steep turn to see it here!
            </p>
          </div>
        ) : (
          <div className="maneuver-list">
            {filteredManeuvers.map(maneuver => (
              <ManeuverCard
                key={maneuver.id}
                maneuver={maneuver}
                onDelete={deleteManeuver}
                customRunways={customRunways}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
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

function ManeuverCard({ maneuver, onDelete, customRunways }) {
  const [expanded, setExpanded] = useState(false)
  const [aiFeedback, setAiFeedback] = useState('')
  const [aiFocus, setAiFocus] = useState('Altitude')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [showAllTips, setShowAllTips] = useState(false)
  const details = maneuver.result_data
  const gradeText = getManeuverGrade(maneuver)
  const isPassed = !isFailGrade(gradeText)
  const date = new Date(maneuver.created_at)
  const skillLevel = maneuver.skill_level
  const replayRunway = hydrateRunway(details?.runway, customRunways)

  useEffect(() => {
    if (expanded && details?.ai_feedback) {
      const feedback = details.ai_feedback
      const focusMatch = feedback.match(/^FOCUS:\s*(.+?)(?:\n|$)/i)
      if (focusMatch) {
        setAiFocus(focusMatch[1].trim())
        setAiFeedback(feedback.replace(/^FOCUS:\s*.+?\n/i, '').trim())
      } else {
        setAiFocus('Altitude')
        setAiFeedback(feedback)
      }
    } else if (expanded && !details?.ai_feedback) {
      setAiFeedback('')
      setAiFocus('Altitude')
      setAiError('')
    }
  }, [expanded, details?.ai_feedback])

  const formatSkillLevel = (level) => {
    if (!level) return null
    return level.charAt(0).toUpperCase() + level.slice(1)
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

    if (maneuver.maneuver_type !== 'steep_turn' && maneuver.maneuver_type !== 'landing' && maneuver.maneuver_type !== 'path_following') {
      setAiError('AI feedback is only available for steep turn and landing maneuvers')
      return
    }

    setAiLoading(true)
    setAiError('')

    try {
      let payload, result

      if (maneuver.maneuver_type === 'steep_turn') {
        payload = {
          grade: gradeText,
          gradeDetails: details.gradeDetails || null,
          details: {
            entry: details.entry,
            deviations: details.deviations,
            averages: details.averages,
            busted: details.busted,
            turnDirection: details.turnDirection,
            totalTurn: details.totalTurn,
            autoStart: details.autoStart,
            timestamp: details.timestamp
          }
        }

        result = await fetchSteepTurnFeedback({
          maneuver: payload,
          maneuverType: 'steep_turn',
          user: {
            id: maneuver.user_id,
            email: null
          }
        })
      } else if (maneuver.maneuver_type === 'landing' || maneuver.maneuver_type === 'path_following') {
        payload = {
          grade: gradeText,
          details: details
        }

        result = await fetchPathFollowingFeedback({
          maneuver: payload,
          maneuverType: maneuver.maneuver_type,
          user: {
            id: maneuver.user_id,
            email: null
          }
        })
      }
      
      if (typeof result === 'object' && result.focus && result.feedback) {
        setAiFocus(result.focus)
        setAiFeedback(result.feedback)
        const feedbackToSave = `FOCUS: ${result.focus}\n\n${result.feedback}`
        await updateManeuverWithFeedback(maneuver.id, feedbackToSave)
        if (details) {
          details.ai_feedback = feedbackToSave
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
        await updateManeuverWithFeedback(maneuver.id, feedbackText)
        if (details) {
          details.ai_feedback = feedbackText
        }
      }
    } catch (error) {
      setAiError(error.message || 'Unable to get AI feedback')
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div className={`maneuver-card ${getGradeColorClass(gradeText)}`}>
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
            <span className={`grade-text ${getGradeColorClass(gradeText)}`}>
              {gradeText}
            </span>
          </div>
      </div>

      {expanded && details && (
        <div className="maneuver-details">
          {(maneuver.maneuver_type === 'steep_turn' || maneuver.maneuver_type === 'landing' || maneuver.maneuver_type === 'path_following') && (
            <div className="details-section">
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
            </div>
          )}

          {maneuver.maneuver_type === 'steep_turn' && (
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
          )}

          {maneuver.maneuver_type === 'steep_turn' && (
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
          )}

          {maneuver.maneuver_type === 'steep_turn' && details.averages && (
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
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      ({(details.averages?.altitudeDeviation >= 0 ? '+' : '') +
                       Math.round(details.averages?.altitudeDeviation || 0)})
                    </span>
                  </span>
                </div>
                <div>
                  <span className="label">Airspeed:</span>
                  <span className="value">
                    {Math.round(details.averages?.airspeed || 0)} kt
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      ({(details.averages?.airspeedDeviation >= 0 ? '+' : '') +
                       Math.round(details.averages?.airspeedDeviation || 0)})
                    </span>
                  </span>
                </div>
                <div>
                  <span className="label">Direction:</span>
                  <span className="value">{details.turnDirection?.toUpperCase() || 'N/A'}</span>
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

          {(maneuver.maneuver_type === 'landing' || maneuver.maneuver_type === 'path_following') && (
            <>
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

              {maneuver.maneuver_type === 'path_following' && details.maxDeviations && (
                <div className="details-section">
                  <h3>Maximum Deviations</h3>
                  <div className="deviation-grid">
                    {details.maxDeviations.altitude !== undefined && (
                      <div className={Math.abs(details.maxDeviations.altitude) <= 100 ? 'pass' : 'fail'}>
                        <span className="label">Altitude:</span>
                        <span className="value">
                          {(details.maxDeviations.altitude >= 0 ? '+' : '') + Math.round(details.maxDeviations.altitude)} ft
                        </span>
                      </div>
                    )}
                    {details.maxDeviations.lateral !== undefined && (
                      <div className={Math.abs(details.maxDeviations.lateral) <= 50 ? 'pass' : 'fail'}>
                        <span className="label">Lateral:</span>
                        <span className="value">
                          {(details.maxDeviations.lateral >= 0 ? '+' : '') + Math.round(details.maxDeviations.lateral)} ft
                        </span>
                      </div>
                    )}
                    {details.maxDeviations.speed !== undefined && (
                      <div className={Math.abs(details.maxDeviations.speed) <= 10 ? 'pass' : 'fail'}>
                        <span className="label">Speed:</span>
                        <span className="value">
                          {(details.maxDeviations.speed >= 0 ? '+' : '') + Math.round(details.maxDeviations.speed)} kt
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {details.runway && (
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
                      <li key={idx} style={{color: 'var(--red)'}}>
                        {violation.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          <button className="delete-btn" onClick={() => onDelete(maneuver.id)}>
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

