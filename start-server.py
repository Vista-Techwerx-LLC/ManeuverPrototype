#!/usr/bin/env python3
"""
Simple HTTP server for MSFS Maneuver Tracker
Run this to serve the HTML files so you can access them from your phone
"""

import http.server
import socketserver
import socket
import sys

PORT = 8000

def get_local_ip():
    """Get the local IP address"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        try:
            hostname = socket.gethostname()
            return socket.gethostbyname(hostname)
        except Exception:
            return "localhost"

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Add CORS headers for WebSocket connections
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        super().end_headers()

    def log_message(self, format, *args):
        # Suppress default logging, we'll print our own
        pass

if __name__ == "__main__":
    local_ip = get_local_ip()
    
    print("=" * 60)
    print("MSFS Maneuver Tracker - Web Server")
    print("=" * 60)
    print(f"\nServer starting on:")
    print(f"  Local:  http://localhost:{PORT}/index.html")
    if local_ip:
        print(f"  LAN:    http://{local_ip}:{PORT}/index.html")
        print(f"\n📱 To access from your phone:")
        print(f"  1. Make sure your phone is on the same Wi-Fi network")
        print(f"  2. Open: http://{local_ip}:{PORT}/index.html")
        print(f"  3. The page will auto-detect the IP and connect to the bridge")
    print(f"\nPress Ctrl+C to stop the server")
    print("=" * 60)
    print()

    try:
        with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n\nServer stopped.")
        sys.exit(0)
    except OSError as e:
        if e.errno == 98 or "Address already in use" in str(e):
            print(f"\n[ERROR] Port {PORT} is already in use.")
            print(f"Either stop the other server or change PORT in this script.")
        else:
            print(f"\n[ERROR] {e}")
        sys.exit(1)


