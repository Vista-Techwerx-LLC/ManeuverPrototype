import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const CLOUD_WS_URL = import.meta.env.VITE_CLOUD_WS_URL || 'wss://your-relay-server.railway.app'

export function useWebSocket(userId) {
  const [connected, setConnected] = useState(false)
  const [data, setData] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const wsRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)

  // Get session ID from Supabase
  useEffect(() => {
    if (!userId) return

    const getSessionId = async () => {
      try {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('session_id')
          .eq('user_id', userId)
          .single()

        if (profile?.session_id) {
          setSessionId(profile.session_id)
        } else {
          // Fallback: generate from user ID
          const fallbackSessionId = `user_${userId.substring(0, 8)}`
          setSessionId(fallbackSessionId)
        }
      } catch (error) {
        console.error('Error getting session ID:', error)
        // Fallback: generate from user ID
        const fallbackSessionId = `user_${userId.substring(0, 8)}`
        setSessionId(fallbackSessionId)
      }
    }

    getSessionId()
  }, [userId])

  // Connect WebSocket when we have a session ID
  useEffect(() => {
    if (!userId || !sessionId) {
      console.log('WebSocket: Waiting for userId or sessionId', { userId, sessionId })
      return
    }

    const wsUrl = `${CLOUD_WS_URL}?role=client&sessionId=${sessionId}`
    console.log('WebSocket: Connecting...', {
      url: wsUrl,
      sessionId,
      cloudWsUrl: CLOUD_WS_URL
    })

    const connect = () => {
      try {
        const ws = new WebSocket(wsUrl)
        wsRef.current = ws

        ws.onopen = () => {
          console.log('✅ WebSocket connected successfully')
          setConnected(true)
        }

        ws.onmessage = async (event) => {
          try {
            // Handle both text and Blob messages
            let messageText
            if (event.data instanceof Blob) {
              messageText = await event.data.text()
            } else {
              messageText = event.data
            }
            
            const message = JSON.parse(messageText)
            
            // Handle connection status messages
            if (message.type === 'connected') {
              console.log('Session confirmed:', message.sessionId)
              console.log('Has bridge:', message.hasBridge)
              if (message.lastData) {
                console.log('Received last data on connect:', message.lastData)
                setData(message.lastData)
              }
              return
            }
            
            if (message.type === 'bridge_disconnected') {
              console.log('Bridge disconnected')
              setConnected(false)
              return
            }

            // Handle telemetry data
            console.log('Received telemetry data:', message)
            setData(message)
          } catch (error) {
            console.error('Error parsing WebSocket message:', error)
          }
        }

        ws.onerror = (error) => {
          console.error('❌ WebSocket error:', error)
          console.error('Failed URL:', wsUrl)
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
  }, [userId, sessionId])

  return { connected, data }
}


