// Progress Analysis and Report Generation Utilities

export function analyzeManeuversByType(maneuvers) {
  const steepTurns = maneuvers.filter(m => m.maneuver_type === 'steep_turn')
  const landings = maneuvers.filter(m => m.maneuver_type === 'landing' || m.maneuver_type === 'path_following')
  const slowFlight = maneuvers.filter(m => m.maneuver_type === 'slow_flight')

  return {
    steepTurns,
    landings,
    slowFlight,
    all: maneuvers
  }
}

export function findBestAttempt(maneuvers, maneuverType) {
  const filtered = maneuvers.filter(m => {
    if (maneuverType === 'landing') {
      return m.maneuver_type === 'landing' || m.maneuver_type === 'path_following'
    }
    return m.maneuver_type === maneuverType
  })

  if (filtered.length === 0) return null

  // For steep turns: lowest total deviation
  if (maneuverType === 'steep_turn') {
    return filtered.reduce((best, current) => {
      const currentScore = calculateSteepTurnScore(current)
      const bestScore = calculateSteepTurnScore(best)
      return currentScore < bestScore ? current : best
    })
  }

  // For landings: best grade (A+ > A > B+ etc) or lowest deviation if same grade
  if (maneuverType === 'landing') {
    return filtered.reduce((best, current) => {
      const currentGradeScore = gradeToScore(current.grade)
      const bestGradeScore = gradeToScore(best.grade)
      
      if (currentGradeScore > bestGradeScore) return current
      if (currentGradeScore < bestGradeScore) return best
      
      // Same grade, compare total deviations
      const currentDevScore = calculateLandingDeviationScore(current)
      const bestDevScore = calculateLandingDeviationScore(best)
      return currentDevScore < bestDevScore ? current : best
    })
  }

  return null
}

function calculateSteepTurnScore(maneuver) {
  const data = maneuver.result_data
  if (!data?.deviations) return Infinity

  const altDev = Math.abs(data.deviations.maxAltitude || 0)
  const spdDev = Math.abs(data.deviations.maxAirspeed || 0)
  const bankDev = Math.abs(data.deviations.maxBank || 0)
  const rolloutDev = data.deviations.rolloutHeadingError || 0

  // Weighted score
  return altDev * 1.0 + spdDev * 2.0 + bankDev * 1.5 + rolloutDev * 2.0
}

function calculateLandingDeviationScore(maneuver) {
  const data = maneuver.result_data
  if (!data?.maxDeviations) return Infinity

  const altDev = Math.abs(data.maxDeviations.altitude || 0)
  const spdDev = Math.abs(data.maxDeviations.speed || 0)
  const bankDev = Math.abs(data.maxDeviations.bank || 0)
  const pitchDev = Math.abs(data.maxDeviations.pitch || 0)

  return altDev * 1.0 + spdDev * 2.0 + bankDev * 1.5 + pitchDev * 1.5
}

function gradeToScore(grade) {
  const gradeMap = {
    'A+': 10, 'A': 9, 'A-': 8,
    'B+': 7, 'B': 6, 'B-': 5,
    'C+': 4, 'C': 3, 'C-': 2,
    'D+': 1, 'D': 0, 'F': -1,
    'PASS': 5, 'FAIL': 0
  }
  return gradeMap[grade] || 0
}

