import { applyPenalty } from './gradeMath'
import {
  SEVERITY,
  severityFinalAltitude,
  severityFinalLateral,
  severityFinalSpeed,
  severityFinalBank,
  severityThresholdAltitude,
  severityThresholdSpeed,
  severityThresholdSink
} from './landingSeverity'

const PHASE_BASE_STEPS = {
  FINAL: 1,
  THRESHOLD: 2,
  ROLLOUT: 0
}

const SEVERITY_STEPS = {
  0: 0,
  1: 1,
  2: 2,
  3: 3
}

function severityName(level) {
  if (level === 1) return 'mild'
  if (level === 2) return 'moderate'
  if (level === 3) return 'severe'
  return 'none'
}

export function computeLandingPenalty({
  finalMetrics,
  thresholdMetrics,
  busting
}) {
  let steps = 0
  const reasons = []

  if (finalMetrics) {
    const finalBustsBySeverity = {}

    if (finalMetrics.altDevAbs != null) {
      const sev = severityFinalAltitude(finalMetrics.altDevAbs)
      if (sev > 0) {
        const s = PHASE_BASE_STEPS.FINAL + SEVERITY_STEPS[sev]
        steps += s
        const severityText = severityName(sev)
        const severityCapitalized = severityText.charAt(0).toUpperCase() + severityText.slice(1)
        if (!finalBustsBySeverity[sev]) {
          finalBustsBySeverity[sev] = { metrics: [], steps: 0, severityText: severityCapitalized }
        }
        finalBustsBySeverity[sev].metrics.push('Altitude')
        finalBustsBySeverity[sev].steps += s
      }
    }

    if (finalMetrics.lateralDevAbsNm != null) {
      const sev = severityFinalLateral(finalMetrics.lateralDevAbsNm)
      if (sev > 0) {
        const s = PHASE_BASE_STEPS.FINAL + SEVERITY_STEPS[sev]
        steps += s
        const severityText = severityName(sev)
        const severityCapitalized = severityText.charAt(0).toUpperCase() + severityText.slice(1)
        if (!finalBustsBySeverity[sev]) {
          finalBustsBySeverity[sev] = { metrics: [], steps: 0, severityText: severityCapitalized }
        }
        finalBustsBySeverity[sev].metrics.push('Lateral')
        finalBustsBySeverity[sev].steps += s
      }
    }

    if (finalMetrics.speedDevAbsKt != null) {
      const sev = severityFinalSpeed(finalMetrics.speedDevAbsKt)
      if (sev > 0) {
        const s = PHASE_BASE_STEPS.FINAL + SEVERITY_STEPS[sev]
        steps += s
        const severityText = severityName(sev)
        const severityCapitalized = severityText.charAt(0).toUpperCase() + severityText.slice(1)
        if (!finalBustsBySeverity[sev]) {
          finalBustsBySeverity[sev] = { metrics: [], steps: 0, severityText: severityCapitalized }
        }
        finalBustsBySeverity[sev].metrics.push('Speed')
        finalBustsBySeverity[sev].steps += s
      }
    }

    if (finalMetrics.bankAbsDeg != null) {
      const sev = severityFinalBank(finalMetrics.bankAbsDeg)
      if (sev > 0) {
        const s = PHASE_BASE_STEPS.FINAL + SEVERITY_STEPS[sev]
        steps += s
        const severityText = severityName(sev)
        const severityCapitalized = severityText.charAt(0).toUpperCase() + severityText.slice(1)
        if (!finalBustsBySeverity[sev]) {
          finalBustsBySeverity[sev] = { metrics: [], steps: 0, severityText: severityCapitalized }
        }
        finalBustsBySeverity[sev].metrics.push('Bank')
        finalBustsBySeverity[sev].steps += s
      }
    }

    Object.keys(finalBustsBySeverity).sort((a, b) => b - a).forEach(sev => {
      const bust = finalBustsBySeverity[sev]
      const metricsText = bust.metrics.length === 1 
        ? bust.metrics[0]
        : bust.metrics.slice(0, -1).join(', ') + ' and ' + bust.metrics[bust.metrics.length - 1]
      reasons.push(`${bust.severityText} ${metricsText} bust in Final Phase: -${bust.steps} grade step${bust.steps !== 1 ? 's' : ''}`)
    })
  }

  if (thresholdMetrics) {
    const thresholdBustsBySeverity = {}

    if (thresholdMetrics.altDevAbs != null) {
      const sev = severityThresholdAltitude(thresholdMetrics.altDevAbs)
      if (sev > 0) {
        const s = PHASE_BASE_STEPS.THRESHOLD + SEVERITY_STEPS[sev]
        steps += s
        const severityText = severityName(sev)
        const severityCapitalized = severityText.charAt(0).toUpperCase() + severityText.slice(1)
        if (!thresholdBustsBySeverity[sev]) {
          thresholdBustsBySeverity[sev] = { metrics: [], steps: 0, severityText: severityCapitalized }
        }
        thresholdBustsBySeverity[sev].metrics.push('Altitude')
        thresholdBustsBySeverity[sev].steps += s
      }
    }
    if (thresholdMetrics.speedDevAbsKt != null) {
      const sev = severityThresholdSpeed(thresholdMetrics.speedDevAbsKt)
      if (sev > 0) {
        const s = PHASE_BASE_STEPS.THRESHOLD + SEVERITY_STEPS[sev]
        steps += s
        const severityText = severityName(sev)
        const severityCapitalized = severityText.charAt(0).toUpperCase() + severityText.slice(1)
        if (!thresholdBustsBySeverity[sev]) {
          thresholdBustsBySeverity[sev] = { metrics: [], steps: 0, severityText: severityCapitalized }
        }
        thresholdBustsBySeverity[sev].metrics.push('Speed')
        thresholdBustsBySeverity[sev].steps += s
      }
    }
    if (thresholdMetrics.vsAbsFpm != null) {
      const sev = severityThresholdSink(thresholdMetrics.vsAbsFpm)
      if (sev > 0) {
        const s = PHASE_BASE_STEPS.THRESHOLD + SEVERITY_STEPS[sev]
        steps += s
        const severityText = severityName(sev)
        const severityCapitalized = severityText.charAt(0).toUpperCase() + severityText.slice(1)
        if (!thresholdBustsBySeverity[sev]) {
          thresholdBustsBySeverity[sev] = { metrics: [], steps: 0, severityText: severityCapitalized }
        }
        thresholdBustsBySeverity[sev].metrics.push('Vertical Speed')
        thresholdBustsBySeverity[sev].steps += s
      }
    }

    Object.keys(thresholdBustsBySeverity).sort((a, b) => b - a).forEach(sev => {
      const bust = thresholdBustsBySeverity[sev]
      const metricsText = bust.metrics.length === 1 
        ? bust.metrics[0]
        : bust.metrics.slice(0, -1).join(', ') + ' and ' + bust.metrics[bust.metrics.length - 1]
      reasons.push(`${bust.severityText} ${metricsText} bust in Threshold Phase: -${bust.steps} grade step${bust.steps !== 1 ? 's' : ''}`)
    })
  }

  if (thresholdMetrics?.dangerous === true) {
    return { steps: 999, reasons: [...reasons, 'Dangerous touchdown parameters detected'] }
  }

  return { steps, reasons }
}

