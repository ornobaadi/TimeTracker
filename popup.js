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
    }

    async sendMessage(message) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(message, resolve);
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



