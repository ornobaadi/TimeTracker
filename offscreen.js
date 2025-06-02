// Offscreen script for handling screenshot capture
let mediaStream = null;
let isStreamActive = false;

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.source === 'background') {
    switch (message.action) {
      case 'requestPermission':
        handlePermissionRequest();
        break;
      case 'captureScreenshotFromStream':
        handleScreenshotCapture();
        break;
      case 'stopScreenCapture':
        handleStopCapture();
        break;
    }
  }
});

async function handlePermissionRequest() {
  console.log('Offscreen: Permission request received');
  
  try {
    // Request screen capture permission and keep stream alive
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        mediaSource: 'screen',
        width: { ideal: 1920, max: 1920 },
        height: { ideal: 1080, max: 1080 },
        frameRate: { ideal: 1, max: 5 }
      },
      audio: false
    });
    
    mediaStream = stream;
    isStreamActive = true;
    
    console.log('Offscreen: Screen capture permission granted and stream active');
    
    // Send success response
    chrome.runtime.sendMessage({
      action: 'permissionResult',
      success: true
    });
    
    // Listen for stream end
    stream.getTracks().forEach(track => {
      track.onended = () => {
        console.log('Offscreen: Stream ended');
        isStreamActive = false;
        mediaStream = null;
      };
    });
    
  } catch (error) {
    console.error('Offscreen: Permission request failed:', error);
    chrome.runtime.sendMessage({
      action: 'permissionResult',
      success: false,
      error: error.message
    });
  }
}

async function handleScreenshotCapture() {
  console.log('Offscreen: Screenshot capture request received');
  
  if (!isStreamActive || !mediaStream) {
    console.error('Offscreen: No active stream for screenshot');
    chrome.runtime.sendMessage({
      action: 'screenshotResult',
      success: false,
      error: 'No active screen capture stream'
    });
    return;
  }
  
  try {
    const screenshot = await captureFromStream();
    
    // Convert blob to base64 for storage
    const reader = new FileReader();
    reader.onloadend = () => {
      chrome.runtime.sendMessage({
        action: 'screenshotResult',
        success: true,
        screenshot: reader.result,
        timestamp: Date.now()
      });
      console.log('Offscreen: Screenshot captured and sent');
    };
    reader.onerror = () => {
      chrome.runtime.sendMessage({
        action: 'screenshotResult',
        success: false,
        error: 'Failed to convert screenshot to base64'
      });
    };
    reader.readAsDataURL(screenshot);
    
  } catch (error) {
    console.error('Offscreen: Screenshot capture failed:', error);
    chrome.runtime.sendMessage({
      action: 'screenshotResult',
      success: false,
      error: error.message
    });
  }
}

function handleStopCapture() {
  console.log('Offscreen: Stop capture request received');
  
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  isStreamActive = false;
  
  console.log('Offscreen: Screen capture stopped');
}

async function captureFromStream() {
  if (!isStreamActive || !mediaStream) {
    throw new Error('No active stream available');
  }
  
  console.log('Offscreen: Creating screenshot from active stream...');
  
  // Create video element to capture frame from stream
  const video = document.createElement('video');
  video.srcObject = mediaStream;
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  
  // Wait for video to be ready
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = () => {
      video.play().then(resolve).catch(reject);
    };
    video.onerror = reject;
    
    // Timeout after 5 seconds
    setTimeout(() => reject(new Error('Video load timeout')), 5000);
  });
  
  // Small delay to ensure video is stable
  await new Promise(resolve => setTimeout(resolve, 100));
  
  console.log('Offscreen: Video ready, creating canvas...');
  
  // Create canvas and capture frame
  const canvas = document.getElementById('screenshot-canvas');
  const ctx = canvas.getContext('2d');
  
  canvas.width = video.videoWidth || 1920;
  canvas.height = video.videoHeight || 1080;
  
  // Draw the video frame to canvas
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  console.log('Offscreen: Canvas drawn, converting to blob...');
  
  // Convert canvas to blob
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob && blob.size > 0) {
        console.log(`Offscreen: Screenshot blob created, size: ${blob.size} bytes`);
        resolve(blob);
      } else {
        reject(new Error('Failed to create screenshot blob or blob is empty'));
      }
    }, 'image/jpeg', 0.85);
  });
}

// Clean up when the offscreen document is closed
window.addEventListener('beforeunload', () => {
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  isStreamActive = false;
});

// Log when offscreen document is ready
console.log('Offscreen: Screenshot offscreen document loaded and ready'); 