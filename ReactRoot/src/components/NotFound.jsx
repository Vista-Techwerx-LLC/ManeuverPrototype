import { Link } from 'react-router-dom'
import './NotFound.css'

export default function NotFound() {
  return (
    <div className="not-found-page">
      <div className="not-found-container">
        <h1 className="not-found-title">404</h1>
        <h2 className="not-found-subtitle">Page Not Found</h2>
        <p className="not-found-message">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="not-found-actions">
          <Link to="/dashboard" className="not-found-button primary">
            Go to Dashboard
          </Link>
          <Link to="/auth" className="not-found-button secondary">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  )
}

