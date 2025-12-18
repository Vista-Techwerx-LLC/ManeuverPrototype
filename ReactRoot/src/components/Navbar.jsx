import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import './Navbar.css'

export default function Navbar({ user }) {
  const location = useLocation()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  const isActive = (path) => location.pathname === path

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/dashboard" className="navbar-brand">
          ✈️ MSFS Maneuver Tracker
        </Link>
        
        <div className="navbar-links">
          <Link 
            to="/dashboard" 
            className={isActive('/dashboard') ? 'active' : ''}
          >
            Dashboard
          </Link>
          <Link 
            to="/telemetry" 
            className={isActive('/telemetry') ? 'active' : ''}
          >
            Telemetry
          </Link>
          <Link 
            to="/steep-turn" 
            className={isActive('/steep-turn') ? 'active' : ''}
          >
            Steep Turn
          </Link>
          <Link 
            to="/slow-flight" 
            className={isActive('/slow-flight') ? 'active' : ''}
          >
            Slow Flight
          </Link>
          <Link 
            to="/history" 
            className={isActive('/history') ? 'active' : ''}
          >
            History
          </Link>
          <Link 
            to="/friends" 
            className={isActive('/friends') ? 'active' : ''}
          >
            Friends
          </Link>
        </div>

        <div className="navbar-user">
          <span className="user-email">{user?.email}</span>
          <button onClick={handleSignOut} className="sign-out-btn">
            Sign Out
          </button>
        </div>
      </div>
    </nav>
  )
}


