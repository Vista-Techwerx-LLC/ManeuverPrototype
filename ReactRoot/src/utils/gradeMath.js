export const GRADE_ORDER = [
  'A+','A','A-',
  'B+','B','B-',
  'C+','C','C-',
  'D+','D','D-',
  'F'
]

export function clampGrade(grade) {
  return GRADE_ORDER.includes(grade) ? grade : 'F'
}

export function applyPenalty(grade, steps) {
  const g = clampGrade(grade)
  const idx = GRADE_ORDER.indexOf(g)
  const nextIdx = Math.min(GRADE_ORDER.length - 1, idx + (steps || 0))
  return GRADE_ORDER[nextIdx]
}

export function absDev(value, target) {
  return Math.abs((value ?? 0) - (target ?? 0))
}

