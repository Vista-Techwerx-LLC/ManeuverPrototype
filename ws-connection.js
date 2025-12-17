// WebSocket connection utility for MSFS Bridge
// Handles localhost, LAN, and cloud (GitHub Pages) connections

(function() {
  'use strict';

  // Configuration
  const CLOUD_WS_URL = 'wss://your-relay-server.railway.app'; // Change this to your deployed server
  const DEFAULT_SESSION_ID = 'default';

  // Get the WebSocket URL - tries localhost first, then cloud, then configured IP
  function getWebSocketURL() {
    // If on GitHub Pages or HTTPS, use cloud server
    if (window.location.protocol === 'https:' || 
        window.location.hostname.includes('github.io') ||
        window.location.hostname.includes('github.com')) {
      const sessionId = getSessionId();
      return `${CLOUD_WS_URL}?role=client&sessionId=${sessionId}`;
    }

    // If on localhost (same PC), use localhost
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'ws://127.0.0.1:8765';
    }

    // Check if we have a saved IP address
    const savedIP = localStorage.getItem('msfs-bridge-ip');
    if (savedIP) {
      return `ws://${savedIP}:8765`;
    }

    // Try to auto-detect from current page URL
    const hostname = window.location.hostname;
    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      // If accessing via IP address, use that
      const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (ipPattern.test(hostname)) {
        localStorage.setItem('msfs-bridge-ip', hostname);
        return `ws://${hostname}:8765`;
      }
    }

    // Default fallback - try cloud server
    const sessionId = getSessionId();
    return `${CLOUD_WS_URL}?role=client&sessionId=${sessionId}`;
  }

  function getSessionId() {
    // Get session ID from URL parameter, localStorage, or use default
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session') || 
                     localStorage.getItem('msfs-session-id') || 
                     DEFAULT_SESSION_ID;
    
    // Save for future use
    if (!localStorage.getItem('msfs-session-id')) {
      localStorage.setItem('msfs-session-id', sessionId);
    }
    
    return sessionId;
  }

  // Create a connection manager
  window.MSFSConnection = {
    url: null,
    ws: null,
    reconnectAttempts: 0,
    maxReconnectAttempts: 10,
    reconnectDelay: 2000,
    callbacks: {
      onopen: [],
      onmessage: [],
      onerror: [],
      onclose: []
    },

    // Initialize connection URL
    init: function() {
      this.url = getWebSocketURL();
      return this.url !== null;
    },

    // Get or prompt for PC IP address
    getPCIP: function() {
      const saved = localStorage.getItem('msfs-bridge-ip');
      if (saved) return saved;

      // Try to extract from current URL
      const hostname = window.location.hostname;
      const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (ipPattern.test(hostname)) {
        return hostname;
      }

      return null;
    },

    // Set PC IP address manually
    setPCIP: function(ip) {
      if (ip) {
        localStorage.setItem('msfs-bridge-ip', ip);
        this.url = `ws://${ip}:8765`;
        return true;
      }
      return false;
    },

    // Get current session ID
    getSessionId: function() {
      return getSessionId();
    },

    // Set session ID
    setSessionId: function(sessionId) {
      if (sessionId) {
        localStorage.setItem('msfs-session-id', sessionId);
        // Reconnect with new session
        this.close();
        this.url = getWebSocketURL();
        this.connect();
        return true;
      }
      return false;
    },

    // Connect to WebSocket
    connect: function() {
      if (!this.url) {
        console.error('MSFS Bridge: No connection URL configured');
        this.trigger('error', { type: 'no_url' });
        return false;
      }

      try {
        this.ws = new WebSocket(this.url);
        this.ws.onopen = (e) => {
          this.reconnectAttempts = 0;
          this.trigger('open', e);
        };
        this.ws.onmessage = (e) => {
          this.trigger('message', e);
        };
        this.ws.onerror = (e) => {
          this.trigger('error', e);
        };
        this.ws.onclose = (e) => {
          this.trigger('close', e);
          this.attemptReconnect();
        };
        return true;
      } catch (error) {
        console.error('MSFS Bridge: Connection error', error);
        this.trigger('error', error);
        return false;
      }
    },

    // Attempt to reconnect
    attemptReconnect: function() {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('MSFS Bridge: Max reconnection attempts reached');
        return;
      }

      this.reconnectAttempts++;
      setTimeout(() => {
        if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
          console.log(`MSFS Bridge: Reconnecting (attempt ${this.reconnectAttempts})...`);
          this.connect();
        }
      }, this.reconnectDelay);
    },

    // Close connection
    close: function() {
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
    },

    // Send message
    send: function(data) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(data);
        return true;
      }
      return false;
    },

    // Register event callbacks
    on: function(event, callback) {
      if (this.callbacks[event]) {
        this.callbacks[event].push(callback);
      }
    },

    // Trigger event callbacks
    trigger: function(event, data) {
      if (this.callbacks[event]) {
        this.callbacks[event].forEach(cb => {
          try {
            cb(data);
          } catch (error) {
            console.error('MSFS Bridge: Callback error', error);
          }
        });
      }
    },

    // Get connection status
    isConnected: function() {
      return this.ws && this.ws.readyState === WebSocket.OPEN;
    },

    // Get ready state
    getReadyState: function() {
      if (!this.ws) return WebSocket.CLOSED;
      return this.ws.readyState;
    }
  };

  // Auto-initialize on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      MSFSConnection.init();
    });
  } else {
    MSFSConnection.init();
  }
})();

