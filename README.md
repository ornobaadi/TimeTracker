# ⏱️ TimeTracker Pro - Minimalist Browsing Time Tracker

> **Beautiful, Simple, Private** - Track your browsing time with manual clock in/out control

A clean, modern Chrome extension that helps you understand your browsing habits through **manual session tracking**. Only records when you choose to start tracking, giving you complete control over your privacy.

## ✨ Key Features

### 🎯 **Manual Control**
- **Clock In/Out System** - Only tracks when you decide to start a session
- **Real-time Session Timer** - See exactly how long you've been tracking
- **Instant Control** - Start and stop tracking with beautiful, prominent buttons

### 📊 **Beautiful Analytics**
- **Today's Activity** - See all websites visited today with time breakdown
- **All-Time Stats** - Top 5 most-visited sites with gorgeous progress bars
- **Past Records** - Complete history of your browsing patterns
- **Visit Counts** - Detailed statistics for each website

### 🎨 **Modern Design**
- **360px Minimalist Interface** - Perfect size, beautiful gradients
- **Smooth Animations** - Polished, professional experience
- **Real-time Updates** - Live data refresh and session timer
- **Mobile-Friendly** - Responsive design that works everywhere

### 🔒 **Privacy First**
- **Local Storage Only** - All data stays on your device
- **No External Servers** - Zero data collection or transmission
- **Session-Based** - Only tracks during active clock-in periods
- **You Control Everything** - Clear all data anytime with one click

---

## 🚀 Quick Start

1. **Install** the extension (see [INSTALL.md](INSTALL.md))
2. **Click** the ⏱️ icon in your Chrome toolbar
3. **Clock In** when you want to start tracking your browsing
4. **Browse normally** - the extension tracks time automatically
5. **Clock Out** when done to save your session data

## 📱 Interface Overview

### Main View
```
┌─────────────────────────────────┐
│ ⏱️ TimeTracker Pro              │
├─────────────────────────────────┤
│ 🟡 Ready to track               │
│    0:00                         │
├─────────────────────────────────┤
│ ▶️ Clock In                     │
├─────────────────────────────────┤
│ Today's Activity       0m 0 sites│
│ ┌─ Start tracking ─────────────┐ │
│ │ 📊 to see your activity     │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ All Time              Clear Data│
│ ┌─ No data yet ───────────────┐ │
│ │ 📈 Start tracking to build  │ │
│ │     your history!           │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

### During Tracking
```
┌─────────────────────────────────┐
│ ⏱️ TimeTracker Pro              │
├─────────────────────────────────┤
│ 🟢 Tracking active              │
│    15:42                        │
├─────────────────────────────────┤
│ ⏹️ Clock Out                    │
├─────────────────────────────────┤
│ Today's Activity      1h 23m 3 sites│
│ ┌─ github.com ─────────── 45m ┐ │
│ │ 🌐 GitHub Desktop         │ │
│ ├─ stackoverflow.com ──── 25m ┤ │
│ │ 💻 Stack Overflow         │ │
│ ├─ google.com ──────────── 13m ┤ │
│ │ 🔍 Google Search          │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

---

## 🎯 Perfect For

### 👩‍🎓 **Students**
- Track study sessions vs. social media time
- Monitor focus during homework/research
- Build awareness of productive browsing habits

### 👨‍💻 **Remote Workers**
- Separate work browsing from personal time
- Track productivity during work hours
- Monitor time spent on different work tools

### 👤 **Anyone Wanting Digital Awareness**
- Understand your browsing patterns
- Build healthier internet habits
- Track time spent on entertainment vs. productivity

---

## 🛠️ Technical Details

### Built With
- **Manifest V3** - Latest Chrome extension standard
- **Modern JavaScript** - Clean, efficient code
- **CSS3 Gradients** - Beautiful visual design
- **Chrome Storage API** - Reliable local data storage

### Permissions
- `activeTab` - See which website you're currently viewing
- `tabs` - Detect tab switches and navigation
- `storage` - Save tracking data locally on your device
- `background` - Continue tracking while Chrome is open

### File Structure
```
TimeTracker/
├── manifest.json          # Extension configuration
├── background.js          # Core tracking logic
├── popup.html            # Main interface
├── popup.css             # Beautiful styling
├── popup.js              # UI interactions
├── content.js            # Page integration
├── README.md             # This file
└── INSTALL.md            # Installation guide
```

---

## 🔒 Privacy & Security

### What We Track
- ✅ **Website domains** (e.g., "github.com", "google.com")
- ✅ **Page titles** (for better site identification)
- ✅ **Time spent** (only during clock-in sessions)
- ✅ **Visit counts** (number of times you visit each site)

### What We DON'T Track
- ❌ **Specific URLs** (no tracking of exact pages)
- ❌ **Personal information** (no passwords, forms, etc.)
- ❌ **Continuous monitoring** (only when clocked in)
- ❌ **External data sharing** (everything stays local)

### Data Storage
- **Local Only**: All data stored in Chrome's local storage
- **No Cloud**: Nothing uploaded anywhere
- **You Control**: Clear all data anytime
- **Private**: Only you can access your tracking data

---

## 🎨 Design Philosophy

### Minimalist Approach
- **Clean Interface** - No clutter, just what you need
- **Intuitive Controls** - Clock in/out couldn't be simpler
- **Beautiful Gradients** - Modern, professional appearance
- **Smooth Animations** - Polished user experience

### User-Centric
- **Manual Control** - You decide when to track
- **Immediate Feedback** - Real-time timer and instant updates
- **Clear Information** - Easy-to-understand data visualization
- **Privacy Focused** - Your data stays yours

---

## 🚀 Installation

See our detailed [Installation Guide](INSTALL.md) for step-by-step instructions.

**Quick Setup:**
1. Download extension files
2. Load in Chrome (`chrome://extensions/`)
3. Pin to toolbar
4. Start tracking!

---

## 💡 Tips & Best Practices

### For Best Results
- **Clock in** only during focused work/study sessions
- **Clock out** during breaks to get accurate data
- **Review daily activity** to understand your patterns
- **Use all-time stats** to identify your most-used sites

### Workflow Integration
- Start your day by clocking in
- Clock out during meetings or lunch breaks
- Use the timer to track work sessions
- Review data weekly to improve habits

---

## 🔄 Future Updates

We're continuously improving TimeTracker Pro:
- Enhanced analytics and insights
- Data export capabilities
- Goal setting and notifications
- Website categorization

---

## 📄 License

This project is open source and available under the MIT License.

---

**Ready to take control of your browsing time?** 

Install TimeTracker Pro today and start building better digital habits! ⏱️✨ 