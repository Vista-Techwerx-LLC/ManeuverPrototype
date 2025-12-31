import { SKILL_LEVELS, MANEUVER_TYPES, AUTO_START_TOLERANCES } from '../utils/autoStartTolerances'
import './AutoStart.css'

export default function AutoStart({ enabled, skillLevel, onToggle, onSkillLevelChange, status, maneuverType = MANEUVER_TYPES.STEEP_TURN }) {
  const tolerances = AUTO_START_TOLERANCES[maneuverType] || {}
  
  const getToleranceItems = (level) => {
    const tol = tolerances[level]
    if (maneuverType === MANEUVER_TYPES.STEEP_TURN) {
      return [
        { label: 'Bank Angle', value: `45° ±${tol.bank}°` }
      ]
    } else {
      if (maneuverType === MANEUVER_TYPES.LANDING) {
        const entryRadius = (tol?.entryRadiusNm ?? 0.3).toFixed(2)
        return [
          { label: 'Entry Radius', value: `${entryRadius} NM` }        ]
      }
      return [
        { label: 'Altitude', value: `±${tol.altitude} ft` },
        { label: 'Airspeed', value: `${tol.airspeed.min} to +${tol.airspeed.max} kt` },
        { label: 'Heading', value: `±${tol.heading}°` },
        { label: 'Bank Angle', value: `±${tol.bank}°` }
      ]
    }
  }

  return (
    <div className="auto-start-container">
      <div className="auto-start-header">
        <label className="auto-start-toggle">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <span className="toggle-slider"></span>
          <span className="toggle-label">Auto-Start</span>
        </label>
      </div>
      
      {maneuverType !== MANEUVER_TYPES.LANDING && (
        <div className="skill-level-selector">
          <button
            className={`skill-level-btn ${skillLevel === SKILL_LEVELS.BEGINNER ? 'active' : ''}`}
            onClick={() => onSkillLevelChange(SKILL_LEVELS.BEGINNER)}
          >
            Beginner
          </button>
          <button
            className={`skill-level-btn ${skillLevel === SKILL_LEVELS.NOVICE ? 'active' : ''}`}
            onClick={() => onSkillLevelChange(SKILL_LEVELS.NOVICE)}
          >
            Novice
          </button>
          <button
            className={`skill-level-btn ${skillLevel === SKILL_LEVELS.ACS ? 'active' : ''}`}
            onClick={() => onSkillLevelChange(SKILL_LEVELS.ACS)}
          >
            ACS
          </button>
        </div>
      )}
      
      {enabled && (
        <>
          {maneuverType === MANEUVER_TYPES.LANDING ? (
            <div className="tolerance-info">
              <div className="tolerance-header">
                <span className="tolerance-title">Auto-Start Active</span>
              </div>
              <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text)', fontSize: '14px', lineHeight: '1.5' }}>
                Fly to the landing path and tracking will start automatically when you're within approach range and on the flight path.
              </div>
            </div>
          ) : (
            <div className="tolerance-info">
              <div className="tolerance-header">
                <span className="tolerance-title">Auto-Start Tolerances</span>
              </div>
              <div className="tolerance-items">
                {getToleranceItems(skillLevel).map((item, index) => (
                  <div key={index} className="tolerance-item">
                    <span className="tolerance-item-label">{item.label}</span>
                    <span className="tolerance-item-value">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      
      {enabled && status && (
        <div className={`auto-start-status ${status.type}`}>
          {status.message}
        </div>
      )}
    </div>
  )
}

