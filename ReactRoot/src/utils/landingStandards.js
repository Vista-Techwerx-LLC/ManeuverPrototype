// JKA Airport Landing Standards

// Haversine formula for calculating distance between two lat/lon points
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371 // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const distanceKm = R * c
  return distanceKm * 0.539957 // Convert to nautical miles
}

// Calculate bearing between two points
export function calculateBearing(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180
  const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180)
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
           Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon)
  const bearing = Math.atan2(y, x) * 180 / Math.PI
  return (bearing + 360) % 360
}

// Calculate point at distance and bearing from origin
export function calculateDestinationPoint(lat, lon, bearing, distanceNM) {
  const R = 6371 // Earth's radius in km
  const d = distanceNM * 1.852 // Convert NM to km
  const brng = bearing * Math.PI / 180
  const lat1 = lat * Math.PI / 180
  const lon1 = lon * Math.PI / 180
  
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d / R) +
    Math.cos(lat1) * Math.sin(d / R) * Math.cos(brng)
  )
  
  const lon2 = lon1 + Math.atan2(
    Math.sin(brng) * Math.sin(d / R) * Math.cos(lat1),
    Math.cos(d / R) - Math.sin(lat1) * Math.sin(lat2)
  )
  
  return {
    lat: lat2 * 180 / Math.PI,
    lon: lon2 * 180 / Math.PI
  }
}

// Normalize angle to -180 to 180
export function normalizeAngle(angle) {
  let normalized = angle
  while (normalized > 180) normalized -= 360
  while (normalized < -180) normalized += 360
  return normalized
}

// Calculate lateral deviation from centerline (in NM)
// Returns positive for right of centerline, negative for left
export function calculateLateralDeviation(aircraftLat, aircraftLon, thresholdLat, thresholdLon, oppositeEndLat, oppositeEndLon) {
  // Calculate runway heading (from threshold to opposite end)
  const runwayBearing = calculateBearing(thresholdLat, thresholdLon, oppositeEndLat, oppositeEndLon)
  
  // Calculate bearing from threshold to aircraft
  const aircraftBearing = calculateBearing(thresholdLat, thresholdLon, aircraftLat, aircraftLon)
  
  // Calculate distance from threshold to aircraft
  const distanceToAircraft = calculateDistance(thresholdLat, thresholdLon, aircraftLat, aircraftLon)
  
  // Calculate the angle difference
  let angleDiff = normalizeAngle(aircraftBearing - runwayBearing)
  
  // Convert angle to radians
  const angleRad = angleDiff * Math.PI / 180
  
  // Lateral deviation = distance * sin(angle)
  // Positive = right of centerline, Negative = left of centerline
  const lateralDev = distanceToAircraft * Math.sin(angleRad)
  
  return lateralDev
}

// KJKA Airport Definition (Jack Edwards Airport, Gulf Shores, Alabama)
export const JKA_AIRPORT = {
  code: 'KJKA',
  name: 'Jack Edwards Airport',
  location: 'Gulf Shores, Alabama',
  elevation: 17, // ft MSL
  patternAltitude: 1017, // ft MSL (prop aircraft)
  
  // Runway 27 (primary runway - 09/27)
  // Runway 27 heading is 270° (West), so threshold is at the WESTERN end
  runway27: {
    heading: 270, // magnetic heading (west)
    threshold: {
      lat: 30.2958, // KJKA Runway 27 threshold (WESTERN end - more west)
      lon: -87.6875,
      elevation: 17 // ft MSL
    },
    length: 6969, // feet
    width: 98, // feet
    oppositeEnd: {
      lat: 30.2899, // Runway 09 end (EASTERN end)
      lon: -87.6720
    }
  }
}

