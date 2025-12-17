# GUI Setup for End Users

## Overview

When users run the bridge executable, they'll see a **friendly GUI dialog** to enter their Session ID - no file editing required!

## User Experience Flow

### First Time Running the Bridge

1. **User double-clicks `cloud-bridge-client.exe`**
2. **GUI dialog appears** with:
   - Clear instructions on how to get their Session ID
   - Input field to paste their Session ID
   - Help button with detailed instructions
   - Connect button to proceed
   - Cancel button to exit

3. **User follows instructions:**
   - Opens their web browser
   - Goes to MSFS Maneuver Tracker dashboard
   - Signs in
   - Copies their Session ID from the dashboard
   - Pastes it into the dialog

4. **User clicks "Connect"**
   - Session ID is saved to `bridge-config.txt` automatically
   - Bridge connects to SimConnect
   - Bridge connects to cloud server
   - Data starts flowing!

### Subsequent Runs

- Bridge reads Session ID from `bridge-config.txt` automatically
- No dialog needed - connects immediately
- If user wants to change Session ID, they can delete `bridge-config.txt` and run again

## GUI Dialog Features

### Instructions Panel
- Clear step-by-step instructions
- Example Session ID format shown
- Easy to understand for non-technical users

### Input Field
- Large, easy-to-read text field
- Monospace font for Session ID
- Auto-focuses when dialog opens
- Supports paste (Ctrl+V)

### Help Button
- Detailed instructions on finding Session ID
- Explains what the Session ID does
- User-friendly explanation

### Connect Button
- Validates input before proceeding
- Saves Session ID automatically
- Shows error messages if something goes wrong

### Cancel Button
- Allows user to exit without connecting
- No data saved if cancelled

## Technical Details

### Fallback Behavior
- If GUI fails (rare), falls back to console input
- Works even if tkinter has issues
- Ensures bridge always works

### Config File
- Automatically created as `bridge-config.txt`
- Saved in same folder as executable
- Format: `SESSION_ID=user_638d0af0`
- User can edit manually if needed

### Error Handling
- Validates Session ID format
- Shows clear error messages
- Prevents invalid input
- Saves only on successful validation

## For Developers

### Building the EXE

When using PyInstaller or similar:

1. **Include tkinter:**
   - tkinter comes with Python by default
   - No extra dependencies needed
   - Works on Windows, Mac, Linux

2. **Test the GUI:**
   - Run the Python script first
   - Verify dialog appears correctly
   - Test with invalid input
   - Test cancel button

3. **Bundle everything:**
   - Include `cloud-bridge-client.py`
   - GUI will work automatically
   - No additional files needed

### Dependencies

- `tkinter` - Built into Python (no install needed)
- `asyncio` - Built into Python
- `websockets` - Already required
- `SimConnect` - Already required

## User Instructions (for documentation)

**Simple 3-step process:**

1. **Run the bridge** - Double-click `cloud-bridge-client.exe`
2. **Enter your Session ID** - Copy from dashboard, paste in dialog
3. **Click Connect** - That's it!

The bridge remembers your Session ID for next time, so you only need to do this once.

## Benefits

✅ **No file editing** - Everything done through GUI  
✅ **User-friendly** - Clear instructions and help  
✅ **Automatic saving** - Session ID saved for future use  
✅ **Error prevention** - Validates input before connecting  
✅ **Fallback support** - Works even if GUI has issues  

Perfect for non-technical users! 🎉


