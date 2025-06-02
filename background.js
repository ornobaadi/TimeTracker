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
    
    // If screenshots are enabled, request permission and start capture
    if (screenshotManager.isScreenshotEnabled) {
      console.log('TimeTracker: Screenshots enabled, requesting permission...');
      await screenshotManager.initializeScreenCapture();
    }
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
    
    // Stop screen capture when tracking stops
    await screenshotManager.stopScreenCapture();

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

// Screenshot management class
class ScreenshotManager {
  constructor() {
    this.isScreenshotEnabled = false;
    this.screenshotInterval = 60000; // 1 minute in milliseconds
    this.offscreenDocumentCreated = false;
    this.maxStoredScreenshots = 100; // Limit stored screenshots to prevent storage overflow
    this.isScreenCaptureActive = false;
    this.permissionGranted = false;
  }

  async init() {
    // Get screenshot settings from storage
    const result = await chrome.storage.local.get(['screenshotEnabled', 'screenshotInterval']);
    this.isScreenshotEnabled = result.screenshotEnabled || false;
    this.screenshotInterval = result.screenshotInterval || 60000;
    
    // Only start automatic screenshots if tracking is already active
    if (this.isScreenshotEnabled && timeTracker.isTracking) {
      await this.initializeScreenCapture();
    } else if (this.isScreenshotEnabled) {
      // If screenshots are enabled but tracking isn't active, just start the alarm
      await this.startScreenshots();
    }
  }

