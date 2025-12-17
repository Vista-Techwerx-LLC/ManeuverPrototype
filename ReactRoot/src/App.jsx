import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import Auth from './components/Auth'
import Dashboard from './components/Dashboard'
import Telemetry from './components/Telemetry'
import SteepTurn from './components/SteepTurn'
import SlowFlight from './components/SlowFlight'
import Navbar from './components/Navbar'
import './App.css'

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    
    // Check if Supabase is configured
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn('⚠️ Supabase not configured - app will show error message')
      if (mounted) {
        setLoading(false)
      }
      return
    }
    
    // Check active session
    supabase.auth.getSession()
      .then(({ data: { session }, error }) => {
        if (error) {
          console.error('Error getting session:', error)
        }
        if (mounted) {
          setUser(session?.user ?? null)
          setLoading(false)
        }
      })
      .catch((error) => {
        console.error('Failed to get session:', error)
        if (mounted) {
          setLoading(false)
        }
      })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setUser(session?.user ?? null)
        setLoading(false)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  // Check if Supabase is configured
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  
  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        padding: '40px',
        fontFamily: 'system-ui',
        textAlign: 'center',
        maxWidth: '600px',
        margin: '0 auto'
      }}>
        <h1 style={{ color: '#d32f2f', marginTop: 0 }}>⚠️ Configuration Missing</h1>
        <p style={{ color: '#666', lineHeight: '1.6' }}>
          The Supabase environment variables are not configured for this deployment.
        </p>
        <div style={{ 
          background: '#f5f5f5', 
          padding: '20px', 
          borderRadius: '8px', 
          marginTop: '20px',
          textAlign: 'left',
          fontSize: '14px'
        }}>
          <p style={{ marginTop: 0, fontWeight: '600' }}>To fix this:</p>
          <ol style={{ marginBottom: 0 }}>
            <li>Go to your GitHub repository</li>
            <li>Settings → Secrets and variables → Actions</li>
            <li>Add these secrets:
              <ul>
                <li><code>VITE_SUPABASE_URL</code></li>
                <li><code>VITE_SUPABASE_ANON_KEY</code></li>
                <li><code>VITE_CLOUD_WS_URL</code></li>
              </ul>
            </li>
            <li>Re-run the GitHub Actions workflow</li>
          </ol>
        </div>
      </div>
    )
  }
  
  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        <div>Loading...</div>
      </div>
    )
  }

  const basename = import.meta.env.PROD ? '/ManeuverPrototype' : '/'
  
  // Debug: Log the basename being used
  if (import.meta.env.PROD) {
    console.log('Using basename:', basename)
    console.log('Current pathname:', window.location.pathname)
  }

  return (
    <Router basename={basename}>
      <div className="app">
        {user && <Navbar user={user} />}
        <Routes>
          <Route 
            path="/auth" 
            element={!user ? <Auth /> : <Navigate to="/dashboard" />} 
          />
          <Route 
            path="/dashboard" 
            element={user ? <Dashboard user={user} /> : <Navigate to="/auth" />} 
          />
          <Route 
            path="/telemetry" 
            element={user ? <Telemetry user={user} /> : <Navigate to="/auth" />} 
          />
          <Route 
            path="/steep-turn" 
            element={user ? <SteepTurn user={user} /> : <Navigate to="/auth" />} 
          />
          <Route 
            path="/slow-flight" 
            element={user ? <SlowFlight user={user} /> : <Navigate to="/auth" />} 
          />
          <Route 
            path="/" 
            element={user ? <Navigate to="/dashboard" /> : <Navigate to="/auth" />} 
          />
        </Routes>
      </div>
    </Router>
  )
}

export default App


