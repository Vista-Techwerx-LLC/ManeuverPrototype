export const SKILL_LEVELS = {
  DEV: 'dev',
  BEGINNER: 'beginner',
  NOVICE: 'novice',
  PRO: 'pro'
}

export const MANEUVER_TYPES = {
  STEEP_TURN: 'steep_turn',
  SLOW_FLIGHT: 'slow_flight',
  LANDING: 'landing'
}

const STEEP_TURN_ACS_STANDARDS = {
  altitude: 100,
  airspeed: 10,
  bank: { target: 45, tolerance: 5 },
  rolloutHeading: 10
}

const SLOW_FLIGHT_ACS_STANDARDS = {
  altitude: 100,
  airspeed: { min: 0, max: 10 },
  heading: 10,
  bank: 10
}

export const AUTO_START_TOLERANCES = {
  [MANEUVER_TYPES.STEEP_TURN]: {
    [SKILL_LEVELS.DEV]: {
      bank: 45,
      establishmentThreshold: 15,
      passTolerances: {
        altitude: 100000,
        airspeed: 2000,
        bank: { min: 0, max: 180 },
        rolloutHeading: 90
      }
    },
    [SKILL_LEVELS.BEGINNER]: {
      bank: 20,
      establishmentThreshold: 25,
      passTolerances: {
        altitude: 200,
        airspeed: 20,
        bank: { min: 35, max: 55 },
        rolloutHeading: 20
      }
    },
    [SKILL_LEVELS.NOVICE]: {
      bank: 10,
      establishmentThreshold: 35,
      passTolerances: {
        altitude: 150,
        airspeed: 15,
        bank: { min: 35, max: 55 },
        rolloutHeading: 15
      }
    },
    [SKILL_LEVELS.PRO]: {
      bank: 5,
      establishmentThreshold: 40,
      passTolerances: {
        altitude: 100,
        airspeed: 10,
        bank: { min: 40, max: 50 },
        rolloutHeading: 10
      }
    }
  },
  [MANEUVER_TYPES.SLOW_FLIGHT]: {
    [SKILL_LEVELS.DEV]: {
      altitude: 2000,
      airspeed: { min: -50, max: 100 },
      heading: 90,
      bank: 45
    },
    [SKILL_LEVELS.BEGINNER]: {
      altitude: 500,
      airspeed: { min: -20, max: 30 },
      heading: 30,
      bank: 20
    },
    [SKILL_LEVELS.NOVICE]: {
      altitude: 250,
      airspeed: { min: -10, max: 20 },
      heading: 15,
      bank: 15
    },
    [SKILL_LEVELS.PRO]: {
      altitude: 150,
      airspeed: { min: -5, max: 12 },
      heading: 12,
      bank: 12
    }
  }
}

export function checkSteepTurnInRange(data, skillLevel) {
  if (!data) return false
  
  const tolerances = AUTO_START_TOLERANCES[MANEUVER_TYPES.STEEP_TURN][skillLevel]
  
  const bankAbs = Math.abs(data.bank_deg || 0)
  const bankDev = Math.abs(bankAbs - 45)
  
  const bankInRange = bankDev <= tolerances.bank
  
  return bankInRange
}

export function getSteepTurnEstablishmentThreshold(skillLevel) {
  const tolerances = AUTO_START_TOLERANCES[MANEUVER_TYPES.STEEP_TURN][skillLevel]
  return tolerances.establishmentThreshold || 40
}

export function getSteepTurnPassTolerances(skillLevel) {
  const tolerances = AUTO_START_TOLERANCES[MANEUVER_TYPES.STEEP_TURN][skillLevel]
  return tolerances.passTolerances || {
    altitude: 100,
    airspeed: 10,
    bank: { min: 40, max: 50 },
    rolloutHeading: 10
  }
}

export function checkSlowFlightInRange(data, entry, skillLevel) {
  if (!data || !entry) return false
  
  const tolerances = AUTO_START_TOLERANCES[MANEUVER_TYPES.SLOW_FLIGHT][skillLevel]
  
  const altDev = Math.abs((data.alt_ft || 0) - entry.alt)
  const spdDev = (data.ias_kt || 0) - entry.spd
  const hdgDev = Math.abs(normalizeAngle((data.hdg_true || 0) - entry.hdg))
  const bankAbs = Math.abs(data.bank_deg || 0)
  
  const altInRange = altDev <= tolerances.altitude
  const spdInRange = spdDev >= tolerances.airspeed.min && spdDev <= tolerances.airspeed.max
  const hdgInRange = hdgDev <= tolerances.heading
  const bankInRange = bankAbs <= tolerances.bank
  
  return altInRange && spdInRange && hdgInRange && bankInRange
}

function normalizeAngle(angle) {
  let normalized = angle
  while (normalized > 180) normalized -= 360
  while (normalized < -180) normalized += 360
  return normalized
}

