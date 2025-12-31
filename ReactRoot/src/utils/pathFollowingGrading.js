// Path Following Grading System
// Grades deviations from reference path: altitude, lateral, speed, bank, pitch

const GRADING_THRESHOLDS = {
  acs: {
    altitude: { Aplus: 20, A: 40, Aminus: 60, Bplus: 80, B: 100, Bminus: 120, Cplus: 150, C: 180, Cminus: 220, Dplus: 250, D: 300, Dminus: 350 },
    lateral: { Aplus: 0.05, A: 0.1, Aminus: 0.15, Bplus: 0.2, B: 0.25, Bminus: 0.3, Cplus: 0.4, C: 0.5, Cminus: 0.6, Dplus: 0.7, D: 0.8, Dminus: 0.9 }, // NM
    speed: { Aplus: 2, A: 4, Aminus: 6, Bplus: 8, B: 10, Bminus: 12, Cplus: 15, C: 18, Cminus: 22, Dplus: 25, D: 30, Dminus: 35 }, // kt
    bank: { Aplus: 1, A: 2, Aminus: 3, Bplus: 4, B: 5, Bminus: 6, Cplus: 8, C: 10, Cminus: 12, Dplus: 15, D: 18, Dminus: 22 }, // degrees
    pitch: { Aplus: 0.5, A: 1, Aminus: 1.5, Bplus: 2, B: 2.5, Bminus: 3, Cplus: 4, C: 5, Cminus: 6, Dplus: 7, D: 8, Dminus: 10 } // degrees
  },
  novice: {
    altitude: { Aplus: 40, A: 80, Aminus: 120, Bplus: 160, B: 200, Bminus: 240, Cplus: 280, C: 320, Cminus: 360, Dplus: 400, D: 450, Dminus: 500 },
    lateral: { Aplus: 0.1, A: 0.2, Aminus: 0.3, Bplus: 0.4, B: 0.5, Bminus: 0.6, Cplus: 0.7, C: 0.8, Cminus: 1.0, Dplus: 1.2, D: 1.4, Dminus: 1.6 }, // NM
    speed: { Aplus: 4, A: 8, Aminus: 12, Bplus: 16, B: 20, Bminus: 24, Cplus: 28, C: 32, Cminus: 36, Dplus: 40, D: 45, Dminus: 50 }, // kt
    bank: { Aplus: 2, A: 4, Aminus: 6, Bplus: 8, B: 10, Bminus: 12, Cplus: 15, C: 18, Cminus: 22, Dplus: 25, D: 30, Dminus: 35 }, // degrees
    pitch: { Aplus: 1, A: 2, Aminus: 3, Bplus: 4, B: 5, Bminus: 6, Cplus: 8, C: 10, Cminus: 12, Dplus: 15, D: 18, Dminus: 22 } // degrees
  },
  beginner: {
    altitude: { Aplus: 150, A: 250, Aminus: 350, Bplus: 450, B: 550, Bminus: 650, Cplus: 750, C: 850, Cminus: 1000, Dplus: 1200, D: 1500, Dminus: 1800 },
    lateral: { Aplus: 0.3, A: 0.5, Aminus: 0.7, Bplus: 0.9, B: 1.2, Bminus: 1.5, Cplus: 1.8, C: 2.2, Cminus: 2.6, Dplus: 3.0, D: 3.5, Dminus: 4.0 }, // NM
    speed: { Aplus: 12, A: 18, Aminus: 24, Bplus: 30, B: 36, Bminus: 42, Cplus: 48, C: 54, Cminus: 60, Dplus: 70, D: 80, Dminus: 90 }, // kt
    bank: { Aplus: 6, A: 10, Aminus: 14, Bplus: 18, B: 22, Bminus: 26, Cplus: 30, C: 35, Cminus: 40, Dplus: 45, D: 50, Dminus: 55 }, // degrees
    pitch: { Aplus: 3, A: 5, Aminus: 7, Bplus: 9, B: 12, Bminus: 15, Cplus: 18, C: 22, Cminus: 26, Dplus: 30, D: 35, Dminus: 40 } // degrees
  }
}

