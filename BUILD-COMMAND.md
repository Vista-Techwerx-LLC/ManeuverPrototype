# Build Command - Quick Reference

## Directory

You need to be in the **root of your ManeuverPrototype repository**:

```
C:\Users\joseph\Desktop\Github\ManeuverPrototype
```

This is where:
- ✅ `MSFS-Bridge.spec` is located
- ✅ `msfs-bridge-unified.py` is located
- ✅ All your build files are

## Build Command

From that directory, run:

```bash
pyinstaller MSFS-Bridge.spec
```

## Full Steps

1. **Open Command Prompt or PowerShell**
2. **Navigate to project root:**
   ```bash
   cd C:\Users\joseph\Desktop\Github\ManeuverPrototype
   ```
3. **Build the exe:**
   ```bash
   pyinstaller MSFS-Bridge.spec
   ```
4. **Find your exe:**
   - Location: `dist\MSFS-Bridge.exe`
   - Ready to use!

## Verify You're in the Right Place

You should see these files in your current directory:
- `MSFS-Bridge.spec` ✅
- `msfs-bridge-unified.py` ✅
- `package.json` ✅
- `ReactRoot/` folder ✅

If you see all of these, you're in the right place!

