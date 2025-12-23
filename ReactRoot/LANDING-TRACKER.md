# Landing Tracker - KJKA Airport

## Overview

The Landing Tracker is a comprehensive approach and landing monitoring system designed for Jack Edwards Airport (KJKA) in Gulf Shores, Alabama. It provides real-time tracking of your landing approach with automatic phase detection and compliance checking against professional standards.

## Features

### 1. **Automatic Phase Detection**
The system automatically detects which phase of the landing you're in:
- **Downwind**: Flying parallel to the runway at pattern altitude
- **Base Leg**: Descending turn toward final approach
- **Final Approach**: Aligned with runway, following the 3° glidepath
- **Threshold Crossing**: Flying over the runway threshold at 30-60 ft AGL
- **Rollout**: On the ground, decelerating after touchdown

### 2. **Real-Time Visualization**
- **Top View**: Shows your position relative to the runway centerline and approach gates
- **Side Profile**: Displays your altitude profile against the 3° glidepath
- Live aircraft position tracking with flight path history

### 3. **KJKA Airport Standards**

#### Airport Data
- **Airport**: Jack Edwards Airport (KJKA)
- **Location**: Gulf Shores, Alabama
- **Field Elevation**: 17 ft MSL
- **Pattern Altitude**: 1,017 ft MSL (prop aircraft)
- **Glidepath**: 3° (standard ILS glidepath)
- **Runway 27**: Heading 270° (West), 6,969 ft length × 98 ft wide
- **Also available**: Runway 09 (East), Runway 17/35

#### Approach Gates
The system monitors three critical gates on final approach:
- **1.5 NM Gate**: 495 ft MSL (478 ft AGL)
  - Target speed: Vref + 10 kt (±5 kt)
  - Descent rate: 400-800 fpm
  - Altitude tolerance: ±100 ft

- **1.0 NM Gate**: 335 ft MSL (318 ft AGL)
  - Target speed: Vref + 5-10 kt (±5 kt)
  - Descent rate: 400-700 fpm
  - Altitude tolerance: ±75 ft

- **0.5 NM Gate**: 175 ft MSL (158 ft AGL)
  - Target speed: Vref + 5 kt (±5 kt)
  - Descent rate: 300-600 fpm
  - Altitude tolerance: ±50 ft
  - Lateral deviation: ±0.05 NM from centerline

### 4. **Phase Standards**

#### Downwind
- Altitude: 1,017 ft MSL ±100 ft
- Airspeed: Vref + 20 kt ±5 kt
- Lateral distance: 0.7-1.0 NM from runway
- Bank angle: ≤30° for pattern turns

#### Base Leg
- Start altitude: ~900 ft MSL ±100 ft
- Mid-base altitude: ~800 ft MSL ±100 ft
- Airspeed: Vref + 15 kt ±5 kt
- Descent rate: 400-800 fpm
- Bank angle: ≤30°

#### Final Approach (Stabilized)
Must be stabilized by **500 ft AGL** (517 ft MSL):
- Altitude: Within ±100 ft of 3° glidepath
- Airspeed: Vref to Vref+20 kt (target: Vref+5-10 kt)
- Descent rate: 400-800 fpm, smooth and stable
- Configuration: Landing (gear down, landing flaps)
- Bank angle: ≤15° on short final
- Lateral deviation: ±0.1 NM from centerline

#### Threshold Crossing
- Height: 30-60 ft AGL (target: 50 ft)
- Airspeed: Vref ±5 kt
- Descent rate: 100-300 fpm
- Lateral deviation: ±0.03 NM (~150-200 ft)

#### Touchdown & Rollout
- Touchdown zone: 500-1,500 ft past threshold
- Vertical speed rating:
  - **Soft**: ≤120 fpm
  - **Acceptable**: 120-240 fpm
  - **Firm**: 240-360 fpm
  - **Hard**: >360 fpm (flagged)
- Heading: Within ±10° of runway heading
- Lateral: Within ±50 ft of centerline

### 5. **Grading System**

The system automatically grades your landing as PASS or FAIL based on:
- Compliance with all phase standards
- Stable approach by 500 ft AGL
- Gate passage within tolerances
- Safe touchdown parameters
- No hard landing (>360 fpm)

