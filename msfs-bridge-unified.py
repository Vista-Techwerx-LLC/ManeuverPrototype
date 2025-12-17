"""
MSFS Bridge - Unified Client
Single executable that connects MSFS to the cloud dashboard
Users just run the exe, paste their Session ID, and it works!
"""

import asyncio
import json
import math
import os
import socket
import tkinter as tk
from tkinter import messagebox
import websockets
from SimConnect import SimConnect, AircraftRequests

# Cloud server configuration
CLOUD_WS_URL = "wss://host-bridge-production.up.railway.app"

# Configuration file path
CONFIG_FILE = "bridge-config.txt"

HZ = 15  # Update frequency

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

def read_config():
    """Read session ID from config file"""
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line.startswith('SESSION_ID='):
                        return line.split('=', 1)[1].strip()
        except Exception as e:
            print(f"Error reading config file: {e}")
    return None

def write_config(session_id):
    """Write session ID to config file"""
    try:
        with open(CONFIG_FILE, 'w') as f:
            f.write(f"SESSION_ID={session_id}\n")
            f.write("# This file stores your session ID\n")
        return True
    except Exception as e:
        print(f"Error writing config file: {e}")
        return False

def show_session_id_dialog():
    """Show GUI dialog to get session ID from user"""
    print("Creating GUI dialog...")
    
    # Result storage
    result = {"session_id": None, "cancelled": False}
    
    # Create root window (use it directly, not Toplevel)
    root = tk.Tk()
    root.title("MSFS Bridge - Connect Your Account")
    root.geometry("550x350")
    root.resizable(False, False)
    print("Root window created")
    
    # Center the window
    root.update_idletasks()
    x = (root.winfo_screenwidth() // 2) - (550 // 2)
    y = (root.winfo_screenheight() // 2) - (350 // 2)
    root.geometry(f"550x350+{x}+{y}")
    print("Window centered")
    
    # Prevent closing without result
    def on_close():
        if messagebox.askokcancel("Quit", "Do you want to exit without connecting?"):
            result["cancelled"] = True
            root.quit()
        else:
            # Don't close if user cancels
            pass
    
    root.protocol("WM_DELETE_WINDOW", on_close)
    
    # Title
    title_frame = tk.Frame(root, bg="#6366f1", height=60)
    title_frame.pack(fill=tk.X)
    title_frame.pack_propagate(False)
    
    tk.Label(title_frame, text="MSFS Bridge", 
             font=("Segoe UI", 16, "bold"), 
             bg="#6366f1", fg="white").pack(pady=15)
    
    # Instructions
    instructions_frame = tk.Frame(root, padx=30, pady=20)
    instructions_frame.pack(fill=tk.BOTH, expand=True)
    
    tk.Label(instructions_frame, 
             text="To connect your flight simulator to your dashboard:",
             font=("Segoe UI", 10),
             justify=tk.LEFT).pack(anchor=tk.W, pady=(0, 10))
    
    steps = tk.Text(instructions_frame, wrap=tk.WORD, height=5, 
                   font=("Segoe UI", 9), padx=5, pady=5,
                   bg="#f5f5f5", relief=tk.FLAT)
    steps.pack(fill=tk.BOTH, expand=True, pady=(0, 15))
    steps.insert("1.0", 
        "1. Go to your MSFS Maneuver Tracker dashboard\n"
        "2. Sign in and copy your Session ID\n"
        "3. Paste it below and click Connect"
    )
    steps.config(state=tk.DISABLED)
    
    # Input field
    tk.Label(instructions_frame, text="Session ID:", 
             font=("Segoe UI", 9, "bold")).pack(anchor=tk.W, pady=(0, 5))
    
    session_var = tk.StringVar()
    entry = tk.Entry(instructions_frame, textvariable=session_var, 
                    font=("Consolas", 11), width=35)
    entry.pack(fill=tk.X, pady=(0, 15))
    entry.focus()
    
    # Buttons
    button_frame = tk.Frame(instructions_frame)
    button_frame.pack(fill=tk.X)
    
    def on_connect():
        session_id = session_var.get().strip()
        if not session_id:
            messagebox.showwarning("Missing Session ID", 
                                 "Please enter your Session ID.")
            return
        
        if write_config(session_id):
            result["session_id"] = session_id
            root.quit()
            root.destroy()
        else:
            messagebox.showerror("Error", 
                               "Failed to save Session ID. Please try again.")
    
    def on_cancel():
        result["cancelled"] = True
        root.quit()
        root.destroy()
    
    def on_help():
        help_text = (
            "How to find your Session ID:\n\n"
            "1. Open your web browser\n"
            "2. Go to the MSFS Maneuver Tracker website\n"
            "3. Sign in to your account\n"
            "4. On the Dashboard, you'll see 'Your Session ID'\n"
            "5. Click 'Copy' next to it\n"
            "6. Paste it in the field above\n\n"
            "Your Session ID connects your flight simulator\nto your personal dashboard."
        )
        messagebox.showinfo("Help", help_text)
    
    tk.Button(button_frame, text="Help", command=on_help, 
             width=10, padx=5).pack(side=tk.LEFT, padx=5)
    tk.Button(button_frame, text="Cancel", command=on_cancel, 
             width=10, padx=5).pack(side=tk.LEFT, padx=5)
    tk.Button(button_frame, text="Connect", command=on_connect, 
             width=12, padx=5, bg="#6366f1", fg="white", 
             font=("Segoe UI", 9, "bold")).pack(side=tk.RIGHT, padx=5)
    
    # Handle Enter key
    entry.bind("<Return>", lambda e: on_connect())
    
    # Show the window and wait
    print("Showing window...")
    root.focus_force()
    root.lift()
    root.update()
    print("Window should be visible now, starting mainloop...")
    
    # Wait for window to close
    try:
        root.mainloop()
        print("Mainloop ended")
    except Exception as e:
        print(f"GUI Error: {e}")
        import traceback
        traceback.print_exc()
        return None
    
    print(f"Returning result: cancelled={result['cancelled']}, session_id={result['session_id']}")
    return result["session_id"] if not result["cancelled"] else None

async def run_bridge(session_id):
    """Main bridge function - connects MSFS to cloud"""
    print("=" * 60)
    print("MSFS Bridge - Connecting...")
    print("=" * 60)
    print(f"Session ID: {session_id}")
    print(f"Connecting to SimConnect...")
    
    # Connect to SimConnect
    sm = SimConnect()
    aq = AircraftRequests(sm, _time=0)
    print("✅ SimConnect connected")
    
    # Build WebSocket URL
    ws_url = f"{CLOUD_WS_URL}?role=bridge&sessionId={session_id}"
    
    print(f"Connecting to cloud server...")
    print(f"📱 Your data will appear in your dashboard!")
    print("=" * 60)
    print()
    
    interval = 1.0 / max(1, HZ)
    reconnect_delay = 5
    
    while True:
        try:
            async with websockets.connect(ws_url) as ws:
                print("✅ Connected to cloud server")
                
                # Wait for confirmation
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=2.0)
                    data = json.loads(msg)
                    if data.get('type') == 'connected':
                        print(f"✅ Session confirmed: {data.get('sessionId')}")
                        print("\n🛫 Ready! Start flying in MSFS to see live data in your dashboard.\n")
                except asyncio.TimeoutError:
                    pass
                
                # Main loop - send telemetry data
                while True:
                    # Get telemetry from MSFS
                    lat = safe_get(aq, "PLANE_LATITUDE")
                    lon = safe_get(aq, "PLANE_LONGITUDE")
                    alt_ft = safe_get(aq, "PLANE_ALTITUDE")
                    ias_kt = safe_get(aq, "AIRSPEED_INDICATED")
                    vs_fpm = safe_get(aq, "VERTICAL_SPEED")
                    hdg_true = safe_get(aq, "PLANE_HEADING_DEGREES_TRUE")
                    on_ground = safe_get(aq, "SIM_ON_GROUND")
                    
                    pitch_rad = safe_get(aq, "PLANE_PITCH_DEGREES")
                    bank_rad = safe_get(aq, "PLANE_BANK_DEGREES")
                    
                    roll_rate = safe_get(aq, "ROTATION_VELOCITY_BODY_X")
                    pitch_rate = safe_get(aq, "ROTATION_VELOCITY_BODY_Y")
                    yaw_rate = safe_get(aq, "ROTATION_VELOCITY_BODY_Z")
                    g_force = safe_get(aq, "G_FORCE")
                    
                    # Build payload
                    payload = {
                        "ts": asyncio.get_event_loop().time(),
                        "lat": lat,
                        "lon": lon,
                        "alt_ft": alt_ft,
                        "ias_kt": ias_kt,
                        "vs_fpm": vs_fpm,
                        "on_ground": on_ground,
                        "pitch_raw": pitch_rad,
                        "bank_raw": bank_rad,
                        "pitch_deg": rad_to_deg(pitch_rad),
                        "bank_deg": -rad_to_deg(bank_rad) if rad_to_deg(bank_rad) is not None else None,
                        "roll_rate": rad_to_deg(roll_rate),
                        "pitch_rate": rad_to_deg(pitch_rate),
                        "yaw_rate": rad_to_deg(yaw_rate),
                        "g_force": g_force,
                    }
                    
                    hdg_deg = rad_to_deg(hdg_true)
                    if hdg_deg is not None:
                        hdg_deg = hdg_deg % 360
                    payload["hdg_true"] = hdg_deg
                    
                    # Send to cloud server
                    await ws.send(json.dumps(payload))
                    await asyncio.sleep(interval)
                    
        except websockets.exceptions.ConnectionClosed:
            print(f"❌ Connection closed. Reconnecting in {reconnect_delay} seconds...")
            await asyncio.sleep(reconnect_delay)
        except Exception as e:
            print(f"❌ Error: {e}")
            print(f"Reconnecting in {reconnect_delay} seconds...")
            await asyncio.sleep(reconnect_delay)

if __name__ == "__main__":
    # Check for existing session ID
    session_id = read_config()
    
    # If no session ID, show dialog
    if not session_id:
        print("Opening connection dialog...")
        session_id = show_session_id_dialog()
        
        if not session_id:
            print("No session ID provided. Exiting.")
            input("\nPress Enter to exit...")
            exit(0)
    
    # Run the bridge
    try:
        asyncio.run(run_bridge(session_id))
    except KeyboardInterrupt:
        print("\n\nShutting down...")
    except ConnectionError as e:
        print(f"\n[ERROR] Connection Error: {e}")
        print("\nMake sure Microsoft Flight Simulator is running")
        print("and you are loaded into a flight (in the cockpit).")
        input("\nPress Enter to exit...")
    except Exception as e:
        print(f"\n[ERROR] {e}")
        import traceback
        traceback.print_exc()
        input("\nPress Enter to exit...")

