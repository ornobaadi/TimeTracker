// TimeTracker Pro - Background Script
class TimeTracker {
  constructor() {
    this.isTracking = false;
    this.sessionStartTime = null;
    this.activeTab = null;
    this.siteStartTime = null;
    this.saveInterval = null;
    this.lastSaveTime = null; // Track when we last saved to avoid data loss
    this.lastActivityTime = null; // Track last user activity
    this.idleThreshold = 30000; // 30 seconds of inactivity = idle
    this.sessionActiveTime = 0; // Track actual active time in session
    this.lastSessionSummary = null; // Store last session summary
    this.userEngaged = false; // Track if user is currently engaged
    this.init();
  }

  async init() {
    // Restore state on startup
    const result = await chrome.storage.local.get(['isTracking', 'sessionStartTime', 'sessionActiveTime']);
    this.isTracking = result.isTracking || false;
    this.sessionStartTime = result.sessionStartTime || null;
    this.sessionActiveTime = result.sessionActiveTime || 0;
    
    // Always set up event listeners, they check tracking state internally
    this.setupEventListeners();
    
    if (this.isTracking) {
      this.getCurrentActiveTab();
      this.startPeriodicSave();
      this.lastActivityTime = Date.now(); // Assume user is active when extension starts
    }
  }

  setupEventListeners() {
    // Tab activation
    chrome.tabs.onActivated.addListener((activeInfo) => {
      if (this.isTracking) {
        this.markUserActivity();
        this.handleTabChange(activeInfo.tabId);
      }
    });

    // Tab updates
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (this.isTracking && changeInfo.status === 'complete' && tab.active) {
        this.markUserActivity();
        this.handleTabChange(tabId);
      }
    });

    // Window focus changes
    chrome.windows.onFocusChanged.addListener((windowId) => {
      if (this.isTracking) {
        if (windowId === chrome.windows.WINDOW_ID_NONE) {
          this.handleTabChange(null);
        } else {
          this.markUserActivity();
          chrome.tabs.query({ active: true, windowId: windowId }, (tabs) => {
            if (tabs.length > 0) {
              this.handleTabChange(tabs[0].id);
            }
          });
        }
      }
    });

    // Handle browser close/restart
    chrome.runtime.onSuspend.addListener(() => {
      if (this.isTracking) {
        this.saveTimeSpent();
      }
    });
  }

  markUserActivity() {
    this.lastActivityTime = Date.now();
    this.userEngaged = true;
  }

  isUserIdle() {
    if (!this.lastActivityTime) return false;
    return (Date.now() - this.lastActivityTime) > this.idleThreshold;
  }

  async getCurrentActiveTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        this.handleTabChange(tab.id);
      }
    } catch (error) {
      console.error('Error getting active tab:', error);
    }
  }

  async handleTabChange(tabId) {
    // Save time for previous site using high-precision timing
    if (this.activeTab && this.siteStartTime && !this.isUserIdle()) {
      await this.saveTimeSpent();
    }

    // Set new active tab
    if (tabId) {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError || !tab.url || tab.url.startsWith('chrome://')) {
          this.activeTab = null;
          this.siteStartTime = null;
          return;
        }
        
        this.activeTab = tab;
        this.siteStartTime = Date.now(); // High-precision start time
        this.lastSaveTime = this.siteStartTime; // Track last save
        this.markUserActivity(); // Mark as active when changing tabs
      });
    } else {
      this.activeTab = null;
      this.siteStartTime = null;
      this.lastSaveTime = null;
    }
  }

  async saveTimeSpent() {
    if (!this.activeTab || !this.siteStartTime || this.isUserIdle()) return;

    const currentTime = Date.now();
    const timeSpent = currentTime - this.siteStartTime;
    
    // Only save if more than 2 seconds spent and user is not idle
    if (timeSpent < 2000) return;

    const domain = this.extractDomain(this.activeTab.url);
    const today = new Date().toDateString();

    try {
      const result = await chrome.storage.local.get(['timeData']);
      const timeData = result.timeData || {};

      // Initialize domain data if not exists
      if (!timeData[domain]) {
        timeData[domain] = {
          totalTime: 0,
          visits: 0,
          lastVisit: currentTime,
          title: this.activeTab.title || domain,
          favicon: this.activeTab.favIconUrl || '',
          dailyTime: {},
          activeTime: 0, // Track only active time
          dailyActiveTime: {} // Track daily active time
        };
      }

      // Update total time and visits using precise timing
      timeData[domain].totalTime += timeSpent;
      timeData[domain].activeTime += timeSpent; // Only count as active time since we check for idle
      timeData[domain].visits += 1;
      timeData[domain].lastVisit = currentTime;
      timeData[domain].title = this.activeTab.title || domain;

      // Update daily time using precise timing
      if (!timeData[domain].dailyTime[today]) {
        timeData[domain].dailyTime[today] = 0;
      }
      if (!timeData[domain].dailyActiveTime[today]) {
        timeData[domain].dailyActiveTime[today] = 0;
      }
      timeData[domain].dailyTime[today] += timeSpent;
      timeData[domain].dailyActiveTime[today] += timeSpent; // Only active time

      // Update session active time
      this.sessionActiveTime += timeSpent;

      await chrome.storage.local.set({ 
        timeData,
        sessionActiveTime: this.sessionActiveTime
      });
      this.lastSaveTime = currentTime;
    } catch (error) {
      console.error('Error saving time data:', error);
    }
  }

  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return 'Unknown';
    }
  }

  startPeriodicSave() {
    // Use chrome.alarms for more reliable background timing
    chrome.alarms.create('timeTrackerSave', { 
      delayInMinutes: 0.167, // 10 seconds = 0.167 minutes
      periodInMinutes: 0.167 // Repeat every 10 seconds
    });
    
    // Fallback setInterval for immediate response (reduced frequency to avoid conflicts)
    this.saveInterval = setInterval(async () => {
      if (this.isTracking && this.activeTab && this.siteStartTime && !this.isUserIdle()) {
        // Calculate precise time since last save
        const currentTime = Date.now();
        const timeSinceLastSave = currentTime - (this.lastSaveTime || this.siteStartTime);
        
        // Only save if significant time has passed to avoid excessive storage writes
        if (timeSinceLastSave >= 5000) { // Reduced to 5 seconds minimum for better accuracy
          await this.saveCurrentSession();
        }
      }
    }, 8000); // Reduced to 8 seconds for better responsiveness
  }

  async saveCurrentSession() {
    if (!this.activeTab || !this.siteStartTime || this.isUserIdle()) return;

    const currentTime = Date.now();
    const timeSinceLastSave = currentTime - (this.lastSaveTime || this.siteStartTime);
    
    if (timeSinceLastSave < 2000) return; // Don't save less than 2 seconds

    const domain = this.extractDomain(this.activeTab.url);
    const today = new Date().toDateString();

    try {
      const result = await chrome.storage.local.get(['timeData']);
      const timeData = result.timeData || {};

      // Initialize domain data if not exists
      if (!timeData[domain]) {
        timeData[domain] = {
          totalTime: 0,
          visits: 0,
          lastVisit: currentTime,
          title: this.activeTab.title || domain,
          favicon: this.activeTab.favIconUrl || '',
          dailyTime: {},
          activeTime: 0, // Track only active time
          dailyActiveTime: {} // Track daily active time
        };
      }

      // Add incremental time since last save
      timeData[domain].totalTime += timeSinceLastSave;
      timeData[domain].activeTime += timeSinceLastSave; // Only count as active time since we check for idle
      timeData[domain].lastVisit = currentTime;
      timeData[domain].title = this.activeTab.title || domain;

      // Update daily time incrementally
      if (!timeData[domain].dailyTime[today]) {
        timeData[domain].dailyTime[today] = 0;
      }
      if (!timeData[domain].dailyActiveTime[today]) {
        timeData[domain].dailyActiveTime[today] = 0;
      }
      timeData[domain].dailyTime[today] += timeSinceLastSave;
      timeData[domain].dailyActiveTime[today] += timeSinceLastSave; // Only active time

      // Update session active time
      this.sessionActiveTime += timeSinceLastSave;

      await chrome.storage.local.set({ 
        timeData,
        sessionActiveTime: this.sessionActiveTime
      });
      this.lastSaveTime = currentTime;
    } catch (error) {
      console.error('Error saving session data:', error);
    }
  }

  stopPeriodicSave() {
    // Clear both alarms and intervals
    chrome.alarms.clear('timeTrackerSave');
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }
  }

  async startTracking() {
    this.isTracking = true;
    this.sessionStartTime = Date.now();
    this.sessionActiveTime = 0; // Reset session active time
    this.lastActivityTime = Date.now(); // Mark as active when starting
    
    console.log('TimeTracker: Starting tracking at', new Date(this.sessionStartTime).toISOString(), 'timestamp:', this.sessionStartTime);
    
    await chrome.storage.local.set({
      isTracking: true,
      sessionStartTime: this.sessionStartTime,
      sessionActiveTime: 0
    });

    this.getCurrentActiveTab();
    this.startPeriodicSave();
  }

  async stopTracking() {
    // Save current site time before stopping using precise timing
    if (this.activeTab && this.siteStartTime && !this.isUserIdle()) {
      await this.saveTimeSpent();
    }

    // Get the exact same stats that would be returned by getSessionStats
    const finalStats = await this.getSessionStats();
    
    // Store session summary using the exact same values
    this.lastSessionSummary = {
      sessionTotalTime: finalStats.sessionTime,
      sessionActiveTime: finalStats.sessionActiveTime,
      idleTime: finalStats.idleTime,
      startTime: this.sessionStartTime,
      endTime: Date.now(),
      timestamp: Date.now()
    };

    // Store session summary
    await chrome.storage.local.set({
      lastSessionSummary: this.lastSessionSummary
    });

    this.isTracking = false;
    this.sessionStartTime = null;
    this.activeTab = null;
    this.siteStartTime = null;
    this.lastSaveTime = null;
    this.lastActivityTime = null;
    this.sessionActiveTime = 0;
    this.stopPeriodicSave();

    await chrome.storage.local.set({
      isTracking: false,
      sessionStartTime: null,
      sessionActiveTime: 0
    });
  }

  getCurrentSessionData() {
    if (!this.isTracking || !this.activeTab || !this.siteStartTime) {
      return null;
    }
    
    const currentTime = Date.now();
    const sessionTime = currentTime - this.sessionStartTime;
    const currentSiteTime = currentTime - this.siteStartTime;
    
    // Calculate time since last save, ensuring it doesn't exceed session time or site time
    let timeSinceLastSave = currentTime - (this.lastSaveTime || this.siteStartTime);
    
    // If user is idle, don't count the time since last save
    if (this.isUserIdle()) {
      timeSinceLastSave = 0;
    } else {
      // Cap at reasonable bounds and ensure it doesn't exceed session or site time
      timeSinceLastSave = Math.min(
        timeSinceLastSave, 
        30000, // 30 seconds max
        sessionTime, // Can't exceed total session time
        currentSiteTime // Can't exceed time on current site
      );
    }
    
    return {
      domain: this.extractDomain(this.activeTab.url),
      title: this.activeTab.title || this.extractDomain(this.activeTab.url),
      favicon: this.activeTab.favIconUrl || '',
      currentTime: Math.max(0, Math.min(currentSiteTime, sessionTime)), // Site time can't exceed session time
      sessionTime: Math.max(0, sessionTime),
      timeSinceLastSave: Math.max(0, timeSinceLastSave),
      isIdle: this.isUserIdle(),
      lastActivityTime: this.lastActivityTime
    };
  }

  // New method to get real-time session statistics
  async getSessionStats() {
    const currentTime = Date.now();
    
    if (!this.isTracking || !this.sessionStartTime) {
      return { 
        sessionTime: 0,
        sessionActiveTime: 0,
        todayTotal: await this.getTodayActiveTotalFromStorage(),
        todayActiveTotal: await this.getTodayActiveTotalFromStorage(),
        isTracking: false
      };
    }

    const sessionTime = currentTime - this.sessionStartTime;
    let currentSessionActiveTime = this.sessionActiveTime;
    
    // Add current unsaved active time to session active time (only if not idle and tab is active)
    if (this.activeTab && this.siteStartTime && !this.isUserIdle()) {
      const unsavedTime = currentTime - (this.lastSaveTime || this.siteStartTime);
      if (unsavedTime >= 0 && unsavedTime < 30000) { // Cap at 30 seconds for safety
        currentSessionActiveTime += unsavedTime;
      }
    }
    
    // Ensure active time never exceeds session time
    currentSessionActiveTime = Math.min(currentSessionActiveTime, sessionTime);
    
    // Calculate today's active total: stored data + current session active time
    const storedTodayActive = await this.getTodayActiveTotalFromStorage();
    const todayActiveTotal = storedTodayActive + currentSessionActiveTime;
    
    // Calculate idle time
    const idleTime = Math.max(0, sessionTime - currentSessionActiveTime);
    
    return {
      sessionTime,
      sessionActiveTime: currentSessionActiveTime,
      todayTotal: todayActiveTotal, // This should match FOCUSED TODAY
      todayActiveTotal: todayActiveTotal, // This should match FOCUSED TODAY  
      idleTime,
      isTracking: true,
      currentSite: this.activeTab ? this.extractDomain(this.activeTab.url) : null,
      isIdle: this.isUserIdle(),
      debug: {
        sessionStartTime: this.sessionStartTime,
        currentTime: currentTime,
        rawSessionTime: sessionTime,
        rawActiveTime: this.sessionActiveTime,
        currentActiveTime: currentSessionActiveTime,
        storedTodayActive: storedTodayActive,
        lastActivityTime: this.lastActivityTime,
        isIdle: this.isUserIdle()
      }
    };
  }

  async getTodayActiveTotalFromStorage() {
    const today = new Date().toDateString();
    const result = await chrome.storage.local.get(['timeData']);
    const timeData = result.timeData || {};
    
    let todayActiveTotal = 0;
    Object.values(timeData).forEach(siteData => {
      if (siteData.dailyActiveTime && siteData.dailyActiveTime[today]) {
        todayActiveTotal += siteData.dailyActiveTime[today];
      }
    });
    
    return todayActiveTotal;
  }

  async getTodayTotalFromStorage() {
    const today = new Date().toDateString();
    const result = await chrome.storage.local.get(['timeData']);
    const timeData = result.timeData || {};
    
    let todayTotal = 0;
    Object.values(timeData).forEach(siteData => {
      if (siteData.dailyTime && siteData.dailyTime[today]) {
        todayTotal += siteData.dailyTime[today];
      }
    });
    
    return todayTotal;
  }

  getStatus() {
    return {
      isTracking: this.isTracking,
      sessionStartTime: this.sessionStartTime
    };
  }
}

