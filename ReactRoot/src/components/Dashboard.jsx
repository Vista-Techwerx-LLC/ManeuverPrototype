import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import './Dashboard.css'

export default function Dashboard({ user }) {
  const [sessionId, setSessionId] = useState('')
  const [loading, setLoading] = useState(true)

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
          <div className="dashboard-card">
            <h2>Your Session ID</h2>
            <div className="session-id-box">
              <code>{sessionId}</code>
              <button 
                onClick={() => navigator.clipboard.writeText(sessionId)}
                className="copy-btn"
              >
                Copy
              </button>
            </div>
            <p className="session-hint">
              Copy this Session ID and paste it into the MSFS Bridge dialog when you run it.
              Your data is private to your account.
            </p>
          </div>

          <div className="dashboard-card">
            <h2>Quick Links</h2>
            <div className="quick-links">
              <Link to="/telemetry" className="quick-link">
                <span className="icon">📊</span>
                <div>
                  <strong>Live Telemetry</strong>
                  <p>Real-time flight data</p>
                </div>
              </Link>
              <Link to="/steep-turn" className="quick-link">
                <span className="icon">🔄</span>
                <div>
                  <strong>Steep Turn Tracker</strong>
                  <p>Practice steep turns</p>
                </div>
              </Link>
            </div>
          </div>

          <div className="dashboard-card">
            <h2>Setup Instructions</h2>
            <ol className="setup-steps">
              <li>
                <strong>Download the Bridge:</strong> Get <code>MSFS-Bridge.exe</code> from the releases page
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
      </div>
    </div>
  )
}

