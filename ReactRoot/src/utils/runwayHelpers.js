import { JKA_AIRPORT } from './landingStandards'

export function hydrateRunway(runwayReference, customRunways = []) {
  if (!runwayReference) return null

  if (runwayReference.threshold && runwayReference.oppositeEnd) {
    return runwayReference
  }

  const runwayId = typeof runwayReference === 'string'
    ? runwayReference
    : runwayReference?.id

  if (!runwayId) return null

  if (runwayId === '27') {
    return JKA_AIRPORT.runway27
  }

  const custom = customRunways.find(r => r.id === runwayId)
  if (custom) {
    return {
      heading: custom.heading,
      threshold: custom.threshold,
      oppositeEnd: custom.oppositeEnd,
      length: custom.length,
      width: custom.width || 100
    }
  }

  return null
}

