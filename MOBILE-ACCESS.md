# Mobile Access Guide

## No Accounts Needed! 🎉

You **don't need to create user accounts** for mobile access. The MSFS Bridge works on your local network - just connect your phone to the same Wi-Fi network as your PC.

## Quick Setup

### 1. Find Your PC's IP Address

**Windows:**
- Open Command Prompt (Win + R, type `cmd`)
- Type: `ipconfig`
- Look for "IPv4 Address" under your active network adapter (usually starts with 192.168.x.x or 10.x.x.x)

**Example output:**
```
Ethernet adapter Ethernet:
   IPv4 Address. . . . . . . . . . . : 192.168.1.100
```

### 2. Start the Bridge

1. Launch Microsoft Flight Simulator and load into a flight
2. Run `MSFS-Bridge.exe`
3. The bridge will display your PC's IP address automatically
4. Make sure Windows Firewall allows the connection (you may get a prompt)

### 3. Access from Your Phone

**Option A: Auto-detection (Recommended)**
- Open your phone's browser
- Navigate to: `http://<your-pc-ip>/index.html`
  - Example: `http://192.168.1.100/index.html`
- The page will automatically detect the IP and connect

**Option B: Manual Configuration**
- If auto-detection doesn't work, open the main page on your phone
- You'll see a "Mobile Access" section
- Enter your PC's IP address and click "Save"
- The connection will be saved for future use

### 4. Share the HTML Files

You need to serve the HTML files from your PC. Here are a few options:

**Option A: Simple HTTP Server (Python)**
```bash
# In the project directory, run:
python -m http.server 8000
```
Then access: `http://<your-pc-ip>:8000/index.html`

**Option B: Use a Web Server**
- Install a simple web server like [XAMPP](https://www.apachefriends.org/) or [WAMP](https://www.wampserver.com/)
- Copy the HTML files to the web server directory
- Access via the server's IP address

**Option C: File Sharing**
- Share the project folder on your network
- Access via file:// protocol (may have limitations)

## Troubleshooting

### Can't Connect from Phone

1. **Check Network:** Make sure phone and PC are on the same Wi-Fi network
2. **Check Firewall:** Windows Firewall may be blocking port 8765
   - Go to Windows Defender Firewall → Allow an app
   - Add Python or the bridge executable
3. **Check IP Address:** Make sure you're using the correct IP (not 127.0.0.1)
4. **Check Bridge:** Make sure MSFS-Bridge.exe is running and shows "SimConnect connected"

### Connection Drops

- The bridge automatically reconnects
- If it keeps disconnecting, check your Wi-Fi signal strength
- Make sure the PC isn't going to sleep

## Security Note

This setup is for **local network use only**. The bridge listens on your local network (0.0.0.0), which means any device on your Wi-Fi can potentially connect. This is fine for home use, but be aware if you're on a public network.

## Data Storage

- **No cloud storage:** All data stays on your local network
- **No accounts:** No user authentication needed
- **Browser storage:** The IP address is saved in your browser's localStorage for convenience
- **No data persistence:** Telemetry data is real-time only - it's not saved between sessions

If you want to save maneuver results or telemetry data, you'd need to add that functionality separately (database, file storage, etc.).