  async initializeScreenCapture() {
    if (this.isScreenCaptureActive) {
      console.log('Screenshot: Screen capture already active');
      return { success: true };
    }

    try {
      await this.createOffscreenDocument();
      
      // Request initial screen capture permission
      console.log('Screenshot: Requesting screen capture permission...');
      const result = await this.requestScreenCapturePermission();
      
      if (result.success) {
        this.isScreenCaptureActive = true;
        this.permissionGranted = true;
        await this.startScreenshots();
        console.log('Screenshot: Screen capture initialized successfully');
        return { success: true };
      } else {
        console.error('Screenshot: Failed to get permission:', result.error);
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('Screenshot: Failed to initialize screen capture:', error);
      return { success: false, error: error.message };
    }
  }

  async stopScreenCapture() {
    if (!this.isScreenCaptureActive) return;
    
    console.log('Screenshot: Stopping screen capture...');
    this.isScreenCaptureActive = false;
    this.permissionGranted = false;
    
    // Tell offscreen document to stop capture
    if (this.offscreenDocumentCreated) {
      chrome.runtime.sendMessage({
        action: 'stopScreenCapture',
        source: 'background'
      }).catch(() => {
        // Ignore errors if offscreen document is not responsive
      });
    }
    
    chrome.alarms.clear('takeScreenshot');
    console.log('Screenshot: Screen capture stopped');
  }

  async requestScreenCapturePermission() {
    return new Promise((resolve) => {
      const messageListener = (message, sender, sendResponse) => {
        if (message.action === 'permissionResult') {
          chrome.runtime.onMessage.removeListener(messageListener);
          resolve({
            success: message.success,
            error: message.error
          });
        }
      };
      
      chrome.runtime.onMessage.addListener(messageListener);
      
      // Request permission from offscreen document
      chrome.runtime.sendMessage({
        action: 'requestPermission',
        source: 'background'
      }).catch(() => {
        // If direct message fails, the offscreen document will still receive it
      });
      
      // Timeout after 30 seconds
      setTimeout(() => {
        chrome.runtime.onMessage.removeListener(messageListener);
        resolve({ success: false, error: 'Permission request timeout' });
      }, 30000);
    });
  }

  async takeScreenshot() {
    if (!this.isScreenCaptureActive) {
      // Try to initialize if not active
      const initResult = await this.initializeScreenCapture();
      if (!initResult.success) {
        return { success: false, error: 'Screen capture not available: ' + initResult.error };
      }
    }

    try {
      await this.createOffscreenDocument();
      
      return new Promise((resolve) => {
        const messageListener = (message, sender, sendResponse) => {
          if (message.action === 'screenshotResult') {
            chrome.runtime.onMessage.removeListener(messageListener);
            if (message.success) {
              this.saveScreenshot(message.screenshot, message.timestamp)
                .then(() => resolve({ success: true, timestamp: message.timestamp }))
                .catch((error) => resolve({ success: false, error: error.message }));
            } else {
              // If screenshot failed due to permission, try to reinitialize
              if (message.error.includes('permission') || message.error.includes('Permission')) {
                this.isScreenCaptureActive = false;
                this.permissionGranted = false;
              }
              resolve({ success: false, error: message.error });
            }
          }
        };
        
        chrome.runtime.onMessage.addListener(messageListener);
        
        // Send message to capture screenshot using existing stream
        chrome.runtime.sendMessage({
          action: 'captureScreenshotFromStream',
          source: 'background'
        }).catch(() => {
          // If direct message fails, the offscreen document will still receive it
        });
        
        // Timeout after 10 seconds
        setTimeout(() => {
          chrome.runtime.onMessage.removeListener(messageListener);
          resolve({ success: false, error: 'Screenshot capture timeout' });
        }, 10000);
      });
      
    } catch (error) {
      console.error('Screenshot capture failed:', error);
      return { success: false, error: error.message };
    }
  }

  async createOffscreenDocument() {
    if (this.offscreenDocumentCreated) return;
    
    try {
      // Check if offscreen document already exists
      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
      });
      
      if (existingContexts.length > 0) {
        this.offscreenDocumentCreated = true;
        console.log('Offscreen document already exists');
        return;
      }
      
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['DISPLAY_MEDIA'],
        justification: 'Taking screenshots for time tracking purposes'
      });
      this.offscreenDocumentCreated = true;
      console.log('Offscreen document created successfully');
    } catch (error) {
      console.error('Failed to create offscreen document:', error);
      this.offscreenDocumentCreated = false;
      throw error;
    }
  }

  async closeOffscreenDocument() {
    if (!this.offscreenDocumentCreated) return;
    
    try {
      await chrome.offscreen.closeDocument();
      this.offscreenDocumentCreated = false;
    } catch (error) {
      console.error('Failed to close offscreen document:', error);
    }
  }

  async saveScreenshot(screenshotData, timestamp) {
    try {
      // Get existing screenshots
      const result = await chrome.storage.local.get(['screenshots']);
      let screenshots = result.screenshots || [];
      
      // Add new screenshot
      const screenshotEntry = {
        id: `screenshot_${timestamp}`,
        data: screenshotData,
        timestamp: timestamp,
        date: new Date(timestamp).toDateString(),
        size: screenshotData.length
      };
      
      screenshots.push(screenshotEntry);
      
      // Limit the number of stored screenshots
      if (screenshots.length > this.maxStoredScreenshots) {
        screenshots = screenshots.slice(-this.maxStoredScreenshots);
      }
      
      await chrome.storage.local.set({ screenshots });
      console.log(`Screenshot saved: ${new Date(timestamp).toLocaleString()}`);
      
    } catch (error) {
      console.error('Failed to save screenshot:', error);
      throw error;
    }
  }

  async startScreenshots() {
    if (!this.isScreenshotEnabled) return;
    
    // Create alarm for periodic screenshots
    chrome.alarms.create('takeScreenshot', {
      delayInMinutes: this.screenshotInterval / 60000, // Convert to minutes
      periodInMinutes: this.screenshotInterval / 60000
    });
    
    console.log(`Screenshot capture started - interval: ${this.screenshotInterval / 1000}s`);
  }

  async stopScreenshots() {
    chrome.alarms.clear('takeScreenshot');
    await this.closeOffscreenDocument();
    console.log('Screenshot capture stopped');
  }

  async enableScreenshots(interval = 60000) {
    this.isScreenshotEnabled = true;
    this.screenshotInterval = interval;
    
    await chrome.storage.local.set({
      screenshotEnabled: true,
      screenshotInterval: interval
    });
    
    // If tracking is active, initialize screen capture immediately
    if (timeTracker.isTracking) {
      await this.initializeScreenCapture();
    } else {
      // If not tracking, just start the alarm (permission will be requested when tracking starts)
      await this.startScreenshots();
    }
  }

  async disableScreenshots() {
    this.isScreenshotEnabled = false;
    
    await chrome.storage.local.set({
      screenshotEnabled: false
    });
    
    await this.stopScreenCapture();
  }

  async getStoredScreenshots(limit = 50) {
    const result = await chrome.storage.local.get(['screenshots']);
    const screenshots = result.screenshots || [];
    
    // Return latest screenshots with metadata only (no data for listing)
    return screenshots.slice(-limit).map(screenshot => ({
      id: screenshot.id,
      timestamp: screenshot.timestamp,
      date: screenshot.date,
      size: screenshot.size
    }));
  }

  async getScreenshot(screenshotId) {
    const result = await chrome.storage.local.get(['screenshots']);
    const screenshots = result.screenshots || [];
    
    return screenshots.find(screenshot => screenshot.id === screenshotId);
  }

  async deleteOldScreenshots(daysToKeep = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    const result = await chrome.storage.local.get(['screenshots']);
    const screenshots = result.screenshots || [];
    
    const filteredScreenshots = screenshots.filter(screenshot => 
      new Date(screenshot.timestamp) > cutoffDate
    );
    
    await chrome.storage.local.set({ screenshots: filteredScreenshots });
    
    const deletedCount = screenshots.length - filteredScreenshots.length;
    console.log(`Deleted ${deletedCount} old screenshots`);
    
    return deletedCount;
  }

  async clearAllScreenshots() {
    await chrome.storage.local.set({ screenshots: [] });
    console.log('All screenshots cleared');
  }

  getStatus() {
    return {
      isEnabled: this.isScreenshotEnabled,
      interval: this.screenshotInterval,
      intervalMinutes: this.screenshotInterval / 60000
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

// Initialize screenshot manager
const screenshotManager = new ScreenshotManager();
screenshotManager.init();

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
    // Screenshot related actions
    case 'getScreenshotStatus':
      sendResponse(screenshotManager.getStatus());
      break;
    case 'enableScreenshots':
      screenshotManager.enableScreenshots(request.interval).then(() => 
        sendResponse({ success: true })
      );
      return true;
    case 'disableScreenshots':
      screenshotManager.disableScreenshots().then(() => 
        sendResponse({ success: true })
      );
      return true;
    case 'takeScreenshot':
      screenshotManager.takeScreenshot().then(sendResponse);
      return true;
    case 'getStoredScreenshots':
      screenshotManager.getStoredScreenshots(request.limit).then(sendResponse);
      return true;
    case 'getScreenshot':
      screenshotManager.getScreenshot(request.screenshotId).then(sendResponse);
      return true;
    case 'deleteOldScreenshots':
      screenshotManager.deleteOldScreenshots(request.days).then(result => 
        sendResponse({ deletedCount: result })
      );
      return true;
    case 'clearAllScreenshots':
      screenshotManager.clearAllScreenshots().then(() => 
        sendResponse({ success: true })
      );
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
  } else if (alarm.name === 'takeScreenshot') {
    // Take periodic screenshot
    if (screenshotManager.isScreenshotEnabled) {
      // Only take screenshot if tracking is active (which means permission should be granted)
      if (timeTracker.isTracking && screenshotManager.isScreenCaptureActive) {
        const result = await screenshotManager.takeScreenshot();
        if (result.success) {
          console.log('Automatic screenshot taken:', new Date(result.timestamp).toLocaleString());
        } else {
          console.error('Automatic screenshot failed:', result.error);
        }
      } else if (timeTracker.isTracking && !screenshotManager.isScreenCaptureActive) {
        // Try to initialize screen capture if tracking is active but capture isn't
        console.log('Attempting to initialize screen capture for automatic screenshot...');
        const initResult = await screenshotManager.initializeScreenCapture();
        if (initResult.success) {
          const result = await screenshotManager.takeScreenshot();
          if (result.success) {
            console.log('Automatic screenshot taken after initialization:', new Date(result.timestamp).toLocaleString());
          }
        } else {
          console.error('Failed to initialize screen capture for automatic screenshot:', initResult.error);
        }
      }
      // If tracking is not active, skip automatic screenshots
    }
  }
}); 