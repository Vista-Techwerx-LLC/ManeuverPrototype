import asyncio
import json
import math
import socket
import websockets
from SimConnect import SimConnect, AircraftRequests

HOST = "0.0.0.0"
PORT = 8765
HZ = 15  # good for attitude indicator

def get_local_ip():
    """Get the local IP address for LAN access"""
    try:
        # Connect to a remote address to determine local IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        try:
            # Fallback: get hostname IP
            hostname = socket.gethostname()
            return socket.gethostbyname(hostname)
        except Exception:
            return None

clients = set()

def safe_get(aq, var_name: str):
    try:
        return aq.get(var_name)
    except Exception:
        return None

def rad_to_deg(x):
    if x is None:
        return None
    try:
        return float(x) * 180.0 / math.pi
    except Exception:
        return None

async def ws_handler(ws):
    clients.add(ws)
    try:
        await ws.send(json.dumps({"type": "hello", "msg": "connected"}))
        await ws.wait_closed()
    finally:
        clients.discard(ws)

async def main():
    print("Connecting to SimConnect...")
    sm = SimConnect()
    aq = AircraftRequests(sm, _time=0)
    print("SimConnect connected")
    
    local_ip = get_local_ip()
    print(f"\n{'='*60}")
    print(f"WebSocket server running:")
    print(f"  Local:  ws://127.0.0.1:{PORT}")
    if local_ip:
        print(f"  LAN:    ws://{local_ip}:{PORT}")
        print(f"\n📱 For mobile access:")
        print(f"  1. Make sure your phone is on the same Wi-Fi network")
        print(f"  2. Open http://{local_ip}/index.html on your phone")
        print(f"  3. Allow port {PORT} in Windows Firewall if prompted")
    else:
        print(f"  LAN:    ws://<your-pc-ip>:{PORT}")
        print(f"\n📱 For mobile access:")
        print(f"  1. Find your PC's IP: Open Command Prompt and type 'ipconfig'")
        print(f"  2. Look for 'IPv4 Address' under your network adapter")
        print(f"  3. Open http://<your-pc-ip>/index.html on your phone")
    print(f"{'='*60}\n")

    async with websockets.serve(ws_handler, HOST, PORT):
        interval = 1.0 / max(1, HZ)

        while True:
            # Core telemetry
            lat = safe_get(aq, "PLANE_LATITUDE")
            lon = safe_get(aq, "PLANE_LONGITUDE")
            alt_ft = safe_get(aq, "PLANE_ALTITUDE")
            ias_kt = safe_get(aq, "AIRSPEED_INDICATED")
            vs_fpm = safe_get(aq, "VERTICAL_SPEED")
            hdg_true = safe_get(aq, "PLANE_HEADING_DEGREES_TRUE")  # may also come back as radians in some setups
            on_ground = safe_get(aq, "SIM_ON_GROUND")

            # Attitude:
            # These variables are commonly returned in radians even though the name says "DEGREES".
            pitch_rad = safe_get(aq, "PLANE_PITCH_DEGREES")
            bank_rad  = safe_get(aq, "PLANE_BANK_DEGREES")

            # Rotation rates (rad/s) - critical for maneuver tracking
            roll_rate = safe_get(aq, "ROTATION_VELOCITY_BODY_X")
            pitch_rate = safe_get(aq, "ROTATION_VELOCITY_BODY_Y")
            yaw_rate = safe_get(aq, "ROTATION_VELOCITY_BODY_Z")

            # G-force for maneuver intensity
            g_force = safe_get(aq, "G_FORCE")

            payload = {
                "ts": asyncio.get_event_loop().time(),

                "lat": lat,
                "lon": lon,
                "alt_ft": alt_ft,
                "ias_kt": ias_kt,
                "vs_fpm": vs_fpm,
                "on_ground": on_ground,

                # Debug: raw values (usually radians)
                "pitch_raw": pitch_rad,
                "bank_raw": bank_rad,

                # UI values: degrees
                "pitch_deg": rad_to_deg(pitch_rad),
                "bank_deg": -rad_to_deg(bank_rad) if rad_to_deg(bank_rad) is not None else None,

                # Rotation rates (deg/s) - for maneuver detection
                "roll_rate": rad_to_deg(roll_rate),
                "pitch_rate": rad_to_deg(pitch_rate),
                "yaw_rate": rad_to_deg(yaw_rate),

                # G-force
                "g_force": g_force,
            }

            hdg_deg = rad_to_deg(hdg_true)
            if hdg_deg is not None:
                hdg_deg = hdg_deg % 360
            payload["hdg_true"] = hdg_deg

            if clients:
                msg = json.dumps(payload)
                dead = []
                for ws in list(clients):
                    try:
                        await ws.send(msg)
                    except Exception:
                        dead.append(ws)
                for ws in dead:
                    clients.discard(ws)

            await asyncio.sleep(interval)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nShutting down...")
    except ConnectionError as e:
        print(f"\n[ERROR] Connection Error: {e}")
        print("\nMake sure Microsoft Flight Simulator is running")
        print("and you are loaded into a flight (in the cockpit).")
        input("\nPress Enter to exit...")
    except Exception as e:
        print(f"\n[ERROR] {e}")
        input("\nPress Enter to exit...")
