export const TARGET_BANK = 45
export const GRADE_ORDER = [
  'A+','A','A-',
  'B+','B','B-',
  'C+','C','C-',
  'D+','D','D-',
  'F'
]

export function getGradeColorClass(grade) {
  if (!grade) return ''
  
  const gradeUpper = grade.toUpperCase()
  
  if (gradeUpper.startsWith('A') || gradeUpper.startsWith('B')) {
    return 'grade-green'
  }
  
  if (gradeUpper.startsWith('C')) {
    return 'grade-yellow'
  }
  
  if (gradeUpper.startsWith('D') || gradeUpper === 'F') {
    return 'grade-red'
  }
  
  return ''
}

export function worseGrade(a, b) {
  if (!a) return b
  if (!b) return a
  return GRADE_ORDER.indexOf(a) > GRADE_ORDER.indexOf(b) ? a : b
}

export function capGrade(current, maxAllowed) {
  return worseGrade(current, maxAllowed)
}

const GRADING_THRESHOLDS = {
  pro: {
    bank: {
      Aplus: { avgError: 0.5, maxDev: 1 },
      A: { avgError: 1, maxDev: 2 },
      Aminus: { avgError: 2, maxDev: 3 },
      Bplus: { avgError: 3, maxDev: 4 },
      B: { avgError: 4, maxDev: 5 },
      Bminus: { avgError: 5, maxDev: 6 },
      Cplus: { avgError: 6, maxDev: 7 },
      C: { avgError: 7, maxDev: 8 },
      Cminus: { avgError: 8, maxDev: 9 },
      Dplus: { avgError: 9, maxDev: 10 },
      D: { avgError: 10, maxDev: 12 },
      Dminus: { avgError: 12, maxDev: 15 }
    },
    altitude: { Aplus: 10, A: 20, Aminus: 30, Bplus: 40, B: 50, Bminus: 60, Cplus: 80, C: 100, Cminus: 120, Dplus: 150, D: 200, Dminus: 250 },
    airspeed: { Aplus: 1, A: 2, Aminus: 3, Bplus: 4, B: 5, Bminus: 6, Cplus: 8, C: 10, Cminus: 12, Dplus: 15, D: 20, Dminus: 25 }
  },
  novice: {
    bank: {
      Aplus: { avgError: 1, maxDev: 2 },
      A: { avgError: 2, maxDev: 4 },
      Aminus: { avgError: 3, maxDev: 6 },
      Bplus: { avgError: 5, maxDev: 8 },
      B: { avgError: 7, maxDev: 10 },
      Bminus: { avgError: 9, maxDev: 12 },
      Cplus: { avgError: 12, maxDev: 15 },
      C: { avgError: 15, maxDev: 18 },
      Cminus: { avgError: 18, maxDev: 22 },
      Dplus: { avgError: 22, maxDev: 25 },
      D: { avgError: 25, maxDev: 30 },
      Dminus: { avgError: 30, maxDev: 35 }
    },
    altitude: { Aplus: 20, A: 40, Aminus: 60, Bplus: 80, B: 100, Bminus: 120, Cplus: 150, C: 180, Cminus: 220, Dplus: 250, D: 300, Dminus: 350 },
    airspeed: { Aplus: 2, A: 4, Aminus: 6, Bplus: 8, B: 10, Bminus: 12, Cplus: 15, C: 18, Cminus: 22, Dplus: 25, D: 30, Dminus: 35 }
  },
  beginner: {
    bank: {
      Aplus: { avgError: 2, maxDev: 4 },
      A: { avgError: 4, maxDev: 8 },
      Aminus: { avgError: 6, maxDev: 12 },
      Bplus: { avgError: 10, maxDev: 15 },
      B: { avgError: 15, maxDev: 20 },
      Bminus: { avgError: 20, maxDev: 25 },
      Cplus: { avgError: 25, maxDev: 30 },
      C: { avgError: 30, maxDev: 35 },
      Cminus: { avgError: 35, maxDev: 40 },
      Dplus: { avgError: 40, maxDev: 45 },
      D: { avgError: 45, maxDev: 50 },
      Dminus: { avgError: 50, maxDev: 55 }
    },
    altitude: { Aplus: 40, A: 80, Aminus: 120, Bplus: 160, B: 200, Bminus: 240, Cplus: 280, C: 320, Cminus: 360, Dplus: 400, D: 450, Dminus: 500 },
    airspeed: { Aplus: 4, A: 8, Aminus: 12, Bplus: 16, B: 20, Bminus: 24, Cplus: 28, C: 32, Cminus: 36, Dplus: 40, D: 45, Dminus: 50 }
  }
}

function getThresholds(skillLevel) {
  const normalized = (skillLevel || 'pro').toLowerCase()
  if (normalized === 'pro') return GRADING_THRESHOLDS.pro
  if (normalized === 'novice') return GRADING_THRESHOLDS.novice
  if (normalized === 'beginner') return GRADING_THRESHOLDS.beginner
  return GRADING_THRESHOLDS.pro
}

