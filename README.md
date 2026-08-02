# 🛣️ Drively - Driving Log Tracker

A clean, modern, offline-first mobile app to help users (primarily teens) track their required driving hours for permits and licenses. No accounts or ads—just simple, reliable tracking with helpful extras like streaks, freeze days, goals, and export options. Android cloud backup is optional and off by default.

## ✨ Features

### 🆕 Onboarding
- License type selection (Learner's Permit, Restricted, Unrestricted)
- License acquisition date tracking
- Goal setting with predefined options (25h, 50h including 10 at night, custom)
- Data storage disclaimer and agreement

### 🚗 Drive Logging
- Manual start/stop timer with pause functionality
- Automatic drive details recording:
  - Date, start/end time, duration
  - Night drive detection (auto or manual)
  - Weather conditions (optional)
  - Skills practiced (optional)
  - Supervising adult info (optional)

### 📊 Progress Tracking
- Visual progress bars for day/night hours
- Overall completion percentage
- Goal tracking and milestone celebrations
- Upgrade prompts when eligible for next license level

### 🔥 Streak System
- Daily driving streak counter
- Longest streak records
- Freeze day system (up to 10 per month)
- Streak preservation reminders

### 📤 Export & Backup
- Export options: JSON (full backup), CSV (drives), TXT (summary report)
- Social sharing of progress
- Regular backup reminders
- Local file storage with an automatic recovery copy

### ⚙️ Smart Features
- Offline core logging and reporting
- Auto-recovery from corrupted data
- Customizable night driving hours
- Backup and restore functionality

## 🛠 Tech Stack

- **Framework**: React Native with Expo
- **Navigation**: React Navigation (Stack + Bottom Tabs)
- **State Management**: React Context API + useReducer
- **Storage**: Expo File System (JSON files)
- **UI**: Custom components with modern styling
- **Export**: Expo Sharing for file exports

## 📱 Installation & Setup

### Prerequisites
- Node.js (14 or higher)
- npm or yarn
- Expo CLI (optional but recommended)

### Getting Started

1. **Clone and install dependencies:**
   ```bash
   cd Drively
   npm install
   ```

2. **Start the development server:**
   ```bash
   npm start
   # or
   npx expo start
   ```

3. **Run on device/simulator:**
   - iOS: Press `i` in terminal or scan QR code with Camera app
   - Android: Press `a` in terminal or scan QR code with Expo Go app
   - Web: Press `w` in terminal

### Build Commands

```bash
# Start development server
npm start

# Run on iOS simulator
npm run ios

# Run on Android emulator
npm run android

# Run on web
npm run web
```

## 🏗 Project Structure

```
src/
├── components/          # Reusable UI components
├── contexts/           # React Context providers
│   └── DrivingContext.js
├── navigation/         # Navigation configuration
│   └── AppNavigator.js
├── screens/           # App screens
│   ├── OnboardingScreen.js
│   ├── DashboardScreen.js
│   ├── LogDriveScreen.js
│   ├── DriveHistoryScreen.js
│   ├── ExportScreen.js
│   └── SettingsScreen.js
└── utils/             # Utility functions
    ├── storage.js     # Data persistence
    ├── streaks.js     # Streak calculations
    └── time.js        # Time utilities
```

## 💾 Data Storage

The app uses a local JSON file storage system:

- **Location**: Device's document directory (`Drively/data.json`)
- **Backup**: Automatic backup file (`Drively/backup.json`)
- **Format**: Structured JSON with versioning for safe updates
- **Recovery**: Automatic corruption detection and backup restoration

### Data Structure
```json
{
  "user": {
    "licenseType": "learners",
    "goalDayHours": 40,
    "goalNightHours": 10,
    "completedDayHours": 25.5,
    "completedNightHours": 6.0
  },
  "drives": [...],
  "streaks": {...},
  "settings": {...}
}
```

## 🔒 Privacy & Security

- **Offline-first**: Core logging works without an account or network connection
- **User-controlled storage**: Logbook data stays on device by default; Android cloud backup can be enabled or disabled in Data and backups
- **Limited network use**: When enabled, weather lookup sends approximate coordinates directly to Open-Meteo
- **No Analytics**: No tracking or data collection
- **No Accounts**: No user registration or authentication required
- **Transparent**: Open source and auditable

## 🧪 Testing

```bash
# Run the app in development mode
npm start

# Test on different platforms
npm run ios    # iOS simulator
npm run android # Android emulator
npm run web    # Web browser
```

## 📦 Building for Production

```bash
# Build for app stores
npx expo build:ios
npx expo build:android

# Or use EAS Build (recommended)
npx eas build --platform ios
npx eas build --platform android
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📋 Development Guidelines

- Use functional components with hooks
- Follow React Native best practices
- Implement proper error handling
- Use meaningful component and variable names
- Keep components small and focused
- Add JSDoc comments for functions

## 🐛 Known Issues

- None currently reported

## 🗺 Roadmap

- [ ] Apple Watch companion app
- [ ] Widget support for iOS/Android
- [ ] Dark mode theme
- [ ] More detailed analytics
- [ ] Parent/instructor dashboard
- [ ] Integration with DMV requirements by state

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Built with love for safe driving education
- Inspired by the need for simple, offline-first mobile apps
- Thanks to the React Native and Expo communities

---

**Made with ❤️ for safe driving**