function getThresholds(skillLevel) {
  const normalized = (skillLevel || 'acs').toLowerCase()
  if (normalized === 'acs') return GRADING_THRESHOLDS.acs
  if (normalized === 'novice') return GRADING_THRESHOLDS.novice
  if (normalized === 'beginner') return GRADING_THRESHOLDS.beginner
  return GRADING_THRESHOLDS.acs
}

export function gradeAltitude(maxAltDev, skillLevel = 'acs') {
  const thresholds = getThresholds(skillLevel)
  const t = thresholds.altitude
  const dev = Math.abs(maxAltDev)

  if (dev <= t.Aplus) return 'A+'
  if (dev <= t.A) return 'A'
  if (dev <= t.Aminus) return 'A-'
  if (dev <= t.Bplus) return 'B+'
  if (dev <= t.B) return 'B'
  if (dev <= t.Bminus) return 'B-'
  if (dev <= t.Cplus) return 'C+'
  if (dev <= t.C) return 'C'
  if (dev <= t.Cminus) return 'C-'
  if (dev <= t.Dplus) return 'D+'
  if (dev <= t.D) return 'D'
  if (dev <= t.Dminus) return 'D-'
  return 'F'
}

export function gradeLateral(maxLateralDev, skillLevel = 'acs') {
  const thresholds = getThresholds(skillLevel)
  const t = thresholds.lateral
  const dev = Math.abs(maxLateralDev)

  if (dev <= t.Aplus) return 'A+'
  if (dev <= t.A) return 'A'
  if (dev <= t.Aminus) return 'A-'
  if (dev <= t.Bplus) return 'B+'
  if (dev <= t.B) return 'B'
  if (dev <= t.Bminus) return 'B-'
  if (dev <= t.Cplus) return 'C+'
  if (dev <= t.C) return 'C'
  if (dev <= t.Cminus) return 'C-'
  if (dev <= t.Dplus) return 'D+'
  if (dev <= t.D) return 'D'
  if (dev <= t.Dminus) return 'D-'
  return 'F'
}

export function gradeSpeed(maxSpeedDev, skillLevel = 'acs') {
  const thresholds = getThresholds(skillLevel)
  const t = thresholds.speed
  const dev = Math.abs(maxSpeedDev)

  if (dev <= t.Aplus) return 'A+'
  if (dev <= t.A) return 'A'
  if (dev <= t.Aminus) return 'A-'
  if (dev <= t.Bplus) return 'B+'
  if (dev <= t.B) return 'B'
  if (dev <= t.Bminus) return 'B-'
  if (dev <= t.Cplus) return 'C+'
  if (dev <= t.C) return 'C'
  if (dev <= t.Cminus) return 'C-'
  if (dev <= t.Dplus) return 'D+'
  if (dev <= t.D) return 'D'
  if (dev <= t.Dminus) return 'D-'
  return 'F'
}

export function gradeBank(maxBankDev, skillLevel = 'acs') {
  const thresholds = getThresholds(skillLevel)
  const t = thresholds.bank
  const dev = Math.abs(maxBankDev)

  if (dev <= t.Aplus) return 'A+'
  if (dev <= t.A) return 'A'
  if (dev <= t.Aminus) return 'A-'
  if (dev <= t.Bplus) return 'B+'
  if (dev <= t.B) return 'B'
  if (dev <= t.Bminus) return 'B-'
  if (dev <= t.Cplus) return 'C+'
  if (dev <= t.C) return 'C'
  if (dev <= t.Cminus) return 'C-'
  if (dev <= t.Dplus) return 'D+'
  if (dev <= t.D) return 'D'
  if (dev <= t.Dminus) return 'D-'
  return 'F'
}