export function gradeBank(avgBankError, maxBankDev, skillLevel = 'pro') {
  const thresholds = getThresholds(skillLevel)
  const t = thresholds.bank

  if (avgBankError <= t.Aplus.avgError && maxBankDev <= t.Aplus.maxDev) return 'A+'
  if (avgBankError <= t.A.avgError && maxBankDev <= t.A.maxDev) return 'A'
  if (avgBankError <= t.Aminus.avgError && maxBankDev <= t.Aminus.maxDev) return 'A-'

  if (avgBankError <= t.Bplus.avgError && maxBankDev <= t.Bplus.maxDev) return 'B+'
  if (avgBankError <= t.B.avgError && maxBankDev <= t.B.maxDev) return 'B'
  if (avgBankError <= t.Bminus.avgError && maxBankDev <= t.Bminus.maxDev) return 'B-'

  if (avgBankError <= t.Cplus.avgError && maxBankDev <= t.Cplus.maxDev) return 'C+'
  if (avgBankError <= t.C.avgError && maxBankDev <= t.C.maxDev) return 'C'
  if (avgBankError <= t.Cminus.avgError && maxBankDev <= t.Cminus.maxDev) return 'C-'

  if (avgBankError <= t.Dplus.avgError && maxBankDev <= t.Dplus.maxDev) return 'D+'
  if (avgBankError <= t.D.avgError && maxBankDev <= t.D.maxDev) return 'D'
  if (avgBankError <= t.Dminus.avgError && maxBankDev <= t.Dminus.maxDev) return 'D-'

  return 'F'
}

export function gradeAltitude(maxAltDev, skillLevel = 'pro') {
  const thresholds = getThresholds(skillLevel)
  const t = thresholds.altitude

  if (maxAltDev <= t.Aplus) return 'A+'
  if (maxAltDev <= t.A) return 'A'
  if (maxAltDev <= t.Aminus) return 'A-'

  if (maxAltDev <= t.Bplus) return 'B+'
  if (maxAltDev <= t.B) return 'B'
  if (maxAltDev <= t.Bminus) return 'B-'

  if (maxAltDev <= t.Cplus) return 'C+'
  if (maxAltDev <= t.C) return 'C'
  if (maxAltDev <= t.Cminus) return 'C-'

  if (maxAltDev <= t.Dplus) return 'D+'
  if (maxAltDev <= t.D) return 'D'
  if (maxAltDev <= t.Dminus) return 'D-'

  return 'F'
}

export function gradeAirspeed(maxSpdDev, skillLevel = 'pro') {
  const thresholds = getThresholds(skillLevel)
  const t = thresholds.airspeed

  if (maxSpdDev <= t.Aplus) return 'A+'
  if (maxSpdDev <= t.A) return 'A'
  if (maxSpdDev <= t.Aminus) return 'A-'

  if (maxSpdDev <= t.Bplus) return 'B+'
  if (maxSpdDev <= t.B) return 'B'
  if (maxSpdDev <= t.Bminus) return 'B-'

  if (maxSpdDev <= t.Cplus) return 'C+'
  if (maxSpdDev <= t.C) return 'C'
  if (maxSpdDev <= t.Cminus) return 'C-'

  if (maxSpdDev <= t.Dplus) return 'D+'
  if (maxSpdDev <= t.D) return 'D'
  if (maxSpdDev <= t.Dminus) return 'D-'

  return 'F'
}

export function gradeSteepTurn({ avgBank, maxBankDev, maxAltDev, maxSpdDev, busted, skillLevel = 'pro' }) {
  const avgBankError = Math.abs(avgBank - TARGET_BANK)
  const bankDevAbs = Math.abs(maxBankDev ?? 0)
  const altDevAbs = Math.abs(maxAltDev ?? 0)
  const spdDevAbs = Math.abs(maxSpdDev ?? 0)

  const bankGrade = gradeBank(avgBankError, bankDevAbs, skillLevel)
  const altGrade = gradeAltitude(altDevAbs, skillLevel)
  const spdGrade = gradeAirspeed(spdDevAbs, skillLevel)

  let finalGrade = worseGrade(bankGrade, altGrade)
  finalGrade = worseGrade(finalGrade, spdGrade)

  let bustCount = 0
  if (busted?.alt) bustCount++
  if (busted?.spd) bustCount++
  if (busted?.bank) bustCount++

  if (busted?.alt || busted?.spd) finalGrade = capGrade(finalGrade, 'C-')
  if (busted?.bank) finalGrade = capGrade(finalGrade, 'D')
  if (bustCount >= 2) finalGrade = 'F'

  return {
    finalGrade,
    breakdown: {
      bank: bankGrade,
      alt: altGrade,
      spd: spdGrade
    },
    metrics: {
      avgBankError,
      maxBankDev: bankDevAbs,
      maxAltDev: altDevAbs,
      maxSpdDev: spdDevAbs
    }
  }
}

