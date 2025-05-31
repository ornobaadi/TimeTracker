// TimeTracker Pro - Background Script
class TimeTracker {
  constructor() {
    this.isTracking = false;
    this.sessionStartTime = null;
    this.activeTab = null;
    this.siteStartTime = null;
    this.saveInterval = null;
    this.lastSaveTime = null; // Track when we last saved to avoid data loss
    this.init();
  }

  async init() {
    // Restore state on startup
    const result = await chrome.storage.local.get(['isTracking', 'sessionStartTime']);
    this.isTracking = result.isTracking || false;
    this.sessionStartTime = result.sessionStartTime || null;
    
    // Always set up event listeners, they check tracking state internally
    this.setupEventListeners();
    
    if (this.isTracking) {
      this.getCurrentActiveTab();
      this.startPeriodicSave();
    }
  }

  setupEventListeners() {
    // Tab activation
    chrome.tabs.onActivated.addListener((activeInfo) => {
      if (this.isTracking) {
        this.handleTabChange(activeInfo.tabId);
      }
    });

    // Tab updates
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (this.isTracking && changeInfo.status === 'complete' && tab.active) {
        this.handleTabChange(tabId);
      }
    });

    // Window focus changes
    chrome.windows.onFocusChanged.addListener((windowId) => {
      if (this.isTracking) {
        if (windowId === chrome.windows.WINDOW_ID_NONE) {
          this.handleTabChange(null);
        } else {
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
    if (this.activeTab && this.siteStartTime) {
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
      });
    } else {
      this.activeTab = null;
      this.siteStartTime = null;
      this.lastSaveTime = null;
    }
  }

  async saveTimeSpent() {
    if (!this.activeTab || !this.siteStartTime) return;

    const currentTime = Date.now();
    const timeSpent = currentTime - this.siteStartTime;
    
    // Only save if more than 2 seconds spent
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
          dailyTime: {}
        };
      }

      // Update total time and visits using precise timing
      timeData[domain].totalTime += timeSpent;
      timeData[domain].visits += 1;
      timeData[domain].lastVisit = currentTime;
      timeData[domain].title = this.activeTab.title || domain;

      // Update daily time using precise timing
      if (!timeData[domain].dailyTime[today]) {
        timeData[domain].dailyTime[today] = 0;
      }
      timeData[domain].dailyTime[today] += timeSpent;

      await chrome.storage.local.set({ timeData });
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
    
    // Fallback setInterval for immediate response
    this.saveInterval = setInterval(async () => {
      if (this.isTracking && this.activeTab && this.siteStartTime) {
        // Calculate precise time since last save
        const currentTime = Date.now();
        const timeSinceLastSave = currentTime - (this.lastSaveTime || this.siteStartTime);
        
        // Only save if significant time has passed to avoid excessive storage writes
        if (timeSinceLastSave >= 8000) { // 8 seconds minimum
          await this.saveCurrentSession();
        }
      }
    }, 10000); // 10 seconds for backup saves
  }

  async saveCurrentSession() {
    if (!this.activeTab || !this.siteStartTime) return;

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
          dailyTime: {}
        };
      }

      // Add incremental time since last save
      timeData[domain].totalTime += timeSinceLastSave;
      timeData[domain].lastVisit = currentTime;
      timeData[domain].title = this.activeTab.title || domain;

      // Update daily time incrementally
      if (!timeData[domain].dailyTime[today]) {
        timeData[domain].dailyTime[today] = 0;
      }
      timeData[domain].dailyTime[today] += timeSinceLastSave;

      await chrome.storage.local.set({ timeData });
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
    
    console.log('TimeTracker: Starting tracking at', new Date(this.sessionStartTime).toISOString(), 'timestamp:', this.sessionStartTime);
    
    await chrome.storage.local.set({
      isTracking: true,
      sessionStartTime: this.sessionStartTime
    });

    this.getCurrentActiveTab();
    this.startPeriodicSave();
  }

  async stopTracking() {
    // Save current site time before stopping using precise timing
    if (this.activeTab && this.siteStartTime) {
      await this.saveTimeSpent();
    }

    this.isTracking = false;
    this.sessionStartTime = null;
    this.activeTab = null;
    this.siteStartTime = null;
    this.lastSaveTime = null;
    this.stopPeriodicSave();

    await chrome.storage.local.set({
      isTracking: false,
      sessionStartTime: null
    });
  }

  getCurrentSessionData() {
    if (!this.isTracking || !this.activeTab || !this.siteStartTime) {
      return null;
    }
    
    const currentTime = Date.now();
    
    return {
      domain: this.extractDomain(this.activeTab.url),
      title: this.activeTab.title || this.extractDomain(this.activeTab.url),
      favicon: this.activeTab.favIconUrl || '',
      currentTime: currentTime - this.siteStartTime, // Precise current site time
      sessionTime: currentTime - this.sessionStartTime, // Precise session time
      timeSinceLastSave: currentTime - (this.lastSaveTime || this.siteStartTime) // Unsaved time
    };
  }

  // New method to get real-time session statistics
  async getSessionStats() {
    const currentTime = Date.now();
    
    if (!this.isTracking || !this.sessionStartTime) {
      return { 
        sessionTime: 0, 
        todayTotal: await this.getTodayTotalFromStorage(),
        isTracking: false
      };
    }

    const sessionTime = currentTime - this.sessionStartTime;
    
    // Calculate today's total including current unsaved session
    const today = new Date().toDateString();
    const result = await chrome.storage.local.get(['timeData']);
    const timeData = result.timeData || {};
    
    let todayTotal = 0;
    Object.values(timeData).forEach(siteData => {
      if (siteData.dailyTime && siteData.dailyTime[today]) {
        todayTotal += siteData.dailyTime[today];
      }
    });
    
    // Add current unsaved session time to today's total
    if (this.activeTab && this.siteStartTime) {
      const unsavedTime = currentTime - (this.lastSaveTime || this.siteStartTime);
      if (unsavedTime >= 0) {
        todayTotal += unsavedTime;
      }
    }
    
    return {
      sessionTime,
      todayTotal,
      isTracking: true,
      currentSite: this.activeTab ? this.extractDomain(this.activeTab.url) : null,
      debug: {
        sessionStartTime: this.sessionStartTime,
        currentTime: currentTime,
        calculated: sessionTime,
        lastSaveTime: this.lastSaveTime,
        siteStartTime: this.siteStartTime
      }
    };
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
    if (timeTracker.isTracking && timeTracker.activeTab && timeTracker.siteStartTime) {
      const currentTime = Date.now();
      const timeSinceLastSave = currentTime - (timeTracker.lastSaveTime || timeTracker.siteStartTime);
      
      // Save if significant time has passed
      if (timeSinceLastSave >= 8000) { // 8 seconds minimum
        await timeTracker.saveCurrentSession();
      }
    }
  }
}); 