import { useState, useEffect, useRef } from 'react'
import ApproachPath from './ApproachPath'
import { GLIDEPATH, calculateDistance } from '../utils/landingStandards'
import './ApproachPathReplay.css'

export default function ApproachPathReplay({ runway, flightPath, referencePath }) {
  const [replayIndex, setReplayIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(2.0)
  const animationFrameRef = useRef(null)
  const lastTimeRef = useRef(null)
  const currentTimeRef = useRef(0)
  const replayIndexRef = useRef(0)
  const playbackSpeedRef = useRef(2.0)
  const isPlayingRef = useRef(false)

  useEffect(() => {
    replayIndexRef.current = replayIndex
  }, [replayIndex])

  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed
  }, [playbackSpeed])

  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  useEffect(() => {
    if (!isPlaying || !flightPath || flightPath.length === 0) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      lastTimeRef.current = null
      return
    }

    const startTimestamp = flightPath[0]?.timestamp || Date.now()
    const endTimestamp = flightPath[flightPath.length - 1]?.timestamp || startTimestamp + 10000
    const totalDuration = Math.max(1, endTimestamp - startTimestamp)

    const animate = (currentTime) => {
      if (!isPlayingRef.current) {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current)
          animationFrameRef.current = null
        }
        return
      }

      if (lastTimeRef.current === null) {
        lastTimeRef.current = currentTime
        const currentPointTimestamp = flightPath[replayIndexRef.current]?.timestamp || startTimestamp
        currentTimeRef.current = currentPointTimestamp - startTimestamp
      }

      const deltaTime = Math.min(currentTime - lastTimeRef.current, 100)
      const deltaTimeSeconds = deltaTime / 1000
      currentTimeRef.current += deltaTimeSeconds * 1000 * playbackSpeedRef.current
      lastTimeRef.current = currentTime

      const targetTimestamp = startTimestamp + currentTimeRef.current
      
      let newIndex = replayIndexRef.current
      for (let i = replayIndexRef.current; i < flightPath.length; i++) {
        if (flightPath[i].timestamp >= targetTimestamp) {
          newIndex = i
          break
        }
        if (i === flightPath.length - 1) {
          newIndex = i
        }
      }

      if (newIndex !== replayIndexRef.current) {
        replayIndexRef.current = newIndex
        setReplayIndex(newIndex)
      }

      if (currentTimeRef.current < totalDuration && isPlayingRef.current) {
        animationFrameRef.current = requestAnimationFrame(animate)
      } else {
        setIsPlaying(false)
        replayIndexRef.current = flightPath.length - 1
        setReplayIndex(flightPath.length - 1)
        currentTimeRef.current = totalDuration
        lastTimeRef.current = null
      }
    }

    animationFrameRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [isPlaying, flightPath])

  const togglePlay = (e) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    if (!isPlaying) {
      lastTimeRef.current = null
      setIsPlaying(true)
    } else {
      setIsPlaying(false)
    }
  }

  const reset = (e) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    setIsPlaying(false)
    setReplayIndex(0)
    currentTimeRef.current = 0
    lastTimeRef.current = null
    replayIndexRef.current = 0
  }

  const seek = (progress) => {
    if (!flightPath || flightPath.length === 0) return
    const clampedProgress = Math.max(0, Math.min(1, progress))
    const index = Math.floor(clampedProgress * (flightPath.length - 1))
    setReplayIndex(index)
    replayIndexRef.current = index
    const startTimestamp = flightPath[0]?.timestamp || Date.now()
    const endTimestamp = flightPath[flightPath.length - 1]?.timestamp || startTimestamp + 10000
    currentTimeRef.current = clampedProgress * (endTimestamp - startTimestamp)
    lastTimeRef.current = null
    setIsPlaying(false)
  }

  const currentProgress = flightPath && flightPath.length > 0 
    ? replayIndex / (flightPath.length - 1)
    : 0

  const progressBarRef = useRef(null)
  const progressBarFillRef = useRef(null)

  const handleProgressBarClick = (e) => {
    if (!progressBarRef.current || !flightPath || flightPath.length === 0) return
    const rect = progressBarRef.current.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const progress = Math.max(0, Math.min(1, clickX / rect.width))
    seek(progress)
  }

  if (!runway || !flightPath || flightPath.length === 0) {
    return null
  }

  const currentPoint = flightPath[replayIndex]
  const aircraftData = currentPoint ? {
    lat: currentPoint.lat,
    lon: currentPoint.lon,
    alt_ft: currentPoint.alt,
    hdg_true: currentPoint.heading,
    bank_deg: currentPoint.bank,
    pitch_deg: currentPoint.pitch,
    ias_kt: currentPoint.airspeed,
    vs_fpm: currentPoint.vs_fpm
  } : null

  const getAltitudeGuideClass = (deviation) => {
    if (Math.abs(deviation) <= 100) return 'good'
    if (Math.abs(deviation) <= 200) return 'warning'
    return 'bad'
  }

  const getBankGuideClass = (bank) => {
    const absBank = Math.abs(bank)
    if (absBank <= 5) return 'good'
    if (absBank <= 10) return 'warning'
    return 'bad'
  }

  const calculateGlidepathDeviation = () => {
    if (!currentPoint || !runway?.threshold) {
      return 0
    }
    if (currentPoint.lat == null || currentPoint.lon == null) {
      return 0
    }
    const currentAlt = currentPoint.alt || currentPoint.alt_ft || 0
    const R = 6371
    const dLat = (runway.threshold.lat - currentPoint.lat) * Math.PI / 180
    const dLon = (runway.threshold.lon - currentPoint.lon) * Math.PI / 180
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(currentPoint.lat * Math.PI / 180) * Math.cos(runway.threshold.lat * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    const distanceNM = R * c * 0.539957
    const targetAlt = GLIDEPATH.getTargetAltitude(distanceNM)
    return currentAlt - targetAlt.msl
  }

  const altitudeDeviation = calculateGlidepathDeviation()
  const altitudeGuideClass = currentPoint ? getAltitudeGuideClass(altitudeDeviation) : ''
  const bankGuideClass = currentPoint ? getBankGuideClass(currentPoint.bank || 0) : ''
  
  const distanceToThreshold = currentPoint && runway?.threshold && currentPoint.lat != null && currentPoint.lon != null
    ? calculateDistance(
        currentPoint.lat, currentPoint.lon,
        runway.threshold.lat, runway.threshold.lon
      )
    : null

  return (
    <div className="approach-path-replay">
      <div className="replay-controls-bar">
        <button 
          className="replay-control-btn" 
          onClick={togglePlay}
          title={isPlaying ? 'Pause' : 'Play'}
          type="button"
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button 
          className="replay-control-btn" 
          onClick={reset}
          title="Reset"
          type="button"
        >
          ⏮
        </button>
        <div className="replay-speed-control">
          <label className="replay-speed-label" title="Playback Speed">
            ⚡
          </label>
          <input
            type="range"
            min="0.25"
            max="4"
            step="0.25"
            value={playbackSpeed}
            onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
            className="replay-speed-slider"
            title={`${playbackSpeed}x speed`}
          />
          <span className="replay-speed-value">{playbackSpeed}x</span>
        </div>
        <div 
          className="replay-progress"
          ref={progressBarRef}
          onClick={handleProgressBarClick}
        >
          <div 
            ref={progressBarFillRef}
            className="replay-progress-bar" 
            style={{ width: `${currentProgress * 100}%` }}
          />
        </div>
        {currentPoint && (
          <div className="replay-live-data">
            <div className="replay-live-data-item">
              <span className="replay-live-data-label">Height:</span>
              <span className={`replay-live-data-value ${altitudeGuideClass}`}>
                {(altitudeDeviation >= 0 ? '+' : '') + Math.round(altitudeDeviation)} ft
              </span>
            </div>
            <div className="replay-live-data-item">
              <span className="replay-live-data-label">Bank:</span>
              <span className={`replay-live-data-value ${bankGuideClass}`}>
                {Math.round(currentPoint.bank || 0)}°
              </span>
            </div>
          </div>
        )}
      </div>
      <ApproachPath
        runway={runway}
        aircraftData={aircraftData}
        flightPath={flightPath}
        currentPhase={null}
        glidepathDeviation={altitudeDeviation}
        distanceToThreshold={distanceToThreshold}
        selectedLandingPath={referencePath}
        replayIndex={replayIndex}
        isReplayMode={true}
      />
    </div>
  )
}

