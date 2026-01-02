import { applyPenalty } from './gradeMath'
import { computeLandingPenalty } from './landingPenalty'

export const GRADE_ORDER = ["A+","A","A-","B+","B","B-","C+","C","C-","D+","D","D-","F"]

export const PHASE_WEIGHTS = {
  downwind: 0.10,
  base: 0.20,
  final: 0.50,
  threshold: 0.20
}

export const METRIC_WEIGHTS = {
  lateral: 0.35,
  altitude: 0.30,
  speed: 0.20,
  bank: 0.10,
  pitch: 0.05
}

export const ACS_THRESHOLDS = {
  downwind: {
    altitude: { "A+":50,"A":75,"A-":100,"B+":150,"B":200,"B-":250,"C+":300,"C":350,"C-":400,"D+":450,"D":500,"D-":600,"F":Infinity },
    lateral:  { "A+":400,"A":600,"A-":800,"B+":1000,"B":1300,"B-":1600,"C+":1900,"C":2200,"C-":2600,"D+":3000,"D":3500,"D-":4000,"F":Infinity },
    speed:    { "A+":5,"A":7,"A-":10,"B+":12,"B":15,"B-":18,"C+":20,"C":22,"C-":25,"D+":28,"D":30,"D-":35,"F":Infinity },
    bank:     { "A+":15,"A":20,"A-":25,"B+":30,"B":35,"B-":40,"C+":45,"C":50,"C-":55,"D+":60,"D":65,"D-":70,"F":Infinity },
    pitch:    { "A+":3,"A":4,"A-":5,"B+":6,"B":7,"B-":8,"C+":9,"C":10,"C-":12,"D+":14,"D":16,"D-":18,"F":Infinity }
  },
  base: {
    altitude: { "A+":60,"A":90,"A-":120,"B+":160,"B":200,"B-":250,"C+":300,"C":350,"C-":400,"D+":500,"D":600,"D-":700,"F":Infinity },
    lateral:  { "A+":350,"A":500,"A-":700,"B+":900,"B":1100,"B-":1400,"C+":1700,"C":2000,"C-":2400,"D+":2800,"D":3300,"D-":3800,"F":Infinity },
    speed:    { "A+":5,"A":7,"A-":10,"B+":12,"B":15,"B-":18,"C+":20,"C":22,"C-":25,"D+":28,"D":30,"D-":35,"F":Infinity },
    bank:     { "A+":20,"A":25,"A-":30,"B+":35,"B":40,"B-":45,"C+":50,"C":55,"C-":60,"D+":65,"D":70,"D-":75,"F":Infinity },
    pitch:    { "A+":3,"A":4,"A-":5,"B+":6,"B":7,"B-":8,"C+":9,"C":10,"C-":12,"D+":14,"D":16,"D-":18,"F":Infinity }
  },
  final: {
    altitude: { "A+":50,"A":75,"A-":100,"B+":125,"B":150,"B-":175,"C+":200,"C":250,"C-":300,"D+":350,"D":400,"D-":450,"F":Infinity },
    lateral:  { "A+":150,"A":250,"A-":350,"B+":450,"B":600,"B-":750,"C+":900,"C":1100,"C-":1400,"D+":1700,"D":2000,"D-":2300,"F":Infinity },
    speed:    { "A+":3,"A":5,"A-":7,"B+":8,"B":10,"B-":12,"C+":15,"C":18,"C-":20,"D+":22,"D":25,"D-":28,"F":Infinity },
    bank:     { "A+":10,"A":12,"A-":15,"B+":18,"B":20,"B-":22,"C+":25,"C":28,"C-":30,"D+":33,"D":35,"D-":38,"F":Infinity },
    pitch:    { "A+":3,"A":4,"A-":5,"B+":6,"B":7,"B-":8,"C+":9,"C":10,"C-":12,"D+":14,"D":16,"D-":18,"F":Infinity }
  },
  threshold: {
    altitude: { "A+":20,"A":30,"A-":40,"B+":60,"B":80,"B-":100,"C+":120,"C":150,"C-":180,"D+":220,"D":250,"D-":300,"F":Infinity },
    lateral:  { "A+":50,"A":80,"A-":120,"B+":160,"B":220,"B-":300,"C+":380,"C":500,"C-":650,"D+":800,"D":1000,"D-":1200,"F":Infinity },
    speed:    { "A+":2,"A":3,"A-":4,"B+":5,"B":6,"B-":7,"C+":8,"C":10,"C-":12,"D+":14,"D":16,"D-":18,"F":Infinity },
    bank:     { "A+":5,"A":7,"A-":10,"B+":12,"B":15,"B-":18,"C+":20,"C":22,"C-":25,"D+":28,"D":30,"D-":35,"F":Infinity },
    pitch:    { "A+":2,"A":3,"A-":4,"B+":5,"B":6,"B-":7,"C+":8,"C":9,"C-":10,"D+":12,"D":14,"D-":16,"F":Infinity }
  }
}

