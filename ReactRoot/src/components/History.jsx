import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import './History.css'

export default function History({ user }) {
  const [maneuvers, setManeuvers] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // 'all', 'pass', 'fail'

  useEffect(() => {
    loadManeuvers()
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
    if (filter === 'all') return true
    if (filter === 'pass') return m.grade === 'PASS'
    if (filter === 'fail') return m.grade === 'FAIL'
    return true
  })

  const stats = {
    total: maneuvers.length,
    passed: maneuvers.filter(m => m.grade === 'PASS').length,
    failed: maneuvers.filter(m => m.grade === 'FAIL').length
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
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ManeuverCard({ maneuver, onDelete }) {
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

          <button className="delete-btn" onClick={() => onDelete(maneuver.id)}>
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

