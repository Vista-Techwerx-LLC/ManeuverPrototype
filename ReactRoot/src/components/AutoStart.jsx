import { SKILL_LEVELS, MANEUVER_TYPES, AUTO_START_TOLERANCES } from '../utils/autoStartTolerances'
import './AutoStart.css'

export default function AutoStart({ enabled, skillLevel, onToggle, onSkillLevelChange, status, maneuverType = MANEUVER_TYPES.STEEP_TURN }) {
  const tolerances = AUTO_START_TOLERANCES[maneuverType]
  
  const getToleranceDisplay = (level) => {
    const tol = tolerances[level]
    if (maneuverType === MANEUVER_TYPES.STEEP_TURN) {
      return (
        <div className="tolerance-items">
          <div className="tolerance-item">
            <span className="tolerance-param">Bank Angle</span>
            <span className="tolerance-range">45° ±{tol.bank}°</span>
          </div>
        </div>
      )
    } else {
      return (
        <div className="tolerance-items">
          <div className="tolerance-item">
            <span className="tolerance-param">Altitude</span>
            <span className="tolerance-range">±{tol.altitude} ft</span>
          </div>
          <div className="tolerance-item">
            <span className="tolerance-param">Airspeed</span>
            <span className="tolerance-range">{tol.airspeed.min} to +{tol.airspeed.max} kt</span>
          </div>
          <div className="tolerance-item">
            <span className="tolerance-param">Heading</span>
            <span className="tolerance-range">±{tol.heading}°</span>
          </div>
          <div className="tolerance-item">
            <span className="tolerance-param">Bank</span>
            <span className="tolerance-range">±{tol.bank}°</span>
          </div>
        </div>
      )
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
      
      {enabled && (
        <>
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
              className={`skill-level-btn ${skillLevel === SKILL_LEVELS.PRO ? 'active' : ''}`}
              onClick={() => onSkillLevelChange(SKILL_LEVELS.PRO)}
            >
              Pro<br /><span style={{ whiteSpace: 'nowrap', fontSize: '9px' }}>(ACS Standards)</span>
            </button>
          </div>
          
          <div className="tolerance-info">
            <div className="tolerance-label">Auto-Start Tolerances</div>
            {getToleranceDisplay(skillLevel)}
          </div>
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

