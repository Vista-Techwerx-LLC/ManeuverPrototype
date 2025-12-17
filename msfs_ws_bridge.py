import asyncio
import json
import math
import websockets
from SimConnect import SimConnect, AircraftRequests

HOST = "0.0.0.0"
PORT = 8765
HZ = 15  # good for attitude indicator

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
    print(f"WebSocket server running on ws://127.0.0.1:{PORT} (LAN: ws://<your-pc-ip>:{PORT})")

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
        pass
