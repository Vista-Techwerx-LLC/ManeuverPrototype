import { useState, useEffect, useRef } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import './Telemetry.css'

export default function Telemetry({ user }) {
  const { connected, data } = useWebSocket(user.id)
  const worldRef = useRef(null)

  useEffect(() => {
    if (data && worldRef.current) {
      // Use requestAnimationFrame for smooth animations
      requestAnimationFrame(() => {
        if (worldRef.current) {
          const pitch = data.pitch_deg || 0
          const bank = data.bank_deg || 0
          const pitchPx = -pitch * 3
          const bankDeg = -bank

          worldRef.current.style.transform = 
            `translate(-50%, -50%) rotate(${bankDeg}deg) translateY(${pitchPx}px)`
        }
      })
    }
  }, [data])

  const fmt = (n, digits = 1) => {
    if (n === null || n === undefined || Number.isNaN(n)) return "—"
    return Number(n).toFixed(digits)
  }

  return (
    <div className="telemetry-page">
      <div className="telemetry-container">
        <h1>Live Telemetry</h1>
        <p className="subtitle">Real-time flight data from Microsoft Flight Simulator</p>

        <div className="telemetry-status">
          <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`}></span>
          <span>{connected ? 'Connected' : 'Disconnected - Start your bridge client'}</span>
        </div>

        <div className="telemetry-content">
          <div className="instrument-card">
            <h2>Attitude Indicator</h2>
            <div className="horizon-wrap">
              <div ref={worldRef} className="world">
                <div className="sky"></div>
                <div className="ground"></div>
                <div className="horizon-line"></div>
              </div>
              <div className="aircraft">
                <div className="wing left"></div>
                <div className="wing right"></div>
                <div className="center"></div>
              </div>
            </div>
          </div>

          <div className="readouts-card">
            <h2>Live Readouts</h2>
            <div className="readouts-grid">
              <div>Pitch</div><div>{fmt(data?.pitch_deg)}°</div>
              <div>Bank</div><div>{fmt(data?.bank_deg)}°</div>
              <div>Heading</div><div>{fmt(data?.hdg_true, 0)}°</div>
              <div>IAS</div><div>{fmt(data?.ias_kt, 0)} kt</div>
              <div>Altitude</div><div>{fmt(data?.alt_ft, 0)} ft</div>
              <div>VS</div><div>{fmt(data?.vs_fpm, 0)} fpm</div>
              <div>On Ground</div><div>{data?.on_ground ? 'Yes' : 'No'}</div>
              <div>G-Force</div><div>{fmt(data?.g_force, 2)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


