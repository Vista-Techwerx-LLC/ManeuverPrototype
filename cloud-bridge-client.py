"""
Cloud Bridge Client - Connects local MSFS bridge to cloud WebSocket server
Users can configure their session ID via config file or GUI dialog
"""

import asyncio
import json
import math
import os
import socket
import tkinter as tk
from tkinter import messagebox, simpledialog
import websockets
from SimConnect import SimConnect, AircraftRequests

# Cloud server configuration
CLOUD_WS_URL = "wss://your-relay-server.railway.app"  # Change this to your deployed server

# Configuration file path
CONFIG_FILE = "bridge-config.txt"

HZ = 15  # Update frequency

def get_local_ip():
    """Get the local IP address for LAN access"""
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
            f.write("# This file stores your session ID from the MSFS Maneuver Tracker dashboard\n")
            f.write("# You can edit this file manually or it will be updated automatically\n")
        return True
    except Exception as e:
        print(f"Error writing config file: {e}")
        return False

def prompt_session_id_gui():
    """Show GUI dialog to prompt user for session ID"""
    root = tk.Tk()
    root.withdraw()  # Hide main window
    
    # Create custom dialog
    dialog = tk.Toplevel(root)
    dialog.title("MSFS Bridge - Session ID Setup")
    dialog.geometry("600x400")
    dialog.resizable(False, False)
    
    # Center the window
    dialog.update_idletasks()
    x = (dialog.winfo_screenwidth() // 2) - (600 // 2)
    y = (dialog.winfo_screenheight() // 2) - (400 // 2)
    dialog.geometry(f"600x400+{x}+{y}")
    
    # Make it modal
    dialog.transient(root)
    dialog.grab_set()
    
    # Instructions
    instructions = tk.Text(dialog, wrap=tk.WORD, height=8, padx=20, pady=10, font=("Segoe UI", 10))
    instructions.pack(fill=tk.BOTH, expand=True, padx=20, pady=(20, 10))
    instructions.insert("1.0", 
        "To get your Session ID:\n\n"
        "1. Go to your MSFS Maneuver Tracker dashboard\n"
        "   (the web app where you signed up)\n"
        "2. Sign in to your account\n"
        "3. Copy your Session ID from the dashboard\n"
        "   (It looks like: user_638d0af0)\n\n"
        "Paste your Session ID below:"
    )
    instructions.config(state=tk.DISABLED)
    
    # Input field
    input_frame = tk.Frame(dialog, padx=20, pady=10)
    input_frame.pack(fill=tk.X)
    
    tk.Label(input_frame, text="Session ID:", font=("Segoe UI", 10, "bold")).pack(anchor=tk.W)
    
    session_var = tk.StringVar()
    entry = tk.Entry(input_frame, textvariable=session_var, font=("Consolas", 11), width=40)
    entry.pack(fill=tk.X, pady=(5, 0))
    entry.focus()
    
    # Buttons
    button_frame = tk.Frame(dialog, padx=20, pady=10)
    button_frame.pack(fill=tk.X)
    
    result = {"session_id": None, "cancelled": False}
    
    def on_ok():
        session_id = session_var.get().strip()
        if not session_id:
            messagebox.showwarning("Invalid Input", "Please enter your Session ID.")
            return
        
        if write_config(session_id):
            result["session_id"] = session_id
            dialog.destroy()
        else:
            messagebox.showerror("Error", "Failed to save Session ID. Please try again.")
    
    def on_cancel():
        result["cancelled"] = True
        dialog.destroy()
    
    def on_help():
        help_text = (
            "How to find your Session ID:\n\n"
            "1. Open your web browser\n"
            "2. Go to the MSFS Maneuver Tracker website\n"
            "3. Sign in to your account\n"
            "4. On the Dashboard page, you'll see 'Your Session ID'\n"
            "5. Click the 'Copy' button next to it\n"
            "6. Paste it in the field above\n\n"
            "Your Session ID connects your flight simulator\nto your personal dashboard."
        )
        messagebox.showinfo("Help - Finding Your Session ID", help_text)
    
    # Button frame
    btn_frame = tk.Frame(button_frame)
    btn_frame.pack()
    
    tk.Button(btn_frame, text="Help", command=on_help, width=10, padx=5).pack(side=tk.LEFT, padx=5)
    tk.Button(btn_frame, text="Cancel", command=on_cancel, width=10, padx=5).pack(side=tk.LEFT, padx=5)
    tk.Button(btn_frame, text="Connect", command=on_ok, width=10, padx=5, 
              bg="#6366f1", fg="white", font=("Segoe UI", 9, "bold")).pack(side=tk.LEFT, padx=5)
    
    # Handle Enter key
    entry.bind("<Return>", lambda e: on_ok())
    
    # Wait for dialog to close
    dialog.wait_window()
    root.destroy()
    
    return result["session_id"] if not result["cancelled"] else None

def prompt_session_id():
    """Prompt user for session ID (fallback to console if GUI fails)"""
    try:
        return prompt_session_id_gui()
    except Exception as e:
        # Fallback to console if GUI fails
        print(f"\nGUI not available, using console input: {e}")
        print("\n" + "="*60)
        print("MSFS Bridge Client - Session ID Configuration")
        print("="*60)
        print("\nTo get your Session ID:")
        print("1. Go to your MSFS Maneuver Tracker dashboard")
        print("2. Sign in to your account")
        print("3. Copy your Session ID from the dashboard")
        print("\nExample Session ID: user_638d0af0")
        print("="*60 + "\n")
        
        while True:
            session_id = input("Enter your Session ID (or 'q' to quit): ").strip()
            if session_id.lower() == 'q':
                return None
            if session_id:
                if write_config(session_id):
                    print(f"✅ Session ID saved to {CONFIG_FILE}")
                    return session_id
                else:
                    print("❌ Failed to save session ID. Please try again.")
            else:
                print("Please enter a valid session ID.")

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

async def cloud_bridge(session_id):
    """Connect to cloud server and relay MSFS data"""
    # Build WebSocket URL
    ws_url = f"{CLOUD_WS_URL}?role=bridge&sessionId={session_id}"
    
    print("Connecting to SimConnect...")
    sm = SimConnect()
    aq = AircraftRequests(sm, _time=0)
    print("SimConnect connected")
    
    print(f"\n{'='*60}")
    print(f"Cloud Bridge Client")
    print(f"{'='*60}")
    print(f"Session ID: {session_id}")
    print(f"Connecting to: {CLOUD_WS_URL}")
    print(f"\n📱 Your data will be available in the MSFS Maneuver Tracker dashboard")
    print(f"   Make sure you're signed in with the same account!")
    print(f"{'='*60}\n")

    interval = 1.0 / max(1, HZ)
    reconnect_delay = 5

    while True:
        try:
            async with websockets.connect(ws_url) as ws:
                print("✅ Connected to cloud server")
                
                # Wait for connection confirmation
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=2.0)
                    data = json.loads(msg)
                    if data.get('type') == 'connected':
                        print(f"✅ Session confirmed: {data.get('sessionId')}")
                except asyncio.TimeoutError:
                    pass

                while True:
                    # Get telemetry data
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
    print("MSFS Cloud Bridge Client")
    print("=" * 60)
    print("Make sure to set CLOUD_WS_URL to your deployed relay server")
    print("=" * 60)
    print()
    
    # Get session ID from config or prompt user with GUI
    session_id = read_config()
    
    if not session_id:
        print(f"\n⚠️  No session ID found in {CONFIG_FILE}")
        print("Opening setup dialog...")
        session_id = prompt_session_id()
        if not session_id:
            print("Exiting. Please set up your session ID and try again.")
            input("\nPress Enter to exit...")
            exit(0)
        print(f"✅ Session ID configured: {session_id}")
    
    try:
        asyncio.run(cloud_bridge(session_id))
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
