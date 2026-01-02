import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useWebSocket } from '../hooks/useWebSocket'
import { getBridgeDownloadUrl } from '../utils/storage'
import './Dashboard.css'
import './Telemetry.css'

export default function Dashboard({ user }) {
  const [sessionId, setSessionId] = useState('')
  const [loading, setLoading] = useState(true)
  const [isSetupCollapsed, setIsSetupCollapsed] = useState(false)
  const [bridgeDownloadUrl, setBridgeDownloadUrl] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const { connected, data } = useWebSocket(user.id)
  const worldRef = useRef(null)

  useEffect(() => {
    // Get or create user session ID
    const getUserSession = async () => {
      try {
        // Check if user has a session ID in their profile
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('session_id')
          .eq('user_id', user.id)
          .single()

        if (profile?.session_id) {
          setSessionId(profile.session_id)
        } else {
          // Create a unique session ID based on user ID
          const newSessionId = `user_${user.id.substring(0, 8)}`
          
          // Save to database
          await supabase
            .from('user_profiles')
            .upsert({
              user_id: user.id,
              session_id: newSessionId,
              email: user.email,
              created_at: new Date().toISOString()
            })

          setSessionId(newSessionId)
        }
      } catch (error) {
        console.error('Error getting user session:', error)
        // Fallback to user ID based session
        setSessionId(`user_${user.id.substring(0, 8)}`)
      } finally {
        setLoading(false)
      }
    }

    getUserSession()
  }, [user])

  useEffect(() => {
    // Get the download URL for MSFS-Bridge.exe
    const fetchDownloadUrl = async () => {
      const url = await getBridgeDownloadUrl()
      setBridgeDownloadUrl(url)
    }
    
    fetchDownloadUrl()
  }, [])

  useEffect(() => {
    if (data && worldRef.current) {
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

  const handleDownloadBridge = async () => {
    if (!bridgeDownloadUrl) {
      console.error('Download URL not available')
      return
    }

    setDownloading(true)
    try {
      // Create a temporary anchor element to trigger download
      const link = document.createElement('a')
      link.href = bridgeDownloadUrl
      link.download = 'MSFS-Bridge.exe'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error('Error downloading file:', error)
      // Fallback: open in new tab
      window.open(bridgeDownloadUrl, '_blank')
    } finally {
      setDownloading(false)
    }
  }

  if (loading) {
    return <div className="dashboard-loading">Loading...</div>
  }

  return (
    <div className="dashboard">
      <div className="dashboard-container">
        <h1>Welcome, {user.email}!</h1>
        <p className="dashboard-subtitle">
          Your personal MSFS Maneuver Tracker dashboard
        </p>

        <div className="dashboard-cards">
          


          <div className="dashboard-card setup-instructions-card">
            <div className="setup-instructions-header">
              <h2>Setup Instructions</h2>
              <button 
                className="collapse-toggle"
                onClick={() => setIsSetupCollapsed(!isSetupCollapsed)}
                aria-label={isSetupCollapsed ? 'Expand' : 'Collapse'}
              >
                <span className={`collapse-icon ${isSetupCollapsed ? 'collapsed' : ''}`}>▼</span>
              </button>
            </div>
            <div className={`setup-instructions-content ${isSetupCollapsed ? 'collapsed' : ''}`}>
              <ol className="setup-steps">
                <li>
                  <strong>Download the Bridge:</strong> 
                  {bridgeDownloadUrl ? (
                    <button 
                      onClick={handleDownloadBridge}
                      disabled={downloading}
                      className="download-bridge-btn"
                    >
                      {downloading ? '⏳ Downloading...' : '⬇ Download MSFS-Bridge.exe'}
                    </button>
                  ) : (
                    <span className="download-placeholder">
                      (Download link will appear here)
                    </span>
                  )}
                </li>
                <li>
                  <strong>Run the bridge:</strong> Double-click <code>MSFS-Bridge.exe</code>
                </li>
                <li>
                  <strong>Connect your account:</strong> When the dialog appears, paste your Session ID:
                  <div className="config-example">
                    <code>{sessionId}</code>
                    <button 
                      onClick={() => navigator.clipboard.writeText(sessionId)}
                      className="copy-btn"
                    >
                      Copy Session ID
                    </button>
                  </div>
                </li>
                <li>
                  <strong>Click Connect:</strong> The bridge will save your Session ID and connect automatically
                </li>
                <li>
                  <strong>Start MSFS:</strong> Launch Microsoft Flight Simulator and load into a flight
                </li>
                <li>
                  <strong>View data:</strong> Open any tracker page here to see live data!
                </li>
              </ol>
              <p style={{marginTop: '16px', color: 'var(--text-muted)', fontSize: '13px'}}>
                💡 <strong>Tip:</strong> The bridge remembers your Session ID, so you only need to enter it once!
              </p>
            </div>
          </div>

          <div className="dashboard-card telemetry-card">
            <h2>Live Telemetry</h2>
            <p className="dashboard-subtitle" style={{ marginTop: '8px', marginBottom: '16px' }}>
              Real-time flight data from Microsoft Flight Simulator
            </p>

            <div className="telemetry-status">
              <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`}></span>
              <span>{connected ? 'Connected' : 'Disconnected - Start your bridge client'}</span>
            </div>

            <div className="telemetry-content">
              <div className="instrument-card">
                <h3>Attitude Indicator</h3>
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
                <h3>Live Readouts</h3>
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
      </div>
    </div>
  )
}

