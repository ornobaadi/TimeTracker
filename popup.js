// TimeTracker Pro - Real-time Stopwatch Implementation
class TimeTrackerUI {
    constructor() {
        this.isTracking = false;
        this.sessionStartTime = null;
        this.dataUpdateInterval = null;
        this.sessionTimerInterval = null;
        this.lastUpdateTime = null;
        this.lastUpdateInterval = null;
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.updateStatus();
        await this.updateScreenshotStatus();
        await this.loadData();
        this.startTimerUpdates();
        this.startLastUpdatedTimer();
    }

    setupEventListeners() {
        // Header tracking button
        document.getElementById('trackingBtn').addEventListener('click', () => {
            if (this.isTracking) {
                this.handleClockOut();
            } else {
                this.handleClockIn();
            }
        });

        // Clear data button
        document.getElementById('clearBtn').addEventListener('click', () => {
            this.clearAllData();
        });

        // Dashboard button
        document.getElementById('dashboardBtn').addEventListener('click', () => {
            this.showNotification('Dashboard feature coming soon!', 'info');
        });

        // Screenshot controls
        document.getElementById('screenshotToggleBtn').addEventListener('click', () => {
            this.toggleScreenshots();
        });

        document.getElementById('screenshotInterval').addEventListener('change', (e) => {
            this.updateScreenshotInterval(parseInt(e.target.value));
        });

        document.getElementById('takeScreenshotBtn').addEventListener('click', () => {
            this.takeScreenshotNow();
        });

        document.getElementById('viewScreenshotsBtn').addEventListener('click', () => {
            this.viewStoredScreenshots();
        });
    }

