import { useState, useEffect, useRef } from 'react'

const CLOUD_WS_URL = import.meta.env.VITE_CLOUD_WS_URL || 'wss://your-relay-server.railway.app'

export function useWebSocket(userId) {
  const [connected, setConnected] = useState(false)
  const [data, setData] = useState(null)
  const wsRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)

  useEffect(() => {
    if (!userId) return

    // Get user session ID from localStorage or use user ID
    const sessionId = localStorage.getItem(`session_${userId}`) || `user_${userId.substring(0, 8)}`
    const wsUrl = `${CLOUD_WS_URL}?role=client&sessionId=${sessionId}`

    const connect = () => {
      try {
        const ws = new WebSocket(wsUrl)
        wsRef.current = ws

        ws.onopen = () => {
          console.log('WebSocket connected')
          setConnected(true)
        }

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            
            // Handle connection status messages
            if (message.type === 'connected') {
              console.log('Session confirmed:', message.sessionId)
              return
            }
            
            if (message.type === 'bridge_disconnected') {
              setConnected(false)
              return
            }

            // Handle telemetry data
            setData(message)
          } catch (error) {
            console.error('Error parsing WebSocket message:', error)
          }
        }

        ws.onerror = (error) => {
          console.error('WebSocket error:', error)
          setConnected(false)
        }

        ws.onclose = () => {
          console.log('WebSocket closed')
          setConnected(false)
          
          // Reconnect after delay
          reconnectTimeoutRef.current = setTimeout(() => {
            connect()
          }, 2000)
        }
      } catch (error) {
        console.error('Error creating WebSocket:', error)
        setConnected(false)
      }
    }

    connect()

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [userId])

  return { connected, data }
}


