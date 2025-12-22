import { SKILL_LEVELS, MANEUVER_TYPES, AUTO_START_TOLERANCES } from '../utils/autoStartTolerances'
import './AutoStart.css'

export default function AutoStart({ enabled, skillLevel, onToggle, onSkillLevelChange, status, maneuverType = MANEUVER_TYPES.STEEP_TURN }) {
  const tolerances = AUTO_START_TOLERANCES[maneuverType]
  
  const getToleranceItems = (level) => {
    const tol = tolerances[level]
    if (maneuverType === MANEUVER_TYPES.STEEP_TURN) {
      return [
        { label: 'Bank Angle', value: `45° ±${tol.bank}°` }
      ]
    } else {
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
      
      {enabled && (
        <>
          <div className="skill-level-selector">
            <button
              className={`skill-level-btn ${skillLevel === SKILL_LEVELS.DEV ? 'active' : ''}`}
              onClick={() => onSkillLevelChange(SKILL_LEVELS.DEV)}
            >
              Dev
            </button>
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
              Pro
            </button>
          </div>
          
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

