let isPageVisible = !document.hidden;
let lastVisibilityChange = Date.now();
let lastActivityTime = Date.now();
let activityThrottle = null;

// Track page visibility changes
document.addEventListener('visibilitychange', () => {
  const now = Date.now();
  const wasVisible = isPageVisible;
  isPageVisible = !document.hidden;
  
  // Send visibility change to background script if needed
  if (wasVisible !== isPageVisible) {
    chrome.runtime.sendMessage({
      action: 'visibilityChanged',
      visible: isPageVisible,
      timestamp: now,
      url: window.location.href
    }).catch(() => {
      // Ignore errors if background script is not ready
    });
  }
  
  lastVisibilityChange = now;
  if (isPageVisible) {
    markUserActivity();
  }
});

// Function to mark user activity and throttle messages
const markUserActivity = () => {
  lastActivityTime = Date.now();
  
  // Throttle activity messages to avoid spam (max 1 per 5 seconds)
  if (activityThrottle) return;
  
  activityThrottle = setTimeout(() => {
    activityThrottle = null;
  }, 5000);
  
  chrome.runtime.sendMessage({
    action: 'userActivity',
    timestamp: lastActivityTime,
    url: window.location.href
  }).catch(() => {
    // Ignore errors if background script is not ready
  });
};

// Track when user actually engages with the page
let userEngaged = false;
const engagementEvents = [
  'click', 'keydown', 'scroll', 'mousemove', 'mousedown', 'touchstart', 
  'touchmove', 'wheel', 'input', 'focus', 'blur'
];

const markUserEngaged = () => {
  markUserActivity();
  
  if (!userEngaged) {
    userEngaged = true;
    chrome.runtime.sendMessage({
      action: 'userEngaged',
      url: window.location.href,
      timestamp: Date.now()
    }).catch(() => {
      // Ignore errors if background script is not ready
    });
  }
};

// Add engagement listeners
engagementEvents.forEach(event => {
  document.addEventListener(event, markUserEngaged, { passive: true });
});

// Track video/audio playback as activity
const trackMediaActivity = () => {
  const mediaElements = document.querySelectorAll('video, audio');
  mediaElements.forEach(media => {
    media.addEventListener('play', markUserActivity, { passive: true });
    media.addEventListener('pause', markUserActivity, { passive: true });
  });
};

// Initial media tracking
trackMediaActivity();

// Re-track media elements when DOM changes
const observer = new MutationObserver(() => {
  trackMediaActivity();
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Reset engagement when page changes
window.addEventListener('beforeunload', () => {
  userEngaged = false;
  if (observer) {
    observer.disconnect();
  }
});

// Send periodic heartbeats if page is active and visible (every 30 seconds)
setInterval(() => {
  if (isPageVisible && document.hasFocus()) {
    const timeSinceActivity = Date.now() - lastActivityTime;
    // Only send heartbeat if there was recent activity (within 30 seconds)
    if (timeSinceActivity < 30000) {
      markUserActivity();
    }
  }
}, 30000); 