    async sendMessage(message) {
        return new Promise((resolve) => {
            console.log('Popup: Sending message:', message);
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Popup: Runtime error:', chrome.runtime.lastError);
                    resolve(null);
                } else {
                    console.log('Popup: Received response:', response);
                    resolve(response);
                }
            });
        });
    }

    async updateStatus() {
        try {
            const status = await this.sendMessage({ action: 'getStatus' });
            this.isTracking = status.isTracking;
            this.sessionStartTime = status.sessionStartTime;
            
            this.updateUI();
        } catch (error) {
            console.error('Error updating status:', error);
        }
    }

    updateUI() {
        const trackingBtn = document.getElementById('trackingBtn');
        const trackingIcon = document.getElementById('trackingIcon');
        const trackingText = document.getElementById('trackingText');
        const sessionTimerSection = document.getElementById('sessionTimerSection');

        if (this.isTracking) {
            // Update button to stop tracking
            trackingBtn.classList.add('tracking');
            trackingIcon.textContent = '';
            trackingText.textContent = 'Stop Tracking';
            
            // Show session timer
            sessionTimerSection.style.display = 'block';
            
            // Start real-time session timer
            this.startSessionTimer();
        } else {
            // Update button to start tracking
            trackingBtn.classList.remove('tracking');
            trackingIcon.textContent = '';
            trackingText.textContent = 'Start Tracking';
            
            // Hide session timer
            sessionTimerSection.style.display = 'none';
            
            // Stop session timer
            this.stopSessionTimer();
        }
    }

    startSessionTimer() {
        // Clear any existing timer
        this.stopSessionTimer();
        
        // Update session timer every 500ms for smooth real-time display
        this.sessionTimerInterval = setInterval(() => {
            this.updateSessionDisplay();
        }, 500);
        
        // Update immediately
        this.updateSessionDisplay();
    }

    async updateSessionDisplay() {
        if (!this.isTracking || !this.sessionStartTime) {
            document.getElementById('sessionTimeDisplay').textContent = '0:00:00';
            return;
        }

        try {
            // Use local calculation for smooth display, verify with backend periodically
            const localSessionTime = Date.now() - this.sessionStartTime;
            document.getElementById('sessionTimeDisplay').textContent = this.formatStopwatchTime(localSessionTime);
            
            // Verify with backend every 10 seconds
            if (!this.lastBackendSync || Date.now() - this.lastBackendSync > 10000) {
                const stats = await this.sendMessage({ action: 'getSessionStats' });
                if (stats && stats.sessionTime) {
                    // Sync with backend time if there's a significant difference
                    const timeDiff = Math.abs(localSessionTime - stats.sessionTime);
                    if (timeDiff > 2000) { // More than 2 seconds difference
                        this.sessionStartTime = Date.now() - stats.sessionTime;
                    }
                }
                this.lastBackendSync = Date.now();
            }
        } catch (error) {
            console.error('Error updating session display:', error);
        }
    }

    stopSessionTimer() {
        if (this.sessionTimerInterval) {
            clearInterval(this.sessionTimerInterval);
            this.sessionTimerInterval = null;
        }
    }

    formatStopwatchTime(milliseconds) {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    async handleClockOut() {
        try {
            // Get session stats before stopping for summary
            const finalStats = await this.sendMessage({ action: 'getSessionStats' });
            
            // Get the current FOCUSED TODAY value to use as Active Time
            const currentTotalActiveTime = document.getElementById('totalTimeLarge').textContent;
            const focusedTodayMs = this.parseTimeToMs(currentTotalActiveTime);
            
            await this.sendMessage({ action: 'stopTracking' });
            this.isTracking = false;
            this.sessionStartTime = null;
            this.lastBackendSync = null;
            
            this.updateUI();
            await this.loadData();
            
            // Show session summary with corrected values
            if (finalStats) {
                // Override the active time with FOCUSED TODAY value
                finalStats.sessionActiveTime = focusedTodayMs;
                // Recalculate idle time: Total Session - Active Time
                finalStats.idleTime = Math.max(0, finalStats.sessionTime - focusedTodayMs);
                this.showInlineSessionSummary(finalStats);
            }
            
            this.showNotification('Tracking stopped!', 'success');
        } catch (error) {
            console.error('Error stopping tracking:', error);
            this.showNotification('Failed to stop tracking', 'error');
        }
    }

    // Helper method to parse time string to milliseconds
    parseTimeToMs(timeString) {
        const parts = timeString.split(':');
        if (parts.length === 2) {
            const minutes = parseInt(parts[0]) || 0;
            const seconds = parseInt(parts[1]) || 0;
            return (minutes * 60 + seconds) * 1000;
        }
        return 0;
    }

    showInlineSessionSummary(sessionStats) {
        // Remove any existing session summary
        const existingSummary = document.getElementById('sessionSummary');
        if (existingSummary) {
            existingSummary.remove();
        }

        // Use exact values from sessionStats - no recalculation
        const sessionTime = this.formatStopwatchTime(sessionStats.sessionTime || 0);
        const activeTime = this.formatStopwatchTime(sessionStats.sessionActiveTime || 0);
        const idleTime = this.formatStopwatchTime(sessionStats.idleTime || 0);
        
        // Calculate efficiency percentage
        const efficiency = sessionStats.sessionTime > 0 ? 
            Math.round(((sessionStats.sessionActiveTime || 0) / sessionStats.sessionTime) * 100) : 0;

        // Create session summary element
        const summaryHTML = `
            <section class="session-summary-section" id="sessionSummary">
                <div class="session-summary-header">
                    <div class="summary-title">
                        <span class="summary-icon">📊</span>
                        <span>Last Session Summary</span>
                    </div>
                    <button class="summary-close" id="closeSummary">✕</button>
                </div>
                <div class="session-summary-grid">
                    <div class="summary-stat">
                        <div class="stat-value">${sessionTime}</div>
                        <div class="stat-label">Total Session</div>
                    </div>
                    <div class="summary-stat active">
                        <div class="stat-value">${activeTime}</div>
                        <div class="stat-label">Active Time</div>
                    </div>
                    <div class="summary-stat idle">
                        <div class="stat-value">${idleTime}</div>
                        <div class="stat-label">Idle Time</div>
                    </div>
                </div>
                <div class="efficiency-bar-container">
                    <div class="efficiency-label">Focus Efficiency: ${efficiency}%</div>
                    <div class="efficiency-bar">
                        <div class="efficiency-fill" style="width: ${efficiency}%"></div>
                    </div>
                </div>
            </section>
        `;
        
        // Insert before footer
        const footer = document.querySelector('.footer');
        footer.insertAdjacentHTML('beforebegin', summaryHTML);
        
        // Add close handler
        document.getElementById('closeSummary').addEventListener('click', () => {
            document.getElementById('sessionSummary').remove();
        });
    }

    async handleClockIn() {
        try {
            // Remove any existing session summary when starting new session
            const existingSummary = document.getElementById('sessionSummary');
            if (existingSummary) {
                existingSummary.remove();
            }

            await this.sendMessage({ action: 'startTracking' });
            
            // Get the actual start time from backend for accuracy
            const status = await this.sendMessage({ action: 'getStatus' });
            this.isTracking = true;
            this.sessionStartTime = status.sessionStartTime;
            this.lastBackendSync = Date.now();
            
            this.updateUI();
            await this.loadData();
            this.showNotification('Tracking started!', 'success');
        } catch (error) {
            console.error('Error starting tracking:', error);
            this.showNotification('Failed to start tracking', 'error');
        }
    }

    async loadData() {
        try {
            const [todayData, currentSession, sessionStats] = await Promise.all([
                this.sendMessage({ action: 'getTodayData' }),
                this.isTracking ? this.sendMessage({ action: 'getCurrentSession' }) : null,
                this.isTracking ? this.sendMessage({ action: 'getSessionStats' }) : null
            ]);

            this.lastUpdateTime = Date.now();
            this.updateLastUpdatedDisplay();
            await this.renderData(todayData, currentSession, sessionStats);
        } catch (error) {
            console.error('Error loading data:', error);
        }
    }

    async renderData(todayData, currentSession, sessionStats) {
        // FOCUSED TODAY should exactly match session active time if tracking
        let totalActiveTime = 0;
        
        if (this.isTracking && sessionStats) {
            // When tracking, FOCUSED TODAY = today's stored active time + current session active time
            const storedTodayActive = await this.sendMessage({ action: 'getTodayData' });
            let storedActiveTotal = 0;
            
            Object.values(storedTodayActive).forEach(siteData => {
                storedActiveTotal += (siteData.activeTime || siteData.time || 0);
            });
            
            // Add current session active time (this ensures FOCUSED TODAY matches session summary)
            totalActiveTime = storedActiveTotal + (sessionStats.sessionActiveTime || 0);
        } else {
            // When not tracking, use stored active data only
            const sites = Object.entries(todayData);
            totalActiveTime = sites.reduce((sum, [, siteData]) => {
                return sum + (siteData.activeTime || siteData.time || 0);
            }, 0);
        }

        // Clone data to include current session for site display
        let allData = { ...todayData };
        
        // Add current session data if tracking
        if (this.isTracking && currentSession && sessionStats) {
            const domain = currentSession.domain;
            if (!allData[domain]) {
                allData[domain] = {
                    time: 0,
                    activeTime: 0,
                    title: currentSession.title,
                    favicon: currentSession.favicon,
                    visits: 0
                };
            }
            
            // Calculate current session time for this site (ensure it doesn't exceed session time)
            let currentSiteSessionTime = 0;
            if (!sessionStats.isIdle && currentSession.timeSinceLastSave >= 0) {
                // Ensure site time doesn't exceed total session active time
                currentSiteSessionTime = Math.min(
                    currentSession.timeSinceLastSave,
                    sessionStats.sessionActiveTime || 0,
                    sessionStats.sessionTime || 0
                );
            }
            
            allData[domain] = {
                ...allData[domain],
                time: allData[domain].time + currentSiteSessionTime,
                activeTime: (allData[domain].activeTime || allData[domain].time || 0) + currentSiteSessionTime,
                title: currentSession.title,
                favicon: currentSession.favicon || allData[domain].favicon
            };
        }

        const sites = Object.entries(allData);

        // Update FOCUSED TODAY with the accurate active time
        document.getElementById('totalTimeLarge').textContent = this.formatTimeHHMM(totalActiveTime);

        // Update top site
        if (sites.length > 0) {
            // Sort by active time if available, otherwise by regular time
            sites.sort(([,a], [,b]) => (b.activeTime || b.time) - (a.activeTime || a.time));
            this.updateTopSite(sites[0]);
        } else {
            // Show default when no data
            document.getElementById('topSite').innerHTML = `
                <div class="site-favicon-large">📄</div>
                <div class="site-info">
                    <div class="site-domain">No data yet</div>
                    <div class="site-time-large">0:00</div>
                </div>
            `;
        }

        // Update sites list
        this.renderSitesList(sites);
    }

    updateTopSite(topSiteEntry) {
        const topSite = document.getElementById('topSite');
        const [domain, siteData] = topSiteEntry;
        
        // Use active time if available, otherwise fall back to regular time
        const displayTime = siteData.activeTime || siteData.time || 0;

        topSite.innerHTML = `
            <div class="site-favicon-large">
                ${siteData.favicon ? 
                    `<img src="${siteData.favicon}" alt="${domain}" style="width: 100%; height: 100%; border-radius: 8px; object-fit: cover;" onerror="this.parentElement.innerHTML='${domain.charAt(0).toUpperCase()}'">` :
                    domain.charAt(0).toUpperCase()
                }
            </div>
            <div class="site-info">
                <div class="site-domain">${domain}</div>
                <div class="site-time-large">${this.formatTimeHHMM(displayTime)}</div>
            </div>
        `;
    }

    renderSitesList(sites) {
        const sitesList = document.getElementById('sitesList');
        
        if (sites.length === 0) {
            sitesList.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: var(--text-secondary);">
                    <div style="font-size: 32px; margin-bottom: 12px;">📊</div>
                    <p>Start tracking to see your activity</p>
                </div>
            `;
            return;
        }

        // Sort by active time if available, otherwise by regular time, and take top 5
        sites.sort(([,a], [,b]) => (b.activeTime || b.time) - (a.activeTime || a.time));
        const topSites = sites.slice(0, 5);

        const sitesHtml = topSites.map(([domain, siteData]) => {
            // Use active time if available, otherwise fall back to regular time
            const displayTime = siteData.activeTime || siteData.time || 0;
            
            return `
                <div class="site-item-clean">
                    <div class="site-favicon-small">
                        ${siteData.favicon ? 
                            `<img src="${siteData.favicon}" alt="${domain}" onerror="this.parentElement.innerHTML='${domain.charAt(0).toUpperCase()}'">` :
                            domain.charAt(0).toUpperCase()
                        }
                    </div>
                    <div class="site-details-clean">
                        <div class="site-name">${domain}</div>
                    </div>
                    <div class="site-time-small">${this.formatTimeHHMM(displayTime)}</div>
                </div>
            `;
        }).join('');

        sitesList.innerHTML = sitesHtml;
    }

    updateLastUpdatedDisplay() {
        if (!this.lastUpdateTime) return;
        
        const secondsAgo = Math.floor((Date.now() - this.lastUpdateTime) / 1000);
        const lastUpdatedElement = document.getElementById('lastUpdated');
        
        if (!lastUpdatedElement) return;
        
        if (secondsAgo < 5) {
            lastUpdatedElement.textContent = 'Last updated: Just now';
        } else if (secondsAgo < 60) {
            lastUpdatedElement.textContent = `Last updated: ${secondsAgo}s ago`;
        } else {
            const minutesAgo = Math.floor(secondsAgo / 60);
            lastUpdatedElement.textContent = `Last updated: ${minutesAgo}m ago`;
        }
    }

    startLastUpdatedTimer() {
        // Update the "last updated" display every 5 seconds
        this.lastUpdateInterval = setInterval(() => {
            this.updateLastUpdatedDisplay();
        }, 5000);
    }

    async clearAllData() {
        if (confirm('Clear all tracking data?\n\nThis action cannot be undone.')) {
            try {
                await this.sendMessage({ action: 'clearData' });
                await this.loadData();
                this.showNotification('Data cleared successfully!', 'success');
            } catch (error) {
                console.error('Error clearing data:', error);
                this.showNotification('Failed to clear data', 'error');
            }
        }
    }

    formatTimeHHMM(milliseconds) {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${(totalSeconds % 60).toString().padStart(2, '0')}`;
    }

    showNotification(message, type = 'info') {
        // Remove existing notifications
        const existingNotification = document.querySelector('.notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        const notification = document.createElement('div');
        notification.className = 'notification';
        
        const colors = {
            success: 'var(--success)',
            error: 'var(--danger)',
            info: 'var(--primary)'
        };
        
        notification.style.background = colors[type];
        notification.textContent = message;
        document.body.appendChild(notification);
        
        // Auto remove after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 3000);
    }

    startTimerUpdates() {
        // Update website data every 3 seconds for faster responsiveness
        this.dataUpdateInterval = setInterval(async () => {
            if (this.isTracking) {
                await this.loadData();
            }
        }, 3000);
    }

    stopTimerUpdates() {
        if (this.dataUpdateInterval) {
            clearInterval(this.dataUpdateInterval);
            this.dataUpdateInterval = null;
        }
        if (this.sessionTimerInterval) {
            clearInterval(this.sessionTimerInterval);
            this.sessionTimerInterval = null;
        }
        if (this.lastUpdateInterval) {
            clearInterval(this.lastUpdateInterval);
            this.lastUpdateInterval = null;
        }
    }

    // Screenshot functionality
    async updateScreenshotStatus() {
        try {
            const status = await this.sendMessage({ action: 'getScreenshotStatus' });
            this.updateScreenshotUI(status);
        } catch (error) {
            console.error('Error updating screenshot status:', error);
        }
    }

    updateScreenshotUI(status) {
        const toggleBtn = document.getElementById('screenshotToggleBtn');
        const toggleText = document.getElementById('screenshotToggleText');
        const intervalDiv = document.getElementById('screenshotIntervalDiv');
        const intervalSelect = document.getElementById('screenshotInterval');

        if (status.isEnabled) {
            toggleBtn.classList.add('active');
            toggleText.textContent = 'ON';
            intervalDiv.style.display = 'flex';
            intervalSelect.value = status.interval.toString();
        } else {
            toggleBtn.classList.remove('active');
            toggleText.textContent = 'OFF';
            intervalDiv.style.display = 'none';
        }
    }

    async toggleScreenshots() {
        try {
            const currentStatus = await this.sendMessage({ action: 'getScreenshotStatus' });
            
            if (!currentStatus) {
                throw new Error('Failed to get current screenshot status');
            }
            
            if (currentStatus.isEnabled) {
                const result = await this.sendMessage({ action: 'disableScreenshots' });
                if (result && result.success) {
                    this.showNotification('Screenshots disabled', 'info');
                } else {
                    throw new Error('Failed to disable screenshots');
                }
            } else {
                const interval = parseInt(document.getElementById('screenshotInterval').value) || 60000;
                const result = await this.sendMessage({ action: 'enableScreenshots', interval });
                if (result && result.success) {
                    // Check if tracking is active
                    const trackingStatus = await this.sendMessage({ action: 'getStatus' });
                    if (trackingStatus && trackingStatus.isTracking) {
                        this.showNotification('Screenshots enabled! You may be prompted for screen sharing permission.', 'success');
                    } else {
                        this.showNotification('Screenshots enabled! Permission will be requested when you start tracking.', 'success');
                    }
                } else {
                    throw new Error('Failed to enable screenshots');
                }
            }
            
            await this.updateScreenshotStatus();
        } catch (error) {
            console.error('Error toggling screenshots:', error);
            this.showNotification(`Failed to toggle screenshots: ${error.message}`, 'error');
        }
    }

    async updateScreenshotInterval(interval) {
        try {
            const currentStatus = await this.sendMessage({ action: 'getScreenshotStatus' });
            
            if (currentStatus.isEnabled) {
                await this.sendMessage({ action: 'enableScreenshots', interval });
                this.showNotification(`Screenshot interval updated to ${interval / 60000} minute(s)`, 'success');
            }
        } catch (error) {
            console.error('Error updating screenshot interval:', error);
            this.showNotification('Failed to update interval', 'error');
        }
    }

    async takeScreenshotNow() {
        try {
            const takeBtn = document.getElementById('takeScreenshotBtn');
            takeBtn.textContent = 'Taking...';
            takeBtn.disabled = true;
            
            const result = await this.sendMessage({ action: 'takeScreenshot' });
            
            // Add better error handling for undefined or invalid responses
            if (!result) {
                throw new Error('No response received from background script');
            }
            
            if (result.success) {
                this.showNotification('Screenshot captured successfully!', 'success');
            } else {
                this.showNotification(`Screenshot failed: ${result.error || 'Unknown error'}`, 'error');
            }
        } catch (error) {
            console.error('Error taking screenshot:', error);
            this.showNotification(`Failed to take screenshot: ${error.message}`, 'error');
        } finally {
            const takeBtn = document.getElementById('takeScreenshotBtn');
            takeBtn.textContent = 'Take Now';
            takeBtn.disabled = false;
        }
    }

    async viewStoredScreenshots() {
        try {
            const screenshots = await this.sendMessage({ action: 'getStoredScreenshots', limit: 20 });
            
            if (!screenshots) {
                throw new Error('Failed to load screenshots');
            }
            
            if (screenshots.length === 0) {
                this.showNotification('No screenshots saved yet', 'info');
                return;
            }

            // Create a modal-like overlay to show screenshots
            this.showScreenshotViewer(screenshots);
        } catch (error) {
            console.error('Error viewing screenshots:', error);
            this.showNotification(`Failed to load screenshots: ${error.message}`, 'error');
        }
    }

    async showScreenshotViewer(screenshots) {
        // Remove existing viewer if any
        const existingViewer = document.getElementById('screenshotViewer');
        if (existingViewer) {
            existingViewer.remove();
        }

        // Create screenshot viewer overlay
        const viewerHTML = `
            <div id="screenshotViewer" style="
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.8);
                z-index: 2000;
                display: flex;
                flex-direction: column;
                padding: 20px;
                color: white;
            ">
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                ">
                    <h3 style="margin: 0; font-size: 18px;">📸 Saved Screenshots (${screenshots.length})</h3>
                    <button id="closeScreenshotViewer" style="
                        background: #ff3b30;
                        color: white;
                        border: none;
                        border-radius: 50%;
                        width: 30px;
                        height: 30px;
                        cursor: pointer;
                        font-size: 16px;
                    ">✕</button>
                </div>
                <div id="screenshotGrid" style="
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                    gap: 15px;
                    max-height: 400px;
                    overflow-y: auto;
                    padding: 10px;
                ">
                    <!-- Screenshots will be loaded here -->
                </div>
                <div style="
                    margin-top: 15px;
                    text-align: center;
                    font-size: 12px;
                    color: #ccc;
                ">
                    Click on a screenshot to view full size. Screenshots are stored locally in your browser.
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', viewerHTML);

        // Add close handler
        document.getElementById('closeScreenshotViewer').addEventListener('click', () => {
            document.getElementById('screenshotViewer').remove();
        });

        // Load screenshot thumbnails
        await this.loadScreenshotThumbnails(screenshots);
    }

    async loadScreenshotThumbnails(screenshotList) {
        const grid = document.getElementById('screenshotGrid');
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center;">Loading screenshots...</div>';

        try {
            // Load actual screenshot data for thumbnails
            const screenshotPromises = screenshotList.slice().reverse().map(async (screenshot) => {
                const fullScreenshot = await this.sendMessage({ 
                    action: 'getScreenshot', 
                    screenshotId: screenshot.id 
                });
                return { ...screenshot, data: fullScreenshot?.data };
            });

            const screenshotsWithData = await Promise.all(screenshotPromises);

            grid.innerHTML = '';

            screenshotsWithData.forEach((screenshot) => {
                if (!screenshot.data) return;

                const screenshotElement = document.createElement('div');
                screenshotElement.style.cssText = `
                    background: white;
                    border-radius: 8px;
                    padding: 10px;
                    cursor: pointer;
                    transition: transform 0.2s;
                `;

                screenshotElement.innerHTML = `
                    <img src="${screenshot.data}" style="
                        width: 100%;
                        height: 120px;
                        object-fit: cover;
                        border-radius: 4px;
                        margin-bottom: 8px;
                    " alt="Screenshot">
                    <div style="color: #333; font-size: 11px; font-weight: 500;">
                        ${new Date(screenshot.timestamp).toLocaleString()}
                    </div>
                    <div style="color: #666; font-size: 10px;">
                        ${Math.round(screenshot.size / 1024)}KB
                    </div>
                `;

                screenshotElement.addEventListener('click', () => {
                    this.viewFullScreenshot(screenshot);
                });

                screenshotElement.addEventListener('mouseenter', () => {
                    screenshotElement.style.transform = 'scale(1.05)';
                });

                screenshotElement.addEventListener('mouseleave', () => {
                    screenshotElement.style.transform = 'scale(1)';
                });

                grid.appendChild(screenshotElement);
            });

        } catch (error) {
            console.error('Error loading screenshot thumbnails:', error);
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #ff6b6b;">Failed to load screenshots</div>';
        }
    }

    viewFullScreenshot(screenshot) {
        // Create full-size viewer
        const fullViewerHTML = `
            <div id="fullScreenshotViewer" style="
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.95);
                z-index: 3000;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 20px;
            ">
                <div style="
                    position: absolute;
                    top: 20px;
                    right: 20px;
                    display: flex;
                    gap: 10px;
                ">
                    <button id="downloadScreenshot" style="
                        background: #007aff;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        padding: 8px 16px;
                        cursor: pointer;
                        font-size: 14px;
                    ">Download</button>
                    <button id="closeFullViewer" style="
                        background: #ff3b30;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        padding: 8px 16px;
                        cursor: pointer;
                        font-size: 14px;
                    ">Close</button>
                </div>
                <img src="${screenshot.data}" style="
                    max-width: 90%;
                    max-height: 80%;
                    object-fit: contain;
                    border-radius: 8px;
                    box-shadow: 0 10px 50px rgba(0, 0, 0, 0.5);
                " alt="Screenshot">
                <div style="
                    color: white;
                    text-align: center;
                    margin-top: 15px;
                    font-size: 14px;
                ">
                    <div>${new Date(screenshot.timestamp).toLocaleString()}</div>
                    <div style="font-size: 12px; opacity: 0.7; margin-top: 5px;">
                        Size: ${Math.round(screenshot.size / 1024)}KB
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', fullViewerHTML);

        // Add event handlers
        document.getElementById('closeFullViewer').addEventListener('click', () => {
            document.getElementById('fullScreenshotViewer').remove();
        });

        document.getElementById('downloadScreenshot').addEventListener('click', () => {
            const link = document.createElement('a');
            link.href = screenshot.data;
            link.download = `timetracker-screenshot-${new Date(screenshot.timestamp).toISOString().replace(/[:.]/g, '-')}.jpg`;
            link.click();
        });

        // Close on backdrop click
        document.getElementById('fullScreenshotViewer').addEventListener('click', (e) => {
            if (e.target.id === 'fullScreenshotViewer') {
                document.getElementById('fullScreenshotViewer').remove();
            }
        });
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new TimeTrackerUI();
});

// Cleanup on unload
window.addEventListener('beforeunload', () => {
    if (window.timeTrackerUI) {
        window.timeTrackerUI.stopTimerUpdates();
    }
}); 



