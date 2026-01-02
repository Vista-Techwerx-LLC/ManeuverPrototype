export function computePhaseBusting(samples, isBadFn, opts = {}) {
  const { minPercent = 0.2, minConsecutive = 4 } = opts
  if (!samples || samples.length === 0) return { isBusted: false, percentBad: 0, maxConsecutiveBad: 0 }

  let badCount = 0
  let maxConsec = 0
  let consec = 0

  for (const s of samples) {
    const bad = isBadFn(s)
    if (bad) {
      badCount++
      consec++
      maxConsec = Math.max(maxConsec, consec)
    } else {
      consec = 0
    }
  }

  const percentBad = badCount / samples.length
  const isBusted = percentBad >= minPercent || maxConsec >= minConsecutive

  return { isBusted, percentBad, maxConsecutiveBad: maxConsec }
}

