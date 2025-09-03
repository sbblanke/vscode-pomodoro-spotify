# VSCode Pomodoro Spotify Extension

A productivity-focused VSCode extension that combines the Pomodoro Technique with Spotify integration for enhanced focus sessions.

## 🚀 Features

- **Pomodoro Timer**: Customizable work/break intervals with visual countdown
- **Spotify Integration**: Automatic playlist switching between work and break periods
- **Status Bar Display**: Real-time timer and music information
- **Smart Notifications**: Interval transition alerts with continuation options
- **Persistent State**: Resume sessions across VSCode restarts

## 📋 Prerequisites

- VSCode 1.74.0 or higher
- Spotify account (Free or Premium)
- Node.js and npm (for development)

## 🔧 Installation

### From VS Code Marketplace (Recommended)

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for "VSCode Pomodoro Spotify"
4. Click Install

### Manual Installation

1. Download the latest `.vsix` file from the [releases page](https://github.com/sbblanke/vscode-pomodoro-spotify/releases)
2. Open VS Code
3. Go to Extensions (`Ctrl+Shift+X`)
4. Click the "..." menu → "Install from VSIX..."
5. Select the downloaded file

### Setup

**No additional configuration required!** The extension uses secure OAuth 2.0 authentication with Spotify.

## 🛠️ Development Setup

For developers wanting to modify this extension:

1. Clone the repository
2. Install dependencies: `npm install`
3. Compile TypeScript: `npm run compile`
4. Press `F5` to launch Extension Development Host

For Spotify API configuration details, see `dev-notes/security/CLIENT_ID_SETUP.md`.

## 🎵 Getting Started

1. **Connect Spotify**: Click the music icon in the status bar or use `Ctrl+Shift+P` → "Pomodoro: Connect to Spotify"
2. **Configure Settings**: Access settings via `Ctrl+Shift+P` → "Pomodoro: Configure Settings"
3. **Start Timer**: Click the timer icon in the status bar or use `Ctrl+Shift+P` → "Pomodoro: Start Timer"

## ⚙️ Configuration

Access settings through VSCode settings (`Ctrl+,`) and search for "Pomodoro":

- **Work Interval**: Duration of work sessions (default: 25 minutes)
- **Short Break**: Duration of short breaks (default: 5 minutes)
- **Long Break**: Duration of long breaks (default: 15 minutes)
- **Long Break After**: Number of work intervals before long break (default: 4)
- **Work Playlist**: Spotify playlist ID for work sessions
- **Break Playlist**: Spotify playlist ID for break periods
- **Auto Start Music**: Automatically start music during intervals
- **Show Notifications**: Display interval transition notifications

## 🔨 Available Commands

Access via Command Palette (`Ctrl+Shift+P`):

- `Pomodoro: Start Timer` - Start or resume the Pomodoro timer
- `Pomodoro: Stop Timer` - Stop the current timer
- `Pomodoro: Reset Timer` - Reset timer and completed intervals
- `Pomodoro: Skip Interval` - Skip to next interval
- `Pomodoro: Connect to Spotify` - Authenticate with Spotify
- `Pomodoro: Configure Settings` - Open extension settings

## 📊 Status Bar Information

The extension displays two status bar items:

1. **Timer Status**: Shows current state and remaining time
   - 🍅 Work session active
   - ☕ Short break active  
   - 🌟 Long break active
   - ⏱️ Timer stopped/ready

2. **Music Status**: Shows current Spotify track and playback state
   - ▶️ Currently playing track
   - ⏸️ Paused track
   - 🎵 Not connected or no music

## 🔐 Privacy & Security

- **Spotify Tokens**: Stored securely using VSCode's SecretStorage API
- **Local Only**: All data stays on your machine
- **OAuth 2.0 + PKCE**: Industry-standard secure authentication
- **No Tracking**: Extension doesn't collect or transmit usage data

## 🛠️ Development

### Project Structure

```
src/
├── extension.ts              # Main extension entry point
├── timer/
│   └── PomodoroTimer.ts     # Core timer logic and state management
├── spotify/
│   └── SpotifyService.ts    # Spotify API integration and OAuth
├── ui/
│   ├── StatusBarManager.ts  # Status bar display and updates
│   └── WelcomeWebview.ts    # Welcome and setup webview
├── audio/
│   └── SoundManager.ts      # Notification sound management
├── stats/
│   └── ProductivityTracker.ts # Productivity statistics tracking
└── utils/
    └── ErrorHandler.ts      # Error handling and logging
```

### Build Commands

- `npm run compile` - Compile TypeScript
- `npm run watch` - Watch mode for development
- `npm run lint` - Run ESLint
- `npm run package` - Create VSIX package

## 📝 Requirements Traceability

This implementation fulfills the requirements outlined in the project BRD:

- ✅ User Story #1: Extension setup and installation
- ✅ User Story #2: Spotify authentication (OAuth 2.0 + PKCE)
- ✅ User Story #3: Basic Pomodoro timer functionality
- 🔄 User Story #4: Playlist detection and management (basic implementation)
- ✅ User Story #5: Status bar integration with music info
- 🔄 User Story #6: Configuration and customization (settings implemented)
- ⏳ User Story #7: Productivity tracking (future enhancement)
- ✅ User Story #8: Error handling and recovery

## 🐛 Troubleshooting

**Authentication Issues**:
- Make sure you complete the OAuth flow in your browser when prompted
- If authentication fails, try the "Connect to Spotify" command again
- For developers: Ensure your Spotify app redirect URI is `vscode://pomodoro-spotify-extension/auth-callback`
- Try disconnecting and reconnecting if tokens expire

**Music Not Playing**:
- Ensure you have an active Spotify session (open Spotify app)
- Check that playlist IDs are correct in settings
- Verify playlist access permissions

## 🚀 Next Steps

Planned enhancements include:
- Advanced playlist categorization and smart recommendations
- Enhanced productivity statistics and reporting
- Improved error recovery and user guidance
- Integration with additional music services
- Cross-workspace session persistence

For detailed development roadmap, see `ROADMAP.md`.

---

**Version**: 1.0.0 - Stable release with core functionality implemented and tested.