export const SKILL_MULTIPLIERS = {
  acs:      { altitude:1.0, lateral:1.0, speed:1.0, bank:1.0, pitch:1.0 },
  novice:   { altitude:1.5, lateral:1.5, speed:1.4, bank:1.2, pitch:1.3 },
  beginner: { altitude:2.5, lateral:2.5, speed:2.0, bank:1.5, pitch:1.8 }
}

function getThreshold(phase, metric, grade, skillLevel = 'acs') {
  const normalizedSkill = (skillLevel || 'acs').toLowerCase()
  const multiplier = SKILL_MULTIPLIERS[normalizedSkill]?.[metric] || 1.0
  const baseThreshold = ACS_THRESHOLDS[phase]?.[metric]?.[grade]
  if (baseThreshold === undefined) return Infinity
  return baseThreshold * multiplier
}

export function gradeFromThresholds(value, thresholdsByGrade) {
  for (const grade of GRADE_ORDER) {
    if (value <= thresholdsByGrade[grade]) return grade
  }
  return "F"
}

export function gradeIndex(grade) {
  return GRADE_ORDER.indexOf(grade)
}

export function worseGrade(grade1, grade2) {
  if (!grade1) return grade2
  if (!grade2) return grade1
  return gradeIndex(grade1) > gradeIndex(grade2) ? grade1 : grade2
}

export function capGrade(current, maxAllowed) {
  return worseGrade(current, maxAllowed)
}

const GRADE_TO_POINTS = {
  "A+": 12, "A": 11, "A-": 10,
  "B+": 9, "B": 8, "B-": 7,
  "C+": 6, "C": 5, "C-": 4,
  "D+": 3, "D": 2, "D-": 1,
  "F": 0
}

const POINTS_TO_GRADE = {
  12: "A+", 11: "A", 10: "A-",
  9: "B+", 8: "B", 7: "B-",
  6: "C+", 5: "C", 4: "C-",
  3: "D+", 2: "D", 1: "D-",
  0: "F"
}

function pointsToGrade(points) {
  const rounded = Math.round(points)
  if (rounded >= 12) return "A+"
  if (rounded >= 11) return "A"
  if (rounded >= 10) return "A-"
  if (rounded >= 9) return "B+"
  if (rounded >= 8) return "B"
  if (rounded >= 7) return "B-"
  if (rounded >= 6) return "C+"
  if (rounded >= 5) return "C"
  if (rounded >= 4) return "C-"
  if (rounded >= 3) return "D+"
  if (rounded >= 2) return "D"
  if (rounded >= 1) return "D-"
  return "F"
}

function gradePhase(phaseSamples, phase, skillLevel = 'acs') {
  if (!phaseSamples || phaseSamples.length < 5) {
    return null
  }

  let maxAltFt = 0
  let maxLatFt = 0
  let maxSpdKt = 0
  let maxBankDeg = 0
  let maxPitchDeg = 0
  
  let maxAltFtSigned = 0
  let maxLatFtSigned = 0
  let maxSpdKtSigned = 0
  let maxPitchDegSigned = 0

  phaseSamples.forEach(sample => {
    const altAbs = Math.abs(sample.altDev || 0)
    const latAbs = Math.abs((sample.lateralDev || 0) * 6076)
    const spdAbs = Math.abs(sample.speedDev || 0)
    const pitchAbs = sample.pitchAbs || 0
    
    if (altAbs > maxAltFt) {
      maxAltFt = altAbs
      maxAltFtSigned = sample.altDev || 0
    }
    if (latAbs > maxLatFt) {
      maxLatFt = latAbs
      maxLatFtSigned = (sample.lateralDev || 0) * 6076
    }
    if (spdAbs > maxSpdKt) {
      maxSpdKt = spdAbs
      maxSpdKtSigned = sample.speedDev || 0
    }
    if (sample.bankAbs > maxBankDeg) {
      maxBankDeg = sample.bankAbs || 0
    }
    if (pitchAbs > maxPitchDeg) {
      maxPitchDeg = pitchAbs
      maxPitchDegSigned = sample.pitchDev || 0
    }
  })

  const thresholds = {
    altitude: {},
    lateral: {},
    speed: {},
    bank: {},
    pitch: {}
  }

  GRADE_ORDER.forEach(grade => {
    thresholds.altitude[grade] = getThreshold(phase, 'altitude', grade, skillLevel)
    thresholds.lateral[grade] = getThreshold(phase, 'lateral', grade, skillLevel)
    thresholds.speed[grade] = getThreshold(phase, 'speed', grade, skillLevel)
    thresholds.bank[grade] = getThreshold(phase, 'bank', grade, skillLevel)
    thresholds.pitch[grade] = getThreshold(phase, 'pitch', grade, skillLevel)
  })

  const altGrade = gradeFromThresholds(maxAltFt, thresholds.altitude)
  const latGrade = gradeFromThresholds(maxLatFt, thresholds.lateral)
  const spdGrade = gradeFromThresholds(maxSpdKt, thresholds.speed)
  const bankGrade = gradeFromThresholds(maxBankDeg, thresholds.bank)
  const pitchGrade = gradeFromThresholds(maxPitchDeg, thresholds.pitch)

  const altPoints = GRADE_TO_POINTS[altGrade] || 0
  const latPoints = GRADE_TO_POINTS[latGrade] || 0
  const spdPoints = GRADE_TO_POINTS[spdGrade] || 0
  const bankPoints = GRADE_TO_POINTS[bankGrade] || 0
  const pitchPoints = GRADE_TO_POINTS[pitchGrade] || 0

  const phasePoints = 
    altPoints * METRIC_WEIGHTS.altitude +
    latPoints * METRIC_WEIGHTS.lateral +
    spdPoints * METRIC_WEIGHTS.speed +
    bankPoints * METRIC_WEIGHTS.bank +
    pitchPoints * METRIC_WEIGHTS.pitch

  const phaseGrade = pointsToGrade(phasePoints)

  return {
    grade: phaseGrade,
    breakdown: {
      altitude: altGrade,
      lateral: latGrade,
      speed: spdGrade,
      bank: bankGrade,
      pitch: pitchGrade
    },
    maxMetrics: {
      altitudeFt: maxAltFt,
      lateralFt: maxLatFt,
      speedKt: maxSpdKt,
      bankDeg: maxBankDeg,
      pitchDeg: maxPitchDeg
    },
    maxMetricsSigned: {
      altitudeFt: maxAltFtSigned,
      lateralFt: maxLatFtSigned,
      speedKt: maxSpdKtSigned,
      pitchDeg: maxPitchDegSigned
    },
    points: phasePoints
  }
}

