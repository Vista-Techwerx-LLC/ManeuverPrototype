# Building the Bridge EXE

## Where Files Go

### This Repo (ManeuverPrototype) - PRIVATE
- ✅ `msfs-bridge-unified.py` - Bridge source code (users run this as exe)
- ✅ Bridge executable (MSFS-Bridge.exe) - What users download
- ✅ React app code
- ✅ All your source code

### host-bridge Repo - PUBLIC
- ✅ `server.js` - Cloud relay server (already deployed)
- ✅ `package.json` - Server dependencies
- ✅ That's it! Just the server code

## Building the EXE

I can't build the exe for you (requires PyInstaller on your machine), but here's how:

### Option 1: Using PyInstaller (Recommended)

1. **Install PyInstaller:**
   ```bash
   pip install pyinstaller
   ```

2. **Build the exe:**
   ```bash
   pyinstaller --onefile --windowed --name "MSFS-Bridge" msfs-bridge-unified.py
   ```

   This creates `MSFS-Bridge.exe` in the `dist/` folder

3. **Include required files:**
   - The exe is standalone (--onefile)
   - GUI works (--windowed hides console)
   - All dependencies bundled

### Option 2: Using your existing build setup

If you already have a build process (like `MSFS-Bridge.spec`), update it:

1. **Update the spec file** to use `msfs-bridge-unified.py` instead of `msfs_ws_bridge.py`
2. **Run your build command** (whatever you used before)

### What Gets Built

The exe will include:
- ✅ All Python code
- ✅ SimConnect library
- ✅ WebSocket library
- ✅ tkinter (for GUI)
- ✅ Everything needed to run

### After Building

1. **Test the exe:**
   - Run it locally
   - Make sure GUI appears
   - Test with a Session ID

2. **Distribute:**
   - Upload to GitHub Releases
   - Users download and run
   - No installation needed!

## Important Notes

- **Bridge exe stays in THIS repo** (private) - it's your source code
- **Server code is in host-bridge repo** (public) - already deployed
- **Users only need the exe** - they don't need the server code
- **The exe connects to your deployed server** - no setup needed on their end

## Quick Build Command

```bash
# Simple one-file build
pyinstaller --onefile --windowed --name "MSFS-Bridge" msfs-bridge-unified.py

# Or if you want to see console output (for debugging)
pyinstaller --onefile --name "MSFS-Bridge" msfs-bridge-unified.py
```

The exe will be in `dist/MSFS-Bridge.exe` - ready to distribute!