// Data management utilities
class DataManager {
  static async getTodayData() {
    const today = new Date().toDateString();
    const result = await chrome.storage.local.get(['timeData']);
    const timeData = result.timeData || {};
    
    const todayData = {};
    Object.entries(timeData).forEach(([domain, data]) => {
      if (data.dailyTime && data.dailyTime[today]) {
        todayData[domain] = {
          time: data.dailyTime[today],
          activeTime: data.dailyActiveTime && data.dailyActiveTime[today] ? data.dailyActiveTime[today] : data.dailyTime[today], // Fallback to regular time if active time not available
          title: data.title,
          favicon: data.favicon,
          visits: data.visits
        };
      }
    });
    
    return todayData;
  }

  static async getYesterdayData() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();
    
    const result = await chrome.storage.local.get(['timeData']);
    const timeData = result.timeData || {};
    
    const yesterdayData = {};
    Object.entries(timeData).forEach(([domain, data]) => {
      if (data.dailyTime && data.dailyTime[yesterdayStr]) {
        yesterdayData[domain] = {
          time: data.dailyTime[yesterdayStr],
          activeTime: data.dailyActiveTime && data.dailyActiveTime[yesterdayStr] ? data.dailyActiveTime[yesterdayStr] : data.dailyTime[yesterdayStr], // Fallback to regular time if active time not available
          title: data.title,
          favicon: data.favicon,
          visits: data.visits
        };
      }
    });
    
