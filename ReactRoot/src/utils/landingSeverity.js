export const SEVERITY = {
  NONE: 0,
  MILD: 1,
  MODERATE: 2,
  SEVERE: 3
}

export function classifySeverity(devAbs, bustLimit, mildRatio=1.0, moderateRatio=1.5, severeRatio=2.5) {
  if (devAbs == null || bustLimit == null || bustLimit === 0) return SEVERITY.NONE
  const r = devAbs / bustLimit
  if (r < mildRatio) return SEVERITY.NONE
  if (r < moderateRatio) return SEVERITY.MILD
  if (r < severeRatio) return SEVERITY.MODERATE
  return SEVERITY.SEVERE
}

export function severityFinalAltitude(altDevAbs) {
  return classifySeverity(altDevAbs, 100, 1.0, 1.5, 2.5)
}

export function severityFinalLateral(lateralDevAbsNm) {
  return classifySeverity(lateralDevAbsNm, 0.1, 1.0, 1.5, 2.5)
}

export function severityFinalSpeed(speedDevAbsKt) {
  return classifySeverity(speedDevAbsKt, 10, 1.0, 1.5, 2.5)
}

export function severityFinalBank(bankAbsDeg) {
  return classifySeverity(bankAbsDeg, 25, 1.0, 1.25, 1.6)
}

export function severityThresholdAltitude(altDevAbsFt) {
  return classifySeverity(altDevAbsFt, 50, 1.0, 1.4, 2.0)
}

export function severityThresholdSpeed(speedDevAbsKt) {
  return classifySeverity(speedDevAbsKt, 5, 1.0, 1.4, 2.0)
}

export function severityThresholdSink(vsAbsFpm) {
  return classifySeverity(vsAbsFpm, 300, 1.0, 1.3, 1.8)
}