export function analyzeCommonMistakes(maneuvers, limit = 5) {
  const violationsMap = new Map()

  // Collect all violations
  maneuvers.forEach(maneuver => {
    const violations = maneuver.result_data?.violations || []
    violations.forEach(violation => {
      const text = typeof violation === 'string' ? violation : violation.violation
      if (text) {
        violationsMap.set(text, (violationsMap.get(text) || 0) + 1)
      }
    })
  })

  // Sort by frequency and return top N
  return Array.from(violationsMap.entries())
    .map(([violation, count]) => ({ violation, count, percentage: (count / maneuvers.length) * 100 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

export function analyzeImprovementTrend(maneuvers, maneuverType) {
  const filtered = maneuvers.filter(m => {
    if (maneuverType === 'landing') {
      return m.maneuver_type === 'landing' || m.maneuver_type === 'path_following'
    }
    return m.maneuver_type === maneuverType
  }).reverse() // Chronological order

  if (filtered.length < 3) {
    return { trend: 'insufficient_data', message: 'Need at least 3 attempts to analyze trend' }
  }

  const scores = filtered.map(m => {
    if (maneuverType === 'steep_turn') {
      return calculateSteepTurnScore(m)
    } else if (maneuverType === 'landing') {
      const gradeScore = gradeToScore(m.grade)
      const devScore = calculateLandingDeviationScore(m)
      return gradeScore * 100 - devScore // Higher grade = better, lower deviation = better
    }
    return 0
  })

  // Calculate trend using linear regression
  const n = scores.length
  const sumX = (n * (n + 1)) / 2
  const sumY = scores.reduce((sum, score) => sum + score, 0)
  const sumXY = scores.reduce((sum, score, i) => sum + (i + 1) * score, 0)
  const sumX2 = (n * (n + 1) * (2 * n + 1)) / 6

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)

  // For steep turns, lower score is better, so negative slope = improving
  // For landings, higher score is better, so positive slope = improving
  if (maneuverType === 'steep_turn') {
    if (slope < -5) return { trend: 'improving', message: 'Significant improvement in performance', slope }
    if (slope < -1) return { trend: 'slight_improvement', message: 'Gradual improvement', slope }
    if (slope > 5) return { trend: 'declining', message: 'Performance declining', slope }
    if (slope > 1) return { trend: 'slight_decline', message: 'Minor decline in performance', slope }
    return { trend: 'stable', message: 'Performance is stable', slope }
  } else {
    if (slope > 10) return { trend: 'improving', message: 'Significant improvement in performance', slope }
    if (slope > 2) return { trend: 'slight_improvement', message: 'Gradual improvement', slope }
    if (slope < -10) return { trend: 'declining', message: 'Performance declining', slope }
    if (slope < -2) return { trend: 'slight_decline', message: 'Minor decline in performance', slope }
    return { trend: 'stable', message: 'Performance is stable', slope }
  }
}

export function generateReport(maneuvers, reportType = 'all') {
  const maneuversToAnalyze = reportType === 'last5' 
    ? maneuvers.slice(0, 5) 
    : maneuvers

  const byType = analyzeManeuversByType(maneuversToAnalyze)
  
  const report = {
    summary: {
      totalAttempts: maneuversToAnalyze.length,
      passCount: maneuversToAnalyze.filter(m => m.grade === 'PASS' || !['F', 'FAIL'].includes(m.grade)).length,
      failCount: maneuversToAnalyze.filter(m => m.grade === 'FAIL' || m.grade === 'F').length,
      passRate: maneuversToAnalyze.length > 0
        ? Math.round((maneuversToAnalyze.filter(m => m.grade === 'PASS' || !['F', 'FAIL'].includes(m.grade)).length / maneuversToAnalyze.length) * 100)
        : 0,
      aiSummary: generateAISummary(maneuversToAnalyze, byType)
    },
    byManeuverType: {
      steepTurns: {
        total: byType.steepTurns.length,
        passed: byType.steepTurns.filter(m => m.grade === 'PASS').length,
        bestAttempt: findBestAttempt(byType.steepTurns, 'steep_turn'),
        commonMistakes: analyzeCommonMistakes(byType.steepTurns, 3),
        trend: analyzeImprovementTrend(byType.steepTurns, 'steep_turn'),
        aiAnalysis: generateSteepTurnAIAnalysis(byType.steepTurns),
        recommendations: generateSteepTurnRecommendations(byType.steepTurns)
      },
      landings: {
        total: byType.landings.length,
        passed: byType.landings.filter(m => !['F', 'FAIL'].includes(m.grade)).length,
        bestAttempt: findBestAttempt(byType.landings, 'landing'),
        commonMistakes: analyzeCommonMistakes(byType.landings, 3),
        trend: analyzeImprovementTrend(byType.landings, 'landing'),
        averageGrade: calculateAverageGrade(byType.landings),
        aiAnalysis: generateLandingAIAnalysis(byType.landings),
        recommendations: generateLandingRecommendations(byType.landings)
      }
    },
    overallMistakes: analyzeCommonMistakes(maneuversToAnalyze, 5),
    reportType,
    generatedAt: new Date().toISOString()
  }

  return report
}

function generateAISummary(maneuvers, byType) {
  if (maneuvers.length === 0) {
    return "No maneuvers have been logged yet. Start practicing to build your flight performance history!"
  }

  const passRate = maneuvers.length > 0
    ? Math.round((maneuvers.filter(m => m.grade === 'PASS' || !['F', 'FAIL'].includes(m.grade)).length / maneuvers.length) * 100)
    : 0

  let summary = `Based on ${maneuvers.length} maneuver${maneuvers.length !== 1 ? 's' : ''} analyzed, `

  if (passRate >= 80) {
    summary += `you're performing exceptionally well with a ${passRate}% success rate. `
  } else if (passRate >= 60) {
    summary += `you're showing solid performance with a ${passRate}% success rate, with room for refinement. `
  } else if (passRate >= 40) {
    summary += `your ${passRate}% success rate indicates you're building skills but need focused practice on key areas. `
  } else {
    summary += `your ${passRate}% success rate suggests you're in the early learning phase and should focus on fundamentals. `
  }

  const steepTrendStatus = byType.steepTurns.length >= 3 
    ? analyzeImprovementTrend(byType.steepTurns, 'steep_turn').trend 
    : null
  const landingTrendStatus = byType.landings.length >= 3 
    ? analyzeImprovementTrend(byType.landings, 'landing').trend 
    : null

  if (steepTrendStatus === 'improving' || landingTrendStatus === 'improving') {
    summary += "Your recent performance shows clear improvement trends - keep up the excellent work! "
  } else if (steepTrendStatus === 'declining' || landingTrendStatus === 'declining') {
    summary += "Some performance decline has been detected. Consider reviewing fundamentals and taking a methodical approach to your next attempts. "
  }

  return summary
}

function generateSteepTurnAIAnalysis(steepTurns) {
  if (steepTurns.length === 0) {
    return {
      overview: "No steep turn data available for analysis.",
      strengths: [],
      weaknesses: [],
      insights: []
    }
  }

  const analysis = {
    overview: "",
    strengths: [],
    weaknesses: [],
    insights: []
  }

  // Calculate averages
  const avgAltDev = steepTurns.reduce((sum, st) => sum + Math.abs(st.result_data?.deviations?.maxAltitude || 0), 0) / steepTurns.length
  const avgSpdDev = steepTurns.reduce((sum, st) => sum + Math.abs(st.result_data?.deviations?.maxAirspeed || 0), 0) / steepTurns.length
  const avgBankDev = steepTurns.reduce((sum, st) => sum + Math.abs(st.result_data?.deviations?.maxBank || 0), 0) / steepTurns.length
  const avgRollout = steepTurns.reduce((sum, st) => sum + (st.result_data?.deviations?.rolloutHeadingError || 0), 0) / steepTurns.length

  // Determine strengths and weaknesses
  if (avgAltDev < 50) {
    analysis.strengths.push("Excellent altitude control - consistently maintaining altitude within 50 feet")
  } else if (avgAltDev > 150) {
    analysis.weaknesses.push(`Altitude control needs attention (avg deviation: ${Math.round(avgAltDev)}ft). Focus on coordinated pitch and power adjustments.`)
  }

  if (avgSpdDev < 5) {
    analysis.strengths.push("Outstanding airspeed management - staying within 5 knots of target")
  } else if (avgSpdDev > 15) {
    analysis.weaknesses.push(`Airspeed control is inconsistent (avg deviation: ${Math.round(avgSpdDev)}kt). Monitor power settings and avoid over-controlling.`)
  }

  if (avgBankDev < 3) {
    analysis.strengths.push("Precise bank angle control at 45°")
  } else if (avgBankDev > 7) {
    analysis.weaknesses.push(`Bank angle varies too much from 45° (avg deviation: ${Math.round(avgBankDev)}°). Use visual references and smooth control inputs.`)
  }

  if (avgRollout < 5) {
    analysis.strengths.push("Excellent rollout technique - returning to original heading accurately")
  } else if (avgRollout > 15) {
    analysis.weaknesses.push(`Rollout timing needs work (avg error: ${Math.round(avgRollout)}°). Start rollout 10-15° before target heading.`)
  }

  // Generate overview
  const passRate = (steepTurns.filter(st => st.grade === 'PASS').length / steepTurns.length) * 100
  analysis.overview = `Analyzed ${steepTurns.length} steep turn${steepTurns.length !== 1 ? 's' : ''} with ${Math.round(passRate)}% pass rate. `
  
  if (analysis.strengths.length > analysis.weaknesses.length) {
    analysis.overview += "Your technique is solid with more strengths than areas for improvement."
  } else if (analysis.weaknesses.length > analysis.strengths.length) {
    analysis.overview += "Several key areas need focused practice to improve consistency."
  } else {
    analysis.overview += "Balanced performance with equal strengths and areas for growth."
  }

  // Add insights
  if (avgAltDev > 100 && avgSpdDev > 10) {
    analysis.insights.push("⚠️ Both altitude and airspeed are deviating significantly. This suggests you may be over-controlling. Try smaller, smoother control inputs and use trim effectively.")
  }

  if (avgBankDev < 5 && avgRollout > 15) {
    analysis.insights.push("💡 Your bank angle is excellent, but rollout timing is off. You're holding the bank too long - anticipate the rollout earlier.")
  }

  if (avgAltDev < 60 && avgSpdDev < 8 && avgRollout < 10) {
    analysis.insights.push("🎯 Outstanding fundamentals! You're ready to practice steep turns in more challenging conditions (wind, turbulence).")
  }

  return analysis
}

function generateLandingAIAnalysis(landings) {
  if (landings.length === 0) {
    return {
      overview: "No landing data available for analysis.",
      strengths: [],
      weaknesses: [],
      insights: []
    }
  }

  const analysis = {
    overview: "",
    strengths: [],
    weaknesses: [],
    insights: []
  }

  // Calculate averages
  const avgAltDev = landings.reduce((sum, l) => sum + Math.abs(l.result_data?.maxDeviations?.altitude || 0), 0) / landings.length
  const avgSpdDev = landings.reduce((sum, l) => sum + Math.abs(l.result_data?.maxDeviations?.speed || 0), 0) / landings.length
  const avgTouchdownVS = landings.reduce((sum, l) => sum + Math.abs(l.result_data?.touchdown?.verticalSpeed || 0), 0) / landings.length
  const avgGrade = gradeToScore(calculateAverageGrade(landings))

  // Determine strengths and weaknesses
  if (avgAltDev < 75) {
    analysis.strengths.push("Excellent glidepath tracking - consistently staying on the 3° approach path")
  } else if (avgAltDev > 150) {
    analysis.weaknesses.push(`Glidepath deviations are significant (avg: ${Math.round(avgAltDev)}ft). Use PAPI/VASI references and maintain consistent descent rate.`)
  }

  if (avgSpdDev < 5) {
    analysis.strengths.push("Outstanding airspeed control on final approach")
  } else if (avgSpdDev > 10) {
    analysis.weaknesses.push(`Airspeed management needs improvement (avg deviation: ${Math.round(avgSpdDev)}kt). Stabilize by 500ft AGL with Vref+5.`)
  }

  if (avgTouchdownVS < 150) {
    analysis.strengths.push("Smooth, professional touchdown technique with gentle vertical speeds")
  } else if (avgTouchdownVS > 300) {
    analysis.weaknesses.push(`Touchdown vertical speeds are too high (avg: ${Math.round(avgTouchdownVS)}fpm). Work on flare timing and technique.`)
  }

  const avgGradeText = calculateAverageGrade(landings)
  if (avgGrade >= 8) {
    analysis.strengths.push(`Consistently high performance with average grade of ${avgGradeText}`)
  }

  // Generate overview
  const passRate = (landings.filter(l => !['F', 'FAIL'].includes(l.grade)).length / landings.length) * 100
  analysis.overview = `Analyzed ${landings.length} landing${landings.length !== 1 ? 's' : ''} with ${Math.round(passRate)}% acceptable rate (C or better). Average grade: ${avgGradeText}. `
  
  if (avgGrade >= 7) {
    analysis.overview += "Your landing technique is well-developed and consistent."
  } else if (avgGrade >= 5) {
    analysis.overview += "Solid foundation with room for refinement in key areas."
  } else {
    analysis.overview += "Focus on establishing a stable approach before the flare."
  }

  // Add insights
  if (avgAltDev > 100 && avgSpdDev > 10) {
    analysis.insights.push("⚠️ Both glidepath and speed control need attention. Ensure you're stabilized by 500ft AGL - this is critical for safe landings.")
  }

  if (avgTouchdownVS > 250 && avgSpdDev < 8) {
    analysis.insights.push("💡 Your approach speed is good, but you're landing hard. Focus on proper flare technique: start at 10-20ft AGL, gradually increase pitch while reducing power.")
  }

  if (avgAltDev < 75 && avgSpdDev < 6 && avgTouchdownVS < 180) {
    analysis.insights.push("🎯 Excellent landing fundamentals! You're ready for crosswind and short-field landing practice.")
  }

  const hardLandings = landings.filter(l => Math.abs(l.result_data?.touchdown?.verticalSpeed || 0) > 400).length
  if (hardLandings > landings.length * 0.3) {
    analysis.insights.push("⚠️ Multiple hard landings detected. This can damage the aircraft. Review flare technique with your instructor.")
  }

  return analysis
}

function generateSteepTurnRecommendations(steepTurns) {
  if (steepTurns.length === 0) {
    return ["Complete at least one steep turn to receive personalized recommendations."]
  }

  const recommendations = []
  const commonMistakes = analyzeCommonMistakes(steepTurns, 5)

  // Altitude-based recommendations
  const altitudeMistakes = commonMistakes.filter(m => 
    m.violation.toLowerCase().includes('altitude') || 
    m.violation.toLowerCase().includes('alt')
  )
  if (altitudeMistakes.length > 0) {
    recommendations.push({
      category: "Altitude Control",
      priority: "high",
      tips: [
        "Add power as you establish the 45° bank to compensate for increased load factor",
        "Use outside visual references - the horizon should bisect your windscreen",
        "If altitude is dropping: add power first, then slight back pressure",
        "If altitude is climbing: reduce power slightly, relax back pressure",
        "Practice at higher altitudes first to build muscle memory"
      ]
    })
  }

  // Airspeed-based recommendations
  const speedMistakes = commonMistakes.filter(m => 
    m.violation.toLowerCase().includes('speed') || 
    m.violation.toLowerCase().includes('airspeed')
  )
  if (speedMistakes.length > 0) {
    recommendations.push({
      category: "Airspeed Management",
      priority: "high",
      tips: [
        "Trim the aircraft for hands-off flight before entering the maneuver",
        "Monitor airspeed every 90° of turn - don't fixate on one instrument",
        "Power changes should be small (50-100 RPM adjustments)",
        "If airspeed is increasing: reduce power slightly, check your pitch attitude",
        "If airspeed is decreasing: add power, ensure you're not pulling too much back pressure"
      ]
    })
  }

  // Bank angle recommendations
  const bankMistakes = commonMistakes.filter(m => 
    m.violation.toLowerCase().includes('bank')
  )
  if (bankMistakes.length > 0) {
    recommendations.push({
      category: "Bank Angle Precision",
      priority: "medium",
      tips: [
        "Reference the attitude indicator for precise 45° bank",
        "Use aileron pressure to maintain bank - don't set and forget",
        "Watch for overbanking tendency in steep turns (>45°)",
        "If using outside references, the wing tip should point to the horizon",
        "Practice shallower banks (30°) first to build coordination"
      ]
    })
  }

  // Rollout recommendations
  const rolloutMistakes = commonMistakes.filter(m => 
    m.violation.toLowerCase().includes('rollout') || 
    m.violation.toLowerCase().includes('heading')
  )
  if (rolloutMistakes.length > 0) {
    recommendations.push({
      category: "Rollout Technique",
      priority: "medium",
      tips: [
        "Start your rollout 10-15° before reaching your target heading",
        "Roll out at the same rate you rolled in (smooth and coordinated)",
        "Lead the rollout more if you have higher groundspeed",
        "Keep eyes outside during rollout - use heading indicator for confirmation",
        "Common error: waiting too long to start the rollout"
      ]
    })
  }

  // General recommendations if no specific mistakes found
  if (recommendations.length === 0) {
    recommendations.push({
      category: "Advanced Development",
      priority: "low",
      tips: [
        "Practice steep turns in both directions - most pilots are stronger in one direction",
        "Try steep turns with different aircraft configurations and power settings",
        "Work on smooth, continuous turns without pauses",
        "Practice recovering from common errors (altitude loss, airspeed decay)",
        "Consider practicing in light turbulence to improve skills"
      ]
    })
  }

  // Add general tips
  recommendations.push({
    category: "General Best Practices",
    priority: "low",
    tips: [
      "Clear the area with two 90° clearing turns before starting",
      "Ensure you have at least 1,500 ft AGL (3,000 ft recommended for training)",
      "Use a reference point on the horizon to maintain orientation",
      "Verbalize your scan pattern: attitude, altitude, airspeed, bank, heading",
      "Debrief after each attempt - what worked and what didn't?"
    ]
  })

  return recommendations
}

function generateLandingRecommendations(landings) {
  if (landings.length === 0) {
    return ["Complete at least one landing to receive personalized recommendations."]
  }

  const recommendations = []
  const commonMistakes = analyzeCommonMistakes(landings, 5)

  // Glidepath recommendations
  const altitudeMistakes = commonMistakes.filter(m => 
    m.violation.toLowerCase().includes('altitude') || 
    m.violation.toLowerCase().includes('glidepath')
  )
  if (altitudeMistakes.length > 0) {
    recommendations.push({
      category: "Glidepath Control",
      priority: "high",
      tips: [
        "Aim for the '3-degree' glidepath: if threshold looks stationary in your windscreen, you're on path",
        "Use PAPI lights if available: 2 white / 2 red = perfect glidepath",
        "Pitch controls glidepath, power controls airspeed (until the flare)",
        "If too high: reduce power slightly and accept a minor speed increase temporarily",
        "If too low: add power immediately - do not try to 'stretch' the glide",
        "Must be stabilized by 500 ft AGL - if not, GO AROUND"
      ]
    })
  }

  // Speed recommendations
  const speedMistakes = commonMistakes.filter(m => 
    m.violation.toLowerCase().includes('speed') || 
    m.violation.toLowerCase().includes('airspeed')
  )
  if (speedMistakes.length > 0) {
    recommendations.push({
      category: "Airspeed Management",
      priority: "high",
      tips: [
        "Target Vref + 5 knots on final approach (adjust for wind)",
        "Use trim to reduce control pressure - let the aircraft fly itself",
        "In gusty conditions: add half the gust factor to your approach speed",
        "Reduce to Vref over the threshold during the flare",
        "Too fast = floating and long landing; Too slow = risk of stall/hard landing",
        "Small power adjustments (50-100 RPM) for fine-tuning"
      ]
    })
  }

  // Touchdown recommendations
  const touchdownMistakes = commonMistakes.filter(m => 
    m.violation.toLowerCase().includes('touchdown') || 
    m.violation.toLowerCase().includes('vertical speed') ||
    m.violation.toLowerCase().includes('hard')
  )
  if (touchdownMistakes.length > 0 || landings.some(l => Math.abs(l.result_data?.touchdown?.verticalSpeed || 0) > 300)) {
    recommendations.push({
      category: "Flare & Touchdown Technique",
      priority: "high",
      tips: [
        "Start the flare at 10-20 ft AGL (approximately one wingspan height)",
        "Gradually increase pitch attitude while reducing power to idle",
        "Look down the runway (not directly in front) to judge height",
        "Goal: main wheels touch first with minimal vertical speed (<200 fpm ideal)",
        "Don't rush to get the nose wheel down - let it settle naturally",
        "If you balloon (float up): DO NOT push forward - hold altitude and try again or go around",
        "Practice flare timing and sight picture with your instructor"
      ]
    })
  }

  // Centerline recommendations
  const centerlineMistakes = commonMistakes.filter(m => 
    m.violation.toLowerCase().includes('centerline') || 
    m.violation.toLowerCase().includes('lateral')
  )
  if (centerlineMistakes.length > 0) {
    recommendations.push({
      category: "Centerline Tracking",
      priority: "medium",
      tips: [
        "Pick a point on the centerline and fly toward it",
        "Use rudder for directional control (not aileron) during flare",
        "Crosswind correction: wing down into wind, opposite rudder for alignment",
        "Touchdown on the upwind main wheel first in crosswinds",
        "Hold centerline with rudder during rollout until nosewheel is down",
        "Practice in calm conditions first before attempting crosswinds"
      ]
    })
  }

  // Pattern/approach recommendations
  const patternMistakes = commonMistakes.filter(m => 
    m.violation.toLowerCase().includes('downwind') || 
    m.violation.toLowerCase().includes('base') ||
    m.violation.toLowerCase().includes('pattern')
  )
  if (patternMistakes.length > 0) {
    recommendations.push({
      category: "Traffic Pattern",
      priority: "medium",
      tips: [
        "Maintain consistent pattern altitude (typically 1,000 ft AGL)",
        "Configure aircraft early: gear down on downwind, flaps in stages",
        "Abeam the threshold: reduce power and start descent",
        "Turn base when threshold is 45° behind your wing",
        "Turn final with enough distance to stabilize (minimum 1/2 mile recommended)",
        "Final approach should be 3-5 minutes of stabilized flight"
      ]
    })
  }

  // General recommendations
  recommendations.push({
    category: "Stabilized Approach Criteria",
    priority: "high",
    tips: [
      "By 500 ft AGL you MUST have: correct configuration, on glidepath, on speed, on centerline",
      "If not stabilized by 500 ft AGL: EXECUTE A GO-AROUND (this is good airmanship)",
      "Memorize and chair-fly the landing flow: gear-gas-gauges-flaps-seatbelts",
      "Use a consistent landing checklist every time",
      "Verbalize your scan: attitude-altitude-airspeed-alignment"
    ]
  })

  recommendations.push({
    category: "Practice & Development",
    priority: "low",
    tips: [
      "Practice pattern work: multiple touch-and-goes build consistency",
      "Consider practicing slow flight at altitude to improve flare control",
      "Watch landings from the ground to improve your sight picture understanding",
      "Video your landings (external camera) to analyze technique",
      "Fly with different instructors to get varied perspectives"
    ]
  })

  return recommendations
}

function calculateAverageGrade(landings) {
  if (landings.length === 0) return 'N/A'
  
  const totalScore = landings.reduce((sum, landing) => sum + gradeToScore(landing.grade), 0)
  const avgScore = totalScore / landings.length

  if (avgScore >= 9) return 'A'
  if (avgScore >= 7.5) return 'A-/B+'
  if (avgScore >= 6) return 'B'
  if (avgScore >= 4.5) return 'B-/C+'
  if (avgScore >= 3) return 'C'
  if (avgScore >= 1) return 'D'
  return 'F'
}

