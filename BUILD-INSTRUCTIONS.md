# Building the Bridge EXE - Quick Guide

## Where Everything Goes

### This Repo (ManeuverPrototype) - YOUR PRIVATE REPO
- ✅ `msfs-bridge-unified.py` - Bridge source code
- ✅ `MSFS-Bridge.spec` - Build configuration (updated!)
- ✅ `MSFS-Bridge.exe` - Final executable (after building)
- ✅ All your source code

### host-bridge Repo - PUBLIC (Already Deployed)
- ✅ `server.js` - Cloud relay server (already on Railway)
- ✅ That's it! Just the server.

## How to Build

### Using Your Existing Spec File

I've updated `MSFS-Bridge.spec` to use `msfs-bridge-unified.py`. Now just run:

```bash
pyinstaller MSFS-Bridge.spec
```

This will:
- Use the updated unified bridge code
- Include SimConnect DLL
- Create `MSFS-Bridge.exe` in `dist/` folder
- Hide console window (GUI only)

### Alternative: Quick Build

If you prefer a simple command:

```bash
pyinstaller --onefile --windowed --name "MSFS-Bridge" msfs-bridge-unified.py
```

## After Building

1. **Test the exe:**
   - Run `dist/MSFS-Bridge.exe`
   - GUI should appear
   - Enter a test Session ID
   - Should connect to your server

2. **Distribute:**
   - Upload to GitHub Releases
   - Users download and run
   - No installation needed!

## Important Notes

- **Bridge exe = THIS repo** (private) - your source code
- **Server = host-bridge repo** (public) - already deployed
- **Users only get the exe** - they don't need source code
- **The exe connects to your Railway server** automatically

## What's Updated

✅ `MSFS-Bridge.spec` - Now uses `msfs-bridge-unified.py`  
✅ `msfs-bridge-unified.py` - Has correct WebSocket URL  
✅ Ready to build!

Just run: `pyinstaller MSFS-Bridge.spec`

