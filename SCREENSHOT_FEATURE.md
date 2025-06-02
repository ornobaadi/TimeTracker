# Screenshot Feature Documentation

## Overview
The TimeTracker extension now includes an automatic screenshot feature that captures full-screen screenshots at configurable intervals. Screenshots are currently stored in local browser storage and can later be sent to a database.

## Features

### ✅ Automatic Screenshots
- Captures full screen every 1-10 minutes (configurable)
- Runs in the background when enabled
- Uses Chrome's native screen capture API

### ✅ Local Storage
- Screenshots saved as base64 data in Chrome local storage
- Automatically limits to 100 screenshots to prevent storage overflow
- Includes metadata (timestamp, size, date)

### ✅ Manual Control
- Toggle automatic screenshots on/off
- Take screenshots manually
- View list of saved screenshots
- Configure capture interval (1, 2, 5, or 10 minutes)

## How to Use

### 1. Enable Screenshots
1. Open the TimeTracker extension popup
2. Find the "SCREENSHOTS" section
3. Click the toggle button to turn "Auto Screenshots" ON
4. Choose your preferred interval from the dropdown (default: 1 minute)

### 2. Take Manual Screenshots
- Click "Take Now" to capture an immediate screenshot
- Useful for testing or capturing specific moments

### 3. View Saved Screenshots
- Click "View Saved" to see a list of captured screenshots
- Shows timestamp and file size for each screenshot

## Technical Implementation

### Files Added/Modified
- `manifest.json` - Added `desktopCapture` and `offscreen` permissions
- `offscreen.html` - Offscreen document for screen capture
- `offscreen.js` - Handles the actual screen capture using getDisplayMedia API
- `background.js` - Added ScreenshotManager class and alarm handling
- `popup.html` - Added screenshot control UI
- `popup.css` - Added styles for screenshot controls
- `popup.js` - Added screenshot functionality to UI

### Architecture
1. **Background Script** (`background.js`)
   - `ScreenshotManager` class handles all screenshot operations
   - Uses Chrome alarms for reliable periodic screenshots
   - Manages local storage and cleanup

2. **Offscreen Document** (`offscreen.html` + `offscreen.js`)
   - Required for Chrome MV3 screen capture
   - Uses `getDisplayMedia()` API to capture screen
   - Converts to base64 for storage

3. **Popup Interface** (`popup.html/js/css`)
   - User controls for enabling/disabling screenshots
   - Manual screenshot capture
   - View saved screenshots list

### Storage Structure
```javascript
// Chrome local storage
{
  "screenshots": [
    {
      "id": "screenshot_1703123456789",
      "data": "data:image/jpeg;base64,/9j/4AAQ...", // base64 image
      "timestamp": 1703123456789,
      "date": "Wed Dec 21 2023",
      "size": 45678 // bytes
    }
  ],
  "screenshotEnabled": true,
  "screenshotInterval": 60000 // milliseconds
}
```

## Future Database Integration

The current implementation saves screenshots to local storage. To integrate with a database:

1. **Modify ScreenshotManager.saveScreenshot()**
   ```javascript
   // Instead of saving to local storage
   await chrome.storage.local.set({ screenshots });
   
   // Send to your database
   await fetch('your-api-endpoint', {
     method: 'POST',
     body: JSON.stringify({
       screenshot: screenshotData,
       timestamp: timestamp,
       userId: currentUserId
     })
   });
   ```

2. **Add API Configuration**
   - Add database URL and authentication to settings
   - Handle upload failures with retry logic
   - Implement batch uploads for better performance

3. **Privacy Considerations**
   - Ensure screenshots are encrypted during transmission
   - Implement user consent flows
   - Add data retention policies

## Privacy & Security

⚠️ **Important**: This feature captures the entire screen, which may include sensitive information:
- Screenshots include ALL visible content on the screen
- Data is currently stored locally but will be transmitted to database
- Users should be informed about what is being captured
- Consider implementing content filtering or user consent mechanisms

## Testing

1. Load the extension in Chrome
2. Grant screen capture permissions when prompted
3. Enable screenshots in the popup
4. Verify screenshots are being taken at the specified interval
5. Check saved screenshots list grows over time

## Troubleshooting

### Permission Issues
- Ensure `desktopCapture` permission is in manifest.json
- User must grant screen sharing permission when first enabled

### Storage Issues
- Screenshots are limited to 100 to prevent storage overflow
- Each screenshot is ~50-200KB depending on screen content
- Clear old screenshots if storage becomes full

### Performance
- Screen capture may impact system performance slightly
- Consider longer intervals for better performance
- Screenshots are compressed to JPEG (80% quality) to reduce size 