// 3-degree glidepath standards
export const GLIDEPATH = {
  angle: 3, // degrees
  
  // Gates on final approach (distance from threshold in NM)
  gates: {
    '5.0NM': {
      distance: 5.0,
      targetAltitudeMSL: 1517,
      targetAltitudeAGL: 1500,
      toleranceAlt: 150,
      toleranceSpeed: 10,
      targetSpeed: 'Vref+15',
      verticalSpeed: { min: 500, max: 1000 }
    },
    '4.0NM': {
      distance: 4.0,
      targetAltitudeMSL: 1217,
      targetAltitudeAGL: 1200,
      toleranceAlt: 125,
      toleranceSpeed: 10,
      targetSpeed: 'Vref+15',
      verticalSpeed: { min: 500, max: 1000 }
    },
    '3.0NM': {
      distance: 3.0,
      targetAltitudeMSL: 917,
      targetAltitudeAGL: 900,
      toleranceAlt: 125,
      toleranceSpeed: 10,
      targetSpeed: 'Vref+15',
      verticalSpeed: { min: 500, max: 1000 }
    },
    '2.0NM': {
      distance: 2.0,
      targetAltitudeMSL: 617,
      targetAltitudeAGL: 600,
      toleranceAlt: 100,
      toleranceSpeed: 10,
      targetSpeed: 'Vref+10',
      verticalSpeed: { min: 400, max: 900 }
    },
    '1.5NM': {
      distance: 1.5,
      targetAltitudeMSL: 467,
      targetAltitudeAGL: 450,
      toleranceAlt: 100,
      toleranceSpeed: 5,
      targetSpeed: 'Vref+10', // relative to Vref
      verticalSpeed: { min: 400, max: 800 }
    },
    '1.0NM': {
      distance: 1.0,
      targetAltitudeMSL: 317,
      targetAltitudeAGL: 300,
      toleranceAlt: 75,
      toleranceSpeed: 5,
      targetSpeed: 'Vref+5 to Vref+10',
      verticalSpeed: { min: 400, max: 700 }
    },
    '0.5NM': {
      distance: 0.5,
      targetAltitudeMSL: 167,
      targetAltitudeAGL: 150,
      toleranceAlt: 50,
      toleranceSpeed: 5,
      targetSpeed: 'Vref+5',
      verticalSpeed: { min: 300, max: 600 },
      lateralDeviation: 0.05 // ±0.05 NM from centerline
    }
  },
  
  // Calculate altitude for any distance (3° glidepath)
  getTargetAltitude: (distanceNM) => {
    // 3° glidepath: rise/run = tan(3°) ≈ 0.0524
    // Altitude AGL (ft) = distance (ft) * tan(3°)
    const distanceFeet = distanceNM * 6076 // Convert NM to feet
    const altitudeAGL = distanceFeet * Math.tan(3 * Math.PI / 180)
    return {
      agl: altitudeAGL,
      msl: altitudeAGL + JKA_AIRPORT.elevation
    }
  }
}

// Landing phases and standards
export const LANDING_PHASES = {
  NONE: 'none',
  DOWNWIND: 'downwind',
  BASE: 'base',
  FINAL: 'final',
  THRESHOLD: 'threshold',
  ROLLOUT: 'rollout',
  COMPLETE: 'complete'
}

export const PHASE_STANDARDS = {
  [LANDING_PHASES.DOWNWIND]: {
    name: 'Downwind',
    altitude: {
      target: 1017, // MSL
      tolerance: 100
    },
    airspeed: {
      target: 'Vref+10',
      tolerance: 5
    },
    bankAngle: {
      max: 30 // for pattern turns
    },
    lateralDistance: {
      min: 0.7,
      max: 1.0 // NM from runway centerline
    },
    description: 'Pattern altitude, reciprocal runway heading'
  },
  
  [LANDING_PHASES.BASE]: {
    name: 'Base Leg',
    altitude: {
      start: 900, // MSL at start of base turn
      mid: 800, // MSL at mid-base
      tolerance: 100
    },
    airspeed: {
      target: 'Vref+15',
      tolerance: 5
    },
    descentRate: {
      min: 400,
      max: 800 // fpm
    },
    bankAngle: {
      max: 30
    },
    lateralDistance: {
      mid: { min: 0.5, max: 0.8 } // NM from centerline at mid-base
    },
    description: 'Descending turn to final'
  },
  
  [LANDING_PHASES.FINAL]: {
    name: 'Final Approach',
    stabilized: {
      byAltitude: 500, // Must be stabilized by 500 ft AGL (517 ft MSL)
      criteria: {
        altitude: 100, // ±100 ft of glidepath
        airspeed: { min: 'Vref', max: 'Vref+20', target: 'Vref+5 to Vref+10' },
        verticalSpeed: { min: 400, max: 800, stable: true }, // fpm, no rapid changes
        configuration: 'landing', // gear down, landing flaps
        bankAngle: { max: 15 }, // on short final
        lateralDeviation: 0.1 // ±0.1 NM from centerline
      }
    },
    description: 'Stabilized approach on glidepath'
  },
  
  [LANDING_PHASES.THRESHOLD]: {
    name: 'Threshold Crossing',
    altitude: {
      min: 30, // AGL (47 MSL)
      max: 60, // AGL (77 MSL)
      target: 50 // AGL
    },
    airspeed: {
      target: 'Vref',
      tolerance: 5
    },
    verticalSpeed: {
      min: 100,
      max: 300 // fpm
    },
    lateralDeviation: 0.03, // ±0.03 NM (~150-200 ft)
    flareStart: {
      min: 10, // AGL (27 MSL)
      max: 20 // AGL (37 MSL)
    },
    description: 'Crossing threshold and flare'
  },
  
  [LANDING_PHASES.ROLLOUT]: {
    name: 'Landing Rollout',
    touchdown: {
      elevation: 17, // MSL
      distanceFromThreshold: { min: 500, max: 1500 }, // feet
      verticalSpeed: {
        soft: 120, // fpm or less
        acceptable: 240, // 120-240 fpm
        firm: 360, // 240-360 fpm
        hard: 361 // > 360 fpm (flag)
      }
    },
    heading: {
      tolerance: 10 // ±10° from runway heading
    },
    lateralDeviation: 50, // ±50 ft from centerline
    description: 'Touchdown and rollout'
  }
}