export function gradeLandingPathPhaseBased({ samples, skillLevel = 'acs', runway }) {
  if (!samples || samples.length === 0) {
    return {
      finalGrade: "F",
      phaseGrades: {},
      breakdown: {},
      maxByPhase: {},
      bust: { final: false, threshold: false },
      notes: ["No samples collected"]
    }
  }

  const phaseMap = {
    'downwind': [],
    'base': [],
    'final': [],
    'threshold': []
  }

  samples.forEach(sample => {
    let phase = sample.phase
    if (phase) {
      phase = phase.toLowerCase()
      if (phaseMap[phase]) {
        phaseMap[phase].push(sample)
      }
    }
  })

  const phaseResults = {}
  const phaseGrades = {}
  const breakdown = {}
  const maxByPhase = {}

  Object.keys(phaseMap).forEach(phase => {
    const phaseData = gradePhase(phaseMap[phase], phase, skillLevel)
    if (phaseData) {
      phaseResults[phase] = phaseData
      phaseGrades[phase] = phaseData.grade
      breakdown[phase] = phaseData.breakdown
      maxByPhase[phase] = {
        ...phaseData.maxMetrics,
        ...phaseData.maxMetricsSigned
      }
    }
  })

  const presentPhases = Object.keys(phaseResults)
  if (presentPhases.length === 0) {
    return {
      finalGrade: "F",
      phaseGrades: {},
      breakdown: {},
      maxByPhase: {},
      bust: { final: false, threshold: false },
      notes: ["No valid phase data collected"]
    }
  }

  let totalWeight = 0
  let weightedPoints = 0

  presentPhases.forEach(phase => {
    const weight = PHASE_WEIGHTS[phase] || 0
    totalWeight += weight
    weightedPoints += phaseResults[phase].points * weight
  })

  const normalizedPoints = totalWeight > 0 ? weightedPoints / totalWeight : 0
  const baseFinalGrade = pointsToGrade(normalizedPoints)

  const bust = {
    final: false,
    threshold: false
  }
  const notes = []

  let finalMetrics = null
  let thresholdMetrics = null

  if (phaseResults.final) {
    const final = phaseResults.final.maxMetrics
    const finalSigned = phaseResults.final.maxMetricsSigned || {}
    
    if (final.altitudeFt > 400 || final.lateralFt > 2127 || final.speedKt > 20 || final.bankDeg > 35) {
      bust.final = true
    }

    finalMetrics = {
      altDevAbs: final.altitudeFt,
      lateralDevAbsNm: (final.lateralFt || 0) / 6076,
      speedDevAbsKt: final.speedKt,
      bankAbsDeg: final.bankDeg
    }
  }

  if (phaseResults.threshold) {
    const threshold = phaseResults.threshold.maxMetrics
    
    if (threshold.altitudeFt > 200 || threshold.lateralFt > 600 || threshold.speedKt > 15 || threshold.bankDeg > 25) {
      bust.threshold = true
    }

    thresholdMetrics = {
      altDevAbs: threshold.altitudeFt,
      speedDevAbsKt: threshold.speedKt,
      vsAbsFpm: null
    }
  }

  const penalty = computeLandingPenalty({
    finalMetrics,
    thresholdMetrics,
    busting: null
  })

  let finalGrade = baseFinalGrade
  if (penalty.steps > 0) {
    finalGrade = applyPenalty(baseFinalGrade, penalty.steps)
    notes.push(...penalty.reasons)
  }

  return {
    finalGrade,
    baseFinalGrade,
    phaseGrades,
    breakdown,
    maxByPhase,
    bust,
    notes,
    penaltySteps: penalty.steps,
    penaltyReasons: penalty.reasons
  }
}

