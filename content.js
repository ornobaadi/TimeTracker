// TimeTracker Pro - Content Script
// This script runs on every page to help track user engagement

let isPageVisible = !document.hidden;
let lastVisibilityChange = Date.now();

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
});

// Track when user actually engages with the page
let userEngaged = false;
const engagementEvents = ['click', 'keydown', 'scroll', 'mousemove'];

const markUserEngaged = () => {
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
  document.addEventListener(event, markUserEngaged, { once: true, passive: true });
});

// Reset engagement when page changes
window.addEventListener('beforeunload', () => {
  userEngaged = false;
}); 