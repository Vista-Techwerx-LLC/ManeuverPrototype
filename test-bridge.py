"""
Quick test script to check if bridge code runs without errors
Run this before building the exe to catch issues early
"""

import sys

print("Testing bridge imports...")

try:
    import asyncio
    print("OK: asyncio")
except Exception as e:
    print(f"ERROR: asyncio: {e}")
    sys.exit(1)

try:
    import tkinter as tk
    print("OK: tkinter")
except Exception as e:
    print(f"ERROR: tkinter: {e}")
    sys.exit(1)

try:
    import websockets
    print("OK: websockets")
except Exception as e:
    print(f"ERROR: websockets: {e}")
    sys.exit(1)

try:
    from SimConnect import SimConnect, AircraftRequests
    print("OK: SimConnect")
except Exception as e:
    print(f"ERROR: SimConnect: {e}")
    sys.exit(1)

print("\nOK: All imports successful!")
print("Now testing GUI...")

try:
    root = tk.Tk()
    root.withdraw()
    print("OK: GUI initialized")
    root.destroy()
except Exception as e:
    print(f"ERROR: GUI error: {e}")
    sys.exit(1)

print("\nOK: Everything works! Ready to build exe.")