// Detect current phase based on aircraft position and state
export function detectLandingPhase(data, runway, previousPhase = LANDING_PHASES.NONE) {
  if (!data || !runway) return LANDING_PHASES.NONE
  
  const { lat, lon, alt_ft, on_ground, hdg_true } = data
  if (lat == null || lon == null || alt_ft == null) return LANDING_PHASES.NONE
  
  // Calculate distance from threshold
  const distanceToThreshold = calculateDistance(
    lat, lon,
    runway.threshold.lat, runway.threshold.lon
  )
  
  // Calculate distance from opposite end (for downwind detection)
  const distanceToOppositeEnd = calculateDistance(
    lat, lon,
    runway.oppositeEnd.lat, runway.oppositeEnd.lon
  )
  
  // Calculate lateral deviation from extended centerline
  const lateralDev = Math.abs(calculateLateralDeviation(
    lat, lon,
    runway.threshold.lat, runway.threshold.lon,
    runway.oppositeEnd.lat, runway.oppositeEnd.lon
  ))
  
  // Calculate heading deviation from runway heading
  const headingDev = Math.abs(normalizeAngle(hdg_true - runway.heading))
  
  const altitudeAGL = alt_ft - JKA_AIRPORT.elevation
  
  // On ground = rollout or complete
  if (on_ground) {
    if (distanceToThreshold < 2.0) { // Within 2 NM of threshold and on ground
      if (previousPhase === LANDING_PHASES.ROLLOUT || previousPhase === LANDING_PHASES.THRESHOLD) {
        return LANDING_PHASES.ROLLOUT
      }
    }
    return LANDING_PHASES.NONE
  }
  
  // Threshold crossing (< 0.1 NM from threshold, low altitude)
  if (distanceToThreshold < 0.1 && altitudeAGL < 100 && altitudeAGL > 10) {
    return LANDING_PHASES.THRESHOLD
  }
  
  // Final approach (aligned with runway, descending on glidepath)
  if (distanceToThreshold < 5.0 && distanceToThreshold > 0.1 && 
      headingDev < 30 && lateralDev < 0.5) {
    return LANDING_PHASES.FINAL
  }
  
  // Base leg (perpendicular to runway, descending, 0.5-1.5 NM away)
  const perpendicularHeading = (runway.heading + 90) % 360
  const perpendicularHeadingDev = Math.min(
    Math.abs(normalizeAngle(hdg_true - perpendicularHeading)),
    Math.abs(normalizeAngle(hdg_true - (perpendicularHeading + 180)))
  )
  
  if (distanceToThreshold > 0.5 && distanceToThreshold < 3.0 &&
      perpendicularHeadingDev < 60 &&
      lateralDev > 0.3 && lateralDev < 1.5 &&
      altitudeAGL > 300 && altitudeAGL < 1500) {
    return LANDING_PHASES.BASE
  }
  
  // Downwind (opposite heading from runway, at pattern altitude, lateral to runway)
  const oppositeHeading = (runway.heading + 180) % 360
  const downwindHeadingDev = Math.abs(normalizeAngle(hdg_true - oppositeHeading))
  
  if (downwindHeadingDev < 30 &&
      lateralDev > 0.5 && lateralDev < 1.5 &&
      altitudeAGL > 800 && altitudeAGL < 1300 &&
      distanceToOppositeEnd < 2.0) {
    return LANDING_PHASES.DOWNWIND
  }
  
  return LANDING_PHASES.NONE
}

