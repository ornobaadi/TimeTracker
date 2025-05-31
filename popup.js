// TimeTracker Pro - Real-time Stopwatch Implementation
class TimeTrackerUI {
    constructor() {
        this.isTracking = false;
        this.sessionStartTime = null;
        this.dataUpdateInterval = null;
        this.sessionTimerInterval = null;
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.updateStatus();
        await this.loadData();
        this.startTimerUpdates();
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
        // Update session timer every second for real-time stopwatch
        this.sessionTimerInterval = setInterval(() => {
            if (this.isTracking && this.sessionStartTime) {
                const elapsed = Date.now() - this.sessionStartTime;
                document.getElementById('sessionTimeDisplay').textContent = this.formatStopwatchTime(elapsed);
            }
        }, 1000);
        
        // Update immediately
        if (this.sessionStartTime) {
            const elapsed = Date.now() - this.sessionStartTime;
            document.getElementById('sessionTimeDisplay').textContent = this.formatStopwatchTime(elapsed);
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

    async handleClockIn() {
        try {
            await this.sendMessage({ action: 'startTracking' });
            this.isTracking = true;
            this.sessionStartTime = Date.now();
            
            this.updateUI();
            this.showNotification('Tracking started!', 'success');
        } catch (error) {
            console.error('Error starting tracking:', error);
            this.showNotification('Failed to start tracking', 'error');
        }
    }

    async handleClockOut() {
        try {
            await this.sendMessage({ action: 'stopTracking' });
            this.isTracking = false;
            this.sessionStartTime = null;
            
            this.updateUI();
            await this.loadData();
            this.showNotification('Tracking stopped!', 'success');
        } catch (error) {
            console.error('Error stopping tracking:', error);
            this.showNotification('Failed to stop tracking', 'error');
        }
    }

    async loadData() {
        try {
            const [todayData, currentSession] = await Promise.all([
                this.sendMessage({ action: 'getTodayData' }),
                this.isTracking ? this.sendMessage({ action: 'getCurrentSession' }) : null
            ]);

            await this.renderData(todayData, currentSession);
        } catch (error) {
            console.error('Error loading data:', error);
        }
    }

    async renderData(todayData, currentSession) {
        // Clone data to include current session
        let allData = { ...todayData };
        
        // Add current session data if tracking
        if (this.isTracking && currentSession) {
            const domain = currentSession.domain;
            if (!allData[domain]) {
                allData[domain] = {
                    time: 0,
                    title: currentSession.title,
                    favicon: currentSession.favicon,
                    visits: 0
                };
            }
            // Add current session time to saved time
            allData[domain] = {
                ...allData[domain],
                time: allData[domain].time + currentSession.currentTime,
                title: currentSession.title,
                favicon: currentSession.favicon || allData[domain].favicon
            };
        }

        const sites = Object.entries(allData);
        const totalTime = sites.reduce((sum, [, siteData]) => sum + siteData.time, 0);

        // Update today's total
        document.getElementById('totalTimeLarge').textContent = this.formatTimeHHMM(totalTime);

        // Update top site
        if (sites.length > 0) {
            sites.sort(([,a], [,b]) => b.time - a.time);
            this.updateTopSite(sites[0]);
        }

        // Update sites list
        this.renderSitesList(sites);
    }

    updateTopSite(topSiteEntry) {
        const topSite = document.getElementById('topSite');
        const [domain, siteData] = topSiteEntry;

        topSite.innerHTML = `
            <div class="site-favicon-large">
                ${siteData.favicon ? 
                    `<img src="${siteData.favicon}" alt="${domain}" style="width: 100%; height: 100%; border-radius: 8px; object-fit: cover;" onerror="this.parentElement.innerHTML='${domain.charAt(0).toUpperCase()}'">` :
                    domain.charAt(0).toUpperCase()
                }
            </div>
            <div class="site-info">
                <div class="site-domain">${domain}</div>
                <div class="site-time-large">${this.formatTimeHHMM(siteData.time)}</div>
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

        // Sort by time and take top 5
        sites.sort(([,a], [,b]) => b.time - a.time);
        const topSites = sites.slice(0, 5);

        const sitesHtml = topSites.map(([domain, siteData]) => `
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
                <div class="site-time-small">${this.formatTimeHHMM(siteData.time)}</div>
            </div>
        `).join('');

        sitesList.innerHTML = sitesHtml;
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
        // Update website data every 7 seconds (5-10 second delay as requested)
        this.dataUpdateInterval = setInterval(async () => {
            if (this.isTracking) {
                await this.loadData();
            }
        }, 7000);
    }

    stopTimerUpdates() {
        if (this.dataUpdateInterval) {
            clearInterval(this.dataUpdateInterval);
        }
        if (this.sessionTimerInterval) {
            clearInterval(this.sessionTimerInterval);
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