## How to Use

### Setup
1. Navigate to the **Landing** page from the navbar or dashboard
2. Set your aircraft's **Vref** (reference landing speed)
   - Cessna 172: ~60 kt
   - Piper Cherokee: ~65 kt
   - Cirrus SR22: ~80 kt
3. Select **Runway 25** (currently the only runway programmed)

### During Flight
1. Click **Start Tracking** when you're ready to begin your approach
2. The system will automatically detect your position and phase
3. Watch the real-time displays:
   - **Live Data**: Current flight parameters
   - **Top View**: Your position relative to the runway
   - **Side Profile**: Your altitude on the glidepath
   - **Glidepath Guidance**: Deviation from the 3° path (on final)
   - **Gates Passed**: Marks each gate with pass/fail status

### After Landing
1. Review your **Landing Complete** summary showing:
   - Overall grade (PASS/FAIL)
   - Touchdown details (distance, firmness, vertical speed)
   - Gate passage results
   - List of any deviations from standards
2. Click **Reset & Try Again** to practice another approach

## Tips for Success

### Pattern Entry
- Join the downwind at 1,017 ft MSL, about 0.7-1.0 NM from the runway
- Fly parallel to Runway 27 (opposite heading: 090° - East)
- Maintain Vref + 20 kt

### Base Turn
- Begin descent when the threshold is ~45° behind your wing
- Target 800-900 ft MSL on base
- Reduce speed to Vref + 15 kt
- Configure aircraft (extend gear, first flaps)

### Final Approach
- Turn to align with runway heading (270° - due West)
- Establish on the 3° glidepath
- **Critical**: Must be stabilized by 500 ft AGL
- Complete landing configuration
- Maintain Vref + 5-10 kt
- Monitor glidepath deviation display

### Touchdown
- Cross threshold at 50 ft AGL, Vref speed
- Flare smoothly starting at 10-20 ft AGL
- Aim for 500-1,500 ft past threshold
- Target vertical speed <240 fpm for smooth landing

## Technical Notes

### Coordinate System
- The system uses your aircraft's GPS coordinates from SimConnect
- Distance calculations use the Haversine formula (great-circle distance)
- All bearings are magnetic headings

### Real-Time Updates
- Aircraft position: ~2 Hz update rate
- Phase detection: Continuous
- Compliance checking: Every data frame when in tracked phases
- Flight path sampling: 2 Hz (every 0.5 seconds)

### Saved Data
All approaches are automatically saved to your profile and include:
- Complete flight path (lat/lon/alt for every sample)
- Phase history with timestamps
- All detected violations
- Gate passage results
- Touchdown parameters
- Final grade

## Future Enhancements

Potential additions for future versions:
- Additional runways at JKA (Runway 07)
- Other airports with custom standards
- Wind correction monitoring
- ILS/localizer deviation display
- VASI/PAPI simulation
- Go-around detection and tracking
- Pattern work session tracking (multiple landings)
- Touch-and-go support

## Coordinates Reference

KJKA Runway 27 (primary):
- Heading: 270° (due West)
- Length: 6,969 ft × 98 ft wide
- Threshold: 30.2899°N, 87.6720°W
- Opposite end (Runway 09): 30.2958°N, 87.6875°W
- Location: Gulf Shores, Alabama

Other runways at KJKA:
- Runway 17/35: 3,600 ft × 75 ft

*Note: These are approximate coordinates. The system uses distance and bearing calculations relative to the threshold, so slight coordinate variations won't significantly affect tracking accuracy.*

## Troubleshooting

**Phase not being detected:**
- Ensure you're within 5 NM of the airport
- Check that your heading aligns reasonably with the pattern
- Verify your altitude is appropriate for the phase

**Glidepath deviation seems wrong:**
- Confirm your field elevation (17 ft for JKA)
- Check that Vref is set correctly
- Ensure SimConnect is providing accurate altitude data

**Landing not completing automatically:**
- The system waits for airspeed to drop below 20 kt after touchdown
- If needed, use "Stop Tracking" and review partial data

---

**Happy Landings! ✈️🛬**