// Check if aircraft meets standards for current phase
export function checkPhaseCompliance(data, phase, runway, vref = 60) {
  if (!data || phase === LANDING_PHASES.NONE) {
    return { compliant: false, violations: [], metrics: {} }
  }
  
  const standards = PHASE_STANDARDS[phase]
  if (!standards) return { compliant: false, violations: [], metrics: {} }
  
  const violations = []
  const metrics = {}
  
  const { alt_ft, ias_kt, vs_fpm, bank_deg, lat, lon, hdg_true } = data
  const altitudeAGL = alt_ft - JKA_AIRPORT.elevation
  
  // Calculate distance from threshold
  const distanceToThreshold = calculateDistance(
    lat, lon,
    runway.threshold.lat, runway.threshold.lon
  )
  
  metrics.distanceToThreshold = distanceToThreshold
  metrics.altitudeAGL = altitudeAGL
  metrics.altitudeMSL = alt_ft
  
  // Phase-specific checks
  switch (phase) {
    case LANDING_PHASES.DOWNWIND: {
      const altDev = Math.abs(alt_ft - standards.altitude.target)
      metrics.altitudeDeviation = alt_ft - standards.altitude.target
      
      if (altDev > standards.altitude.tolerance) {
        violations.push(`Altitude ${altDev.toFixed(0)} ft from pattern altitude`)
      }
      
      const targetSpeed = vref + 20
      const spdDev = Math.abs(ias_kt - targetSpeed)
      metrics.targetSpeed = targetSpeed
      metrics.speedDeviation = ias_kt - targetSpeed
      
      if (spdDev > standards.airspeed.tolerance) {
        violations.push(`Airspeed ${spdDev.toFixed(0)} kt from target`)
      }
      
      const bankAbs = Math.abs(bank_deg || 0)
      metrics.bankAngle = bankAbs
      
      if (bankAbs > standards.bankAngle.max) {
        violations.push(`Bank angle ${bankAbs.toFixed(0)}° exceeds ${standards.bankAngle.max}°`)
      }
      break
    }
    
    case LANDING_PHASES.BASE: {
      const targetSpeed = vref + 15
      const spdDev = Math.abs(ias_kt - targetSpeed)
      metrics.targetSpeed = targetSpeed
      metrics.speedDeviation = ias_kt - targetSpeed
      
      if (spdDev > standards.airspeed.tolerance) {
        violations.push(`Airspeed ${spdDev.toFixed(0)} kt from target`)
      }
      
      const vsAbs = Math.abs(vs_fpm || 0)
      metrics.verticalSpeed = vs_fpm
      
      if (vsAbs < standards.descentRate.min || vsAbs > standards.descentRate.max) {
        violations.push(`Descent rate ${vsAbs.toFixed(0)} fpm out of range`)
      }
      
      const bankAbs = Math.abs(bank_deg || 0)
      metrics.bankAngle = bankAbs
      
      if (bankAbs > standards.bankAngle.max) {
        violations.push(`Bank angle ${bankAbs.toFixed(0)}° exceeds ${standards.bankAngle.max}°`)
      }
      break
    }
    
    case LANDING_PHASES.FINAL: {
      // Check if stabilized by 500 ft AGL
      const stabilizedAlt = standards.stabilized.byAltitude
      metrics.stabilizedByAltitude = stabilizedAlt
      
      // Glidepath deviation
      const targetAlt = GLIDEPATH.getTargetAltitude(distanceToThreshold)
      const altDev = alt_ft - targetAlt.msl
      metrics.glidepathDeviation = altDev
      metrics.targetAltitudeMSL = targetAlt.msl
      
      if (altitudeAGL <= stabilizedAlt && Math.abs(altDev) > standards.stabilized.criteria.altitude) {
        violations.push(`Altitude ${Math.abs(altDev).toFixed(0)} ft from glidepath (below 500 AGL)`)
      }
      
      // Airspeed
      const targetSpeedMin = vref
      const targetSpeedMax = vref + 20
      metrics.targetSpeedMin = targetSpeedMin
      metrics.targetSpeedMax = targetSpeedMax
      metrics.airspeed = ias_kt
      
      if (ias_kt < targetSpeedMin || ias_kt > targetSpeedMax) {
        violations.push(`Airspeed ${ias_kt.toFixed(0)} kt outside Vref to Vref+20`)
      }
      
      // Vertical speed
      const vsAbs = Math.abs(vs_fpm || 0)
      metrics.verticalSpeed = vs_fpm
      
      if (vsAbs < standards.stabilized.criteria.verticalSpeed.min || 
          vsAbs > standards.stabilized.criteria.verticalSpeed.max) {
        violations.push(`Descent rate ${vsAbs.toFixed(0)} fpm out of range`)
      }
      
      // Bank angle
      const bankAbs = Math.abs(bank_deg || 0)
      metrics.bankAngle = bankAbs
      
      if (bankAbs > standards.stabilized.criteria.bankAngle.max) {
        violations.push(`Bank angle ${bankAbs.toFixed(0)}° exceeds ${standards.stabilized.criteria.bankAngle.max}°`)
      }
      
      // Lateral deviation
      const lateralDev = Math.abs(calculateLateralDeviation(
        lat, lon,
        runway.threshold.lat, runway.threshold.lon,
        runway.oppositeEnd.lat, runway.oppositeEnd.lon
      ))
      metrics.lateralDeviation = lateralDev
      
      if (lateralDev > standards.stabilized.criteria.lateralDeviation) {
        violations.push(`${(lateralDev * 6076).toFixed(0)} ft off centerline`)
      }
      break
    }
    
    case LANDING_PHASES.THRESHOLD: {
      const targetAltMin = standards.altitude.min + JKA_AIRPORT.elevation
      const targetAltMax = standards.altitude.max + JKA_AIRPORT.elevation
      metrics.targetAltitudeMin = targetAltMin
      metrics.targetAltitudeMax = targetAltMax
      
      if (alt_ft < targetAltMin || alt_ft > targetAltMax) {
        violations.push(`Threshold crossing height ${altitudeAGL.toFixed(0)} ft AGL out of range`)
      }
      
      const targetSpeed = vref
      const spdDev = Math.abs(ias_kt - targetSpeed)
      metrics.targetSpeed = targetSpeed
      metrics.speedDeviation = ias_kt - targetSpeed
      
      if (spdDev > standards.airspeed.tolerance) {
        violations.push(`Airspeed ${spdDev.toFixed(0)} kt from Vref`)
      }
      
      const vsAbs = Math.abs(vs_fpm || 0)
      metrics.verticalSpeed = vs_fpm
      
      if (vsAbs < standards.verticalSpeed.min || vsAbs > standards.verticalSpeed.max) {
        violations.push(`Descent rate ${vsAbs.toFixed(0)} fpm out of range`)
      }
      break
    }
    
    case LANDING_PHASES.ROLLOUT: {
      const hdgDev = Math.abs(normalizeAngle(hdg_true - runway.heading))
      metrics.headingDeviation = hdgDev
      
      if (hdgDev > standards.heading.tolerance) {
        violations.push(`Heading ${hdgDev.toFixed(0)}° off runway heading`)
      }
      break
    }
  }
  
  return {
    compliant: violations.length === 0,
    violations,
    metrics
  }
}

// Calculate gate passage info
export function checkGatePassage(data, runway, vref = 60) {
  if (!data || !runway) return null
  
  const { lat, lon, alt_ft } = data
  const distanceToThreshold = calculateDistance(
    lat, lon,
    runway.threshold.lat, runway.threshold.lon
  )
  
  const gates = GLIDEPATH.gates
  const gateKeys = Object.keys(gates).sort((a, b) => gates[b].distance - gates[a].distance)
  
  for (const gateKey of gateKeys) {
    const gate = gates[gateKey]
    const distanceDiff = Math.abs(distanceToThreshold - gate.distance)
    
    // Check if we're passing through this gate (within 0.05 NM)
    if (distanceDiff < 0.05) {
      const altDev = alt_ft - gate.targetAltitudeMSL
      const altCompliant = Math.abs(altDev) <= gate.toleranceAlt
      
      return {
        gate: gateKey,
        distance: gate.distance,
        targetAltitude: gate.targetAltitudeMSL,
        actualAltitude: alt_ft,
        altitudeDeviation: altDev,
        altitudeCompliant: altCompliant,
        targetSpeed: gate.targetSpeed,
        compliant: altCompliant
      }
    }
  }
  
  return null
}

