import { useState, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import './Navbar.css'

export default function Navbar({ user }) {
  const location = useLocation()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  const isActive = (path) => location.pathname === path

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false)
      }
    }

    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [dropdownOpen])

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
            to="/landing" 
            className={isActive('/landing') ? 'active' : ''}
          >
            Landing
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

        <div className="navbar-user" ref={dropdownRef}>
          <button 
            className="user-menu-btn"
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            <span className="user-email">{user?.email}</span>
            <span className="dropdown-arrow">▼</span>
          </button>
          
          {dropdownOpen && (
            <div className="user-dropdown">
              <Link 
                to={`/view-student/${user.id}`}
                className="dropdown-item"
                onClick={() => setDropdownOpen(false)}
              >
                📊 My Progress
              </Link>
              <button 
                className="dropdown-item"
                onClick={() => {
                  setDropdownOpen(false)
                  handleSignOut()
                }}
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}