    return yesterdayData;
  }

  static async getAllTimeData() {
    const result = await chrome.storage.local.get(['timeData']);
    return result.timeData || {};
  }

  static formatTime(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return `${seconds}s`;
    }
  }

  static async clearAllData() {
    await chrome.storage.local.clear();
  }
}

// Initialize tracker
const timeTracker = new TimeTracker();

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'getStatus':
      sendResponse(timeTracker.getStatus());
      break;
    case 'getCurrentSession':
      sendResponse(timeTracker.getCurrentSessionData());
      break;
    case 'getSessionStats':
      timeTracker.getSessionStats().then(stats => {
        if (stats.debug) {
          console.log('TimeTracker: Session stats debug:', stats.debug);
        }
        sendResponse(stats);
      });
      return true;
    case 'getLastSessionSummary':
      chrome.storage.local.get(['lastSessionSummary']).then(result => {
        sendResponse(result.lastSessionSummary || null);
      });
      return true;
    case 'clearLastSessionSummary':
      chrome.storage.local.remove(['lastSessionSummary']).then(() => {
        sendResponse({ success: true });
      });
      return true;
    case 'userActivity':
      if (timeTracker.isTracking) {
        timeTracker.markUserActivity();
      }
      sendResponse({ success: true });
      break;
    case 'visibilityChanged':
      if (timeTracker.isTracking) {
        if (request.visible) {
          timeTracker.markUserActivity();
        }
      }
      sendResponse({ success: true });
      break;
    case 'userEngaged':
      if (timeTracker.isTracking) {
        timeTracker.markUserActivity();
      }
      sendResponse({ success: true });
      break;
    case 'startTracking':
      timeTracker.startTracking().then(() => sendResponse({ success: true }));
      return true;
    case 'stopTracking':
      timeTracker.stopTracking().then(() => sendResponse({ success: true }));
      return true;
    case 'getTodayData':
      DataManager.getTodayData().then(sendResponse);
      return true;
    case 'getYesterdayData':
      DataManager.getYesterdayData().then(sendResponse);
      return true;
    case 'getAllTimeData':
      DataManager.getAllTimeData().then(sendResponse);
      return true;
    case 'clearData':
      DataManager.clearAllData().then(() => sendResponse({ success: true }));
      return true;
  }
});

// Handle chrome.alarms for reliable background timing
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'timeTrackerSave') {
    if (timeTracker.isTracking && timeTracker.activeTab && timeTracker.siteStartTime && !timeTracker.isUserIdle()) {
      const currentTime = Date.now();
      const timeSinceLastSave = currentTime - (timeTracker.lastSaveTime || timeTracker.siteStartTime);
      
      // Save if significant time has passed
      if (timeSinceLastSave >= 5000) { // Reduced to 5 seconds minimum
        await timeTracker.saveCurrentSession();
      }
    }
  }
}); 