export function gradePitch(maxPitchDev, skillLevel = 'acs') {
  const thresholds = getThresholds(skillLevel)
  const t = thresholds.pitch
  const dev = Math.abs(maxPitchDev)

  if (dev <= t.Aplus) return 'A+'
  if (dev <= t.A) return 'A'
  if (dev <= t.Aminus) return 'A-'
  if (dev <= t.Bplus) return 'B+'
  if (dev <= t.B) return 'B'
  if (dev <= t.Bminus) return 'B-'
  if (dev <= t.Cplus) return 'C+'
  if (dev <= t.C) return 'C'
  if (dev <= t.Cminus) return 'C-'
  if (dev <= t.Dplus) return 'D+'
  if (dev <= t.D) return 'D'
  if (dev <= t.Dminus) return 'D-'
  return 'F'
}

// Convert letter grade to numeric value for comparison
function gradeToValue(grade) {
  const values = { 'A+': 13, 'A': 12, 'A-': 11, 'B+': 10, 'B': 9, 'B-': 8, 'C+': 7, 'C': 6, 'C-': 5, 'D+': 4, 'D': 3, 'D-': 2, 'F': 1 }
  return values[grade] || 1
}

// Get the worse (lower) grade
function worseGrade(grade1, grade2) {
  return gradeToValue(grade1) < gradeToValue(grade2) ? grade1 : grade2
}

// Cap grade at maximum allowed
export function capGrade(current, maxAllowed) {
  if (gradeToValue(current) > gradeToValue(maxAllowed)) {
    return maxAllowed
  }
  return current
}

export function gradePathFollowing({ maxAltDev, maxLateralDev, maxSpeedDev, maxBankDev, maxPitchDev, busted, skillLevel = 'acs' }) {
  const altDevAbs = Math.abs(maxAltDev ?? 0)
  const lateralDevAbs = Math.abs(maxLateralDev ?? 0)
  const speedDevAbs = Math.abs(maxSpeedDev ?? 0)
  const bankDevAbs = Math.abs(maxBankDev ?? 0)
  const pitchDevAbs = Math.abs(maxPitchDev ?? 0)

  const altGrade = gradeAltitude(altDevAbs, skillLevel)
  const lateralGrade = gradeLateral(lateralDevAbs, skillLevel)
  const speedGrade = gradeSpeed(speedDevAbs, skillLevel)
  const bankGrade = gradeBank(bankDevAbs, skillLevel)
  const pitchGrade = gradePitch(pitchDevAbs, skillLevel)

  // Final grade is the worst of all categories
  let finalGrade = worseGrade(altGrade, lateralGrade)
  finalGrade = worseGrade(finalGrade, speedGrade)
  finalGrade = worseGrade(finalGrade, bankGrade)
  finalGrade = worseGrade(finalGrade, pitchGrade)

  // Apply penalties for busted tolerances
  let bustCount = 0
  if (busted?.altitude) bustCount++
  if (busted?.lateral) bustCount++
  if (busted?.speed) bustCount++
  if (busted?.bank) bustCount++
  if (busted?.pitch) bustCount++

  // Penalties based on busted categories
  if (busted?.altitude || busted?.lateral) finalGrade = capGrade(finalGrade, 'C-')
  if (busted?.speed || busted?.bank || busted?.pitch) finalGrade = capGrade(finalGrade, 'D')
  if (bustCount >= 2) finalGrade = capGrade(finalGrade, 'D-')
  if (bustCount >= 3) finalGrade = 'F'

  return {
    finalGrade,
    breakdown: {
      altitude: altGrade,
      lateral: lateralGrade,
      speed: speedGrade,
      bank: bankGrade,
      pitch: pitchGrade
    },
    metrics: {
      maxAltDev: altDevAbs,
      maxLateralDev: lateralDevAbs,
      maxSpeedDev: speedDevAbs,
      maxBankDev: bankDevAbs,
      maxPitchDev: pitchDevAbs
    }
  }
}

