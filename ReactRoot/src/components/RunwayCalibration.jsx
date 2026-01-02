import { useState, useEffect } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { supabase } from '../lib/supabase'
import './RunwayCalibration.css'

const STORAGE_KEY = 'custom_runways'

// Load custom runways from localStorage and database (including connected users)
export async function loadCustomRunways(user = null) {
  try {
    // Load from localStorage first
    const stored = localStorage.getItem(STORAGE_KEY)
    const localRunways = stored ? JSON.parse(stored) : []
    
    // If user is provided, also load from database (own + connected users)
    if (user) {
      try {
        // Get accepted connections (both as student and instructor)
        const { data: relationships, error: relError } = await supabase
          .from('instructor_relationships')
          .select('student_id, instructor_id, status')
          .or(`and(student_id.eq.${user.id},status.eq.accepted),and(instructor_id.eq.${user.id},status.eq.accepted)`)
        
        if (relError) {
          console.error('Error loading relationships:', relError)
        } else {
          // Collect all connected user IDs
          const connectedUserIds = new Set([user.id]) // Include own runways
          relationships?.forEach(rel => {
            if (rel.student_id === user.id) {
              connectedUserIds.add(rel.instructor_id)
            } else if (rel.instructor_id === user.id) {
              connectedUserIds.add(rel.student_id)
            }
          })
          
          // Load runways from all connected users
          const { data: dbRunways, error: dbError } = await supabase
            .from('custom_runways')
            .select('user_id, runway_data, runway_name, created_at')
            .in('user_id', Array.from(connectedUserIds))
            .order('created_at', { ascending: false })
          
          if (dbError) {
            console.error('Error loading runways from database:', dbError)
          } else if (dbRunways) {
            // Convert database runways to format expected by the app
            const dbRunwaysFormatted = dbRunways.map(r => ({
              ...r.runway_data,
              id: r.runway_data.id || `db_${r.user_id}_${r.runway_name}`,
              fromDatabase: true,
              ownerId: r.user_id,
              ownerName: r.user_id === user.id ? 'You' : 'Connected User'
            }))
            
            // Merge with local runways, avoiding duplicates
            const mergedRunways = [...localRunways]
            dbRunwaysFormatted.forEach(dbRwy => {
              // Check if already exists (by name or id)
              const existingIndex = mergedRunways.findIndex(localRwy => 
                localRwy.id === dbRwy.id || 
                (localRwy.name === dbRwy.name && localRwy.threshold?.lat === dbRwy.threshold?.lat)
              )
              if (existingIndex >= 0) {
                // Replace localStorage version with database version (has fromDatabase flag)
                mergedRunways[existingIndex] = dbRwy
              } else {
                mergedRunways.push(dbRwy)
              }
            })
            
            return mergedRunways
          }
        }
      } catch (error) {
        console.error('Error loading runways from database:', error)
      }
    }
    
    return localRunways
  } catch (error) {
    console.error('Error loading custom runways:', error)
    return []
  }
}

// Save custom runways to localStorage
export function saveCustomRunways(runways) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runways))
    return true
  } catch (error) {
    console.error('Error saving custom runways:', error)
    return false
  }
}

// Save to Supabase (optional, for cloud sync)
async function saveRunwayToDatabase(userId, runwayData) {
  try {
    const { error } = await supabase
      .from('custom_runways')
      .upsert({
        user_id: userId,
        runway_name: runwayData.name,
        runway_data: runwayData,
        created_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,runway_name'
      })
    
    if (error) {
      console.error('Error saving runway to database:', error)
      return { ok: false, error }
    }
    return { ok: true, error: null }
  } catch (error) {
    console.error('Error saving runway to database:', error)
    return { ok: false, error }
  }
}

