import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('React Error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          padding: '40px', 
          fontFamily: 'system-ui', 
          maxWidth: '600px', 
          margin: '50px auto',
          background: '#fff',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <h1 style={{ color: '#d32f2f', marginTop: 0 }}>⚠️ Application Error</h1>
          <p style={{ color: '#666' }}>Something went wrong loading the application.</p>
          <details style={{ marginTop: '20px' }}>
            <summary style={{ cursor: 'pointer', color: '#1976d2' }}>Error Details</summary>
            <pre style={{ 
              background: '#f5f5f5', 
              padding: '15px', 
              borderRadius: '4px',
              overflow: 'auto',
              marginTop: '10px'
            }}>
              {this.state.error?.toString()}
              {this.state.error?.stack}
            </pre>
          </details>
          <button 
            onClick={() => window.location.reload()} 
            style={{
              marginTop: '20px',
              padding: '10px 20px',
              background: '#1976d2',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '16px'
            }}
          >
            Reload Page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

console.log('🚀 Starting application...')
console.log('Environment:', {
  PROD: import.meta.env.PROD,
  MODE: import.meta.env.MODE,
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL ? '✓ Set' : '✗ Missing',
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY ? '✓ Set' : '✗ Missing',
  VITE_CLOUD_WS_URL: import.meta.env.VITE_CLOUD_WS_URL ? '✓ Set' : '✗ Missing'
})

try {
  const rootElement = document.getElementById('root')
  if (!rootElement) {
    throw new Error('Root element not found!')
  }
  
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  )
  console.log('✅ Application rendered successfully')
} catch (error) {
  console.error('❌ Failed to render app:', error)
  const rootElement = document.getElementById('root')
  if (rootElement) {
    rootElement.innerHTML = `
      <div style="padding: 40px; font-family: system-ui; text-align: center; max-width: 600px; margin: 50px auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <h1 style="color: #d32f2f; margin-top: 0;">⚠️ Failed to Load Application</h1>
        <p style="color: #666;">${error.message}</p>
        <details style="margin-top: 20px; text-align: left;">
          <summary style="cursor: pointer; color: #1976d2;">Stack Trace</summary>
          <pre style="background: #f5f5f5; padding: 15px; border-radius: 4px; overflow: auto; margin-top: 10px; font-size: 12px;">${error.stack || 'No stack trace available'}</pre>
        </details>
        <button onclick="window.location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #1976d2; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px;">
          Reload Page
        </button>
      </div>
    `
  }
}


