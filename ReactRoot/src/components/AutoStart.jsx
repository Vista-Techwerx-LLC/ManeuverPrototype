import { useState } from 'react'
import { SKILL_LEVELS } from '../utils/autoStartTolerances'
import './AutoStart.css'

export default function AutoStart({ enabled, skillLevel, onToggle, onSkillLevelChange, status }) {
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
        
        {enabled && (
          <select
            className="skill-level-select"
            value={skillLevel}
            onChange={(e) => onSkillLevelChange(e.target.value)}
          >
            <option value={SKILL_LEVELS.BEGINNER}>Beginner</option>
            <option value={SKILL_LEVELS.NOVICE}>Novice</option>
            <option value={SKILL_LEVELS.PRO}>Pro</option>
          </select>
        )}
      </div>
      
      {enabled && status && (
        <div className={`auto-start-status ${status.type}`}>
          {status.message}
        </div>
      )}
    </div>
  )
}