export default function RunwayCalibration({ user, onComplete, onCancel }) {
  const { connected, data } = useWebSocket(user.id)
  const [step, setStep] = useState('instructions') // instructions, record_threshold, record_opposite, confirm
  const [runwayName, setRunwayName] = useState('')
  const [runwayHeading, setRunwayHeading] = useState('')
  const [threshold, setThreshold] = useState(null)
  const [oppositeEnd, setOppositeEnd] = useState(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (step === 'record_threshold' && data && data.lat && data.lon) {
      setMessage(`Position: ${data.lat.toFixed(6)}, ${data.lon.toFixed(6)}`)
    } else if (step === 'record_opposite' && data && data.lat && data.lon) {
      setMessage(`Position: ${data.lat.toFixed(6)}, ${data.lon.toFixed(6)}`)
    }
  }, [data, step])

  function startCalibration() {
    if (!runwayName.trim()) {
      alert('Please enter a runway name (e.g., "KJKA 27")')
      return
    }
    if (!runwayHeading || isNaN(runwayHeading) || runwayHeading < 0 || runwayHeading >= 360) {
      alert('Please enter a valid runway heading (0-359 degrees)')
      return
    }
    setStep('record_threshold')
    setMessage('Position your aircraft at the THRESHOLD (approach end) of the runway, then click "Record Threshold"')
  }

  function recordThreshold() {
    if (!data || !data.lat || !data.lon) {
      alert('No position data available. Make sure MSFS is connected.')
      return
    }
    
    setThreshold({
      lat: data.lat,
      lon: data.lon,
      elevation: data.alt_ft || 0,
      heading: parseFloat(runwayHeading)
    })
    setStep('record_opposite')
    setMessage('Now drive/taxi to the OPPOSITE END of the runway, then click "Record Opposite End"')
  }

  function recordOppositeEnd() {
    if (!data || !data.lat || !data.lon) {
      alert('No position data available. Make sure MSFS is connected.')
      return
    }
    
    if (!threshold) {
      alert('Threshold not recorded. Please start over.')
      return
    }

    // Calculate distance to ensure it's reasonable
    const distance = calculateDistance(
      threshold.lat, threshold.lon,
      data.lat, data.lon
    )
    
    if (distance < 0.1) {
      alert('The opposite end is too close to the threshold. Please move further away.')
      return
    }
    
    if (distance > 5) {
      alert('The opposite end seems too far away (>5 NM). Please verify you\'re at the correct end.')
      return
    }

    setOppositeEnd({
      lat: data.lat,
      lon: data.lon,
      elevation: data.alt_ft || 0
    })
    setStep('confirm')
    setMessage('Review the runway data below, then click "Save Runway"')
  }

  function calculateDistance(lat1, lon1, lat2, lon2) {
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

  function calculateBearing(lat1, lon1, lat2, lon2) {
    const dLon = (lon2 - lon1) * Math.PI / 180
    const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180)
    const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
             Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon)
    const bearing = Math.atan2(y, x) * 180 / Math.PI
    return (bearing + 360) % 360
  }

  async function saveRunway() {
    if (!threshold || !oppositeEnd) {
      alert('Missing runway data')
      return
    }

    try {
      const distanceNM = calculateDistance(
        threshold.lat, threshold.lon,
        oppositeEnd.lat, oppositeEnd.lon
      )
      const distanceFeet = distanceNM * 6076
      const calculatedHeading = calculateBearing(
        threshold.lat, threshold.lon,
        oppositeEnd.lat, oppositeEnd.lon
      )

      const runwayData = {
        id: `custom_${Date.now()}`,
        name: runwayName.trim(),
        heading: parseFloat(runwayHeading),
        calculatedHeading: Math.round(calculatedHeading),
        threshold: {
          lat: threshold.lat,
          lon: threshold.lon,
          elevation: threshold.elevation
        },
        oppositeEnd: {
          lat: oppositeEnd.lat,
          lon: oppositeEnd.lon,
          elevation: oppositeEnd.elevation
        },
        length: Math.round(distanceFeet),
        width: 100,
        createdAt: new Date().toISOString()
      }

      const stored = localStorage.getItem(STORAGE_KEY)
      const customRunways = stored ? JSON.parse(stored) : []
      customRunways.push(runwayData)
      const savedLocal = saveCustomRunways(customRunways)
      if (!savedLocal) {
        alert('Unable to save runway locally (localStorage error)')
        return
      }

      if (user) {
        const result = await saveRunwayToDatabase(user.id, runwayData)
        if (!result.ok) {
          alert(result.error?.message || 'Unable to save runway to Supabase')
        }
      }

      if (onComplete) {
        onComplete(runwayData)
      }
    } catch (e) {
      alert(e?.message || 'Unable to save runway')
    }
  }

  function reset() {
    setStep('instructions')
    setThreshold(null)
    setOppositeEnd(null)
    setMessage('')
  }

  const distance = threshold && oppositeEnd
    ? calculateDistance(threshold.lat, threshold.lon, oppositeEnd.lat, oppositeEnd.lon)
    : null

  return (
    <div className="runway-calibration">
      <div className="calibration-container">
        <h2>Calibrate Custom Runway</h2>
        <p className="subtitle">Record runway endpoints using MSFS coordinates</p>

        {step === 'instructions' && (
          <div className="calibration-step">
            <h3>Instructions</h3>
            <ol className="instructions-list">
              <li>Enter a name for this runway (e.g., "KJKA 27")</li>
              <li>Enter the runway heading in degrees (e.g., 270 for Runway 27)</li>
              <li>Position your aircraft at the <strong>threshold</strong> (approach end) of the runway</li>
              <li>Click "Record Threshold"</li>
              <li><strong>Drive straight down the runway</strong> to the opposite end (no turning needed)</li>
              <li>When you reach the far end, click "Stop Recording"</li>
              <li>Review and save</li>
            </ol>

            <div className="input-group">
              <label>
                Runway Name
                <input
                  type="text"
                  value={runwayName}
                  onChange={(e) => setRunwayName(e.target.value)}
                  placeholder="e.g., KJKA 27"
                />
              </label>
            </div>

            <div className="input-group">
              <label>
                Runway Heading (degrees)
                <input
                  type="number"
                  value={runwayHeading}
                  onChange={(e) => setRunwayHeading(e.target.value)}
                  placeholder="270"
                  min="0"
                  max="359"
                />
              </label>
            </div>

            <div className="button-group">
              <button className="btn-primary" onClick={startCalibration} disabled={!connected}>
                Start Calibration
              </button>
              <button className="btn-cancel" onClick={onCancel}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {step === 'record_threshold' && (
          <div className="calibration-step">
            <h3>Step 1: Record Threshold</h3>
            <p className="instruction-text">
              Position your aircraft at the <strong>threshold</strong> (approach end) of the runway.
              This is where you would touch down when landing.
            </p>
            
            {data && data.lat && (
              <div className="position-display">
                <div className="position-item">
                  <span className="label">Latitude:</span>
                  <span className="value">{data.lat.toFixed(6)}</span>
                </div>
                <div className="position-item">
                  <span className="label">Longitude:</span>
                  <span className="value">{data.lon.toFixed(6)}</span>
                </div>
                <div className="position-item">
                  <span className="label">Altitude:</span>
                  <span className="value">{Math.round(data.alt_ft || 0)} ft</span>
                </div>
              </div>
            )}

            <div className="button-group">
              <button className="btn-primary" onClick={recordThreshold} disabled={!data || !data.lat}>
                Record Threshold
              </button>
              <button className="btn-secondary" onClick={reset}>
                Start Over
              </button>
              <button className="btn-cancel" onClick={onCancel}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {step === 'record_opposite' && (
          <div className="calibration-step">
            <h3>Step 2: Drive to Opposite End</h3>
            <p className="instruction-text">
              <strong>Drive straight down the runway</strong> to the opposite end (no need to turn around).
              The system is tracking your position. When you reach the far end, click <strong>"Stop Recording"</strong>.
            </p>
            
            {data && data.lat && threshold && (
              <>
                <div className="position-display">
                  <div className="position-item">
                    <span className="label">Latitude:</span>
                    <span className="value">{data.lat.toFixed(6)}</span>
                  </div>
                  <div className="position-item">
                    <span className="label">Longitude:</span>
                    <span className="value">{data.lon.toFixed(6)}</span>
                  </div>
                  <div className="position-item">
                    <span className="label">Distance from threshold:</span>
                    <span className="value">
                      {calculateDistance(threshold.lat, threshold.lon, data.lat, data.lon).toFixed(2)} NM
                    </span>
                  </div>
                  <div className="position-item">
                    <span className="label">Distance in feet:</span>
                    <span className="value">
                      {Math.round(calculateDistance(threshold.lat, threshold.lon, data.lat, data.lon) * 6076)} ft
                    </span>
                  </div>
                </div>
              </>
            )}

            <div className="button-group">
              <button className="btn-primary" onClick={recordOppositeEnd} disabled={!data || !data.lat}>
                Stop Recording
              </button>
              <button className="btn-secondary" onClick={reset}>
                Start Over
              </button>
              <button className="btn-cancel" onClick={onCancel}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {step === 'confirm' && threshold && oppositeEnd && (
          <div className="calibration-step">
            <h3>Confirm Runway Data</h3>
            
            <div className="runway-summary">
              <div className="summary-item">
                <span className="label">Name:</span>
                <span className="value">{runwayName}</span>
              </div>
              <div className="summary-item">
                <span className="label">Heading:</span>
                <span className="value">{runwayHeading}°</span>
              </div>
              <div className="summary-item">
                <span className="label">Length:</span>
                <span className="value">
                  {distance ? `${(distance * 6076).toFixed(0)} ft (${distance.toFixed(2)} NM)` : 'Calculating...'}
                </span>
              </div>
              <div className="summary-item">
                <span className="label">Threshold:</span>
                <span className="value">
                  {threshold.lat.toFixed(6)}, {threshold.lon.toFixed(6)}
                </span>
              </div>
              <div className="summary-item">
                <span className="label">Opposite End:</span>
                <span className="value">
                  {oppositeEnd.lat.toFixed(6)}, {oppositeEnd.lon.toFixed(6)}
                </span>
              </div>
            </div>

            <div className="button-group">
              <button className="btn-primary" onClick={saveRunway}>
                Save Runway
              </button>
              <button className="btn-secondary" onClick={reset}>
                Start Over
              </button>
              <button className="btn-cancel" onClick={onCancel}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {message && (
          <div className="message-box">
            {message}
          </div>
        )}

        {!connected && (
          <div className="warning-box">
            ⚠️ Not connected to MSFS. Make sure the bridge is running and connected.
          </div>
        )}
      </div>
    </div>
  )
}

