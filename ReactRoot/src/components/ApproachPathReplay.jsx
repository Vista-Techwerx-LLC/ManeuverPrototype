import { useState, useEffect, useRef } from 'react'
import ApproachPath from './ApproachPath'
import './ApproachPathReplay.css'

export default function ApproachPathReplay({ runway, flightPath, referencePath }) {
  const [replayIndex, setReplayIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0)
  const animationFrameRef = useRef(null)
  const lastTimeRef = useRef(null)
  const currentTimeRef = useRef(0)
  const replayIndexRef = useRef(0)

  useEffect(() => {
    if (!isPlaying || !flightPath || flightPath.length === 0) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      return
    }

    const startTimestamp = flightPath[0]?.timestamp || Date.now()
    const endTimestamp = flightPath[flightPath.length - 1]?.timestamp || startTimestamp + 10000
    const totalDuration = Math.max(1, endTimestamp - startTimestamp)

    const animate = (currentTime) => {
      if (lastTimeRef.current === null) {
        lastTimeRef.current = currentTime
        currentTimeRef.current = (flightPath[replayIndexRef.current]?.timestamp || startTimestamp) - startTimestamp
      }

      const deltaTime = (currentTime - lastTimeRef.current) * playbackSpeed
      currentTimeRef.current += deltaTime
      lastTimeRef.current = currentTime

      const targetTimestamp = startTimestamp + currentTimeRef.current
      
      let newIndex = replayIndexRef.current
      for (let i = 0; i < flightPath.length; i++) {
        if (flightPath[i].timestamp >= targetTimestamp) {
          newIndex = i
          break
        }
        if (i === flightPath.length - 1) {
          newIndex = i
        }
      }

      replayIndexRef.current = newIndex
      setReplayIndex(newIndex)

      if (currentTimeRef.current < totalDuration) {
        animationFrameRef.current = requestAnimationFrame(animate)
      } else {
        setIsPlaying(false)
        replayIndexRef.current = flightPath.length - 1
        setReplayIndex(flightPath.length - 1)
        currentTimeRef.current = totalDuration
      }
    }

    animationFrameRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isPlaying, flightPath, playbackSpeed])

  const togglePlay = () => {
    if (!isPlaying) {
      lastTimeRef.current = null
      setIsPlaying(true)
    } else {
      setIsPlaying(false)
    }
  }

  const reset = () => {
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

  return (
    <div className="approach-path-replay">
      <div className="replay-controls">
        <button onClick={reset} className="replay-btn">⏮ Reset</button>
        <button onClick={togglePlay} className="replay-btn">
          {isPlaying ? '⏸ Pause' : '▶ Play'}
        </button>
        <div className="replay-speed">
          <label>Speed:</label>
          <select value={playbackSpeed} onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}>
            <option value={0.25}>0.25x</option>
            <option value={0.5}>0.5x</option>
            <option value={1.0}>1x</option>
            <option value={2.0}>2x</option>
            <option value={4.0}>4x</option>
          </select>
        </div>
        <div className="replay-progress">
          <input
            type="range"
            min="0"
            max="100"
            value={currentProgress * 100}
            onChange={(e) => seek(parseFloat(e.target.value) / 100)}
            className="replay-slider"
          />
          <span className="replay-time">
            {replayIndex + 1} / {flightPath.length}
          </span>
        </div>
      </div>
      <ApproachPath
        runway={runway}
        aircraftData={aircraftData}
        flightPath={flightPath}
        selectedLandingPath={referencePath}
        replayIndex={replayIndex}
        isReplayMode={true}
      />
    </div>
  )
}

