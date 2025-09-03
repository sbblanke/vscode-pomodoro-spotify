# Developer Setup Guide

This guide is for developers who want to modify or contribute to the VSCode Pomodoro Spotify extension.

## Prerequisites

- **VS Code** 1.74.0 or higher
- **Node.js** and npm
- **Git** for version control
- **Spotify Developer Account** (for API access)

## Quick Start

1. **Clone and install dependencies**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/vscode-pomodoro-spotify.git
   cd vscode-pomodoro-spotify
   npm install
   ```

2. **Compile TypeScript**:
   ```bash
   npm run compile
   ```

3. **Run the extension**:
   - Open the project in VS Code
   - Press `F5` to launch Extension Development Host
   - Test the extension in the new VS Code window

## Spotify API Configuration

### For Most Contributors
The extension includes a built-in Spotify Client ID that works for personal development and testing. No additional setup is required.

### For Production Deployments or Heavy Development

If you're deploying your own version or doing extensive development, create your own Spotify app:

#### 1. Create Spotify Developer App
1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click **"Create an app"**
3. Fill out the form:
   - **App name**: `VSCode Pomodoro Spotify Dev` (or your preferred name)
   - **App description**: `Development version of VSCode Pomodoro Spotify extension`
   - **App type**: `Web API`

#### 2. Configure App Settings
1. In your app settings, set:
   - **Redirect URIs**: `http://127.0.0.1:3000/callback`
   - **App type**: Set to **"Public"** (no client secret needed)
2. Copy your **Client ID**

#### 3. Configure Extension
1. Open VS Code settings (`Ctrl+,`)
2. Search for `pomodoroSpotify.spotify.clientId`
3. Paste your Client ID
4. Restart the Extension Development Host (`F5`)

#### 4. Test Authentication
1. In the Extension Development Host, open Command Palette (`Ctrl+Shift+P`)
2. Run `Pomodoro: Connect to Spotify`
3. Complete OAuth flow in your browser
4. Verify connection in VS Code

## Development Workflow

### Building and Testing
```bash
# Compile TypeScript
npm run compile

# Watch mode for development
npm run watch

# Lint code
npm run lint

# Package extension
npm run package
```

### Running Tests
```bash
# Compile and run linter
npm run pretest

# Run tests (when available)
npm test
```

### Development Tips

1. **Hot Reload**: Use `npm run watch` to automatically recompile on changes
2. **Debugging**: Set breakpoints in TypeScript files, they work in Extension Development Host
3. **Logs**: Check VS Code Developer Tools (`Help > Toggle Developer Tools`) for console output
4. **Extension Host**: Always test in the Extension Development Host (`F5`) before packaging

## Code Structure

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

## Contributing Guidelines

### Code Style
- Follow existing TypeScript conventions
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Avoid `console.log` statements in production code

### Testing Requirements
- Test OAuth flow with both Free and Premium Spotify accounts
- Test timer functionality across different scenarios
- Verify cross-platform compatibility (Windows, macOS, Linux)
- Test error scenarios (network failures, auth failures, etc.)

### Security Considerations
- Never commit API keys or secrets
- Use VS Code SecretStorage API for sensitive data
- Follow OAuth 2.0 best practices
- Test authentication edge cases

## Troubleshooting

### Common Issues

**"Port 3000 already in use"**
- Another application is using port 3000
- Close other applications or restart your computer
- The extension will show an error message with guidance

**Authentication failures**
- Check that redirect URI is exactly: `http://127.0.0.1:3000/callback`
- Verify your Spotify app is set to "Public" type
- Make sure you're using the correct Client ID
- Try disconnecting and reconnecting to Spotify

**Extension not loading**
- Run `npm run compile` to ensure TypeScript is compiled
- Check VS Code Developer Console for errors
- Verify all dependencies are installed with `npm install`

**"No active device" errors**
- Open Spotify app on any device (phone, computer, web player)
- Play any song to activate a device
- The extension will detect and use the active device

### Getting Help

- **GitHub Issues**: [Create an issue](https://github.com/sbblanke/vscode-pomodoro-spotify/issues) for bugs
- **GitHub Discussions**: [Ask questions](https://github.com/sbblanke/vscode-pomodoro-spotify/discussions) about development
- **VS Code Extension Docs**: [Official VS Code extension documentation](https://code.visualstudio.com/api)
- **Spotify Web API**: [Official Spotify API documentation](https://developer.spotify.com/documentation/web-api/)

## Project Scripts

```json
{
  "compile": "Compile TypeScript to JavaScript",
  "watch": "Watch for changes and compile automatically",
  "lint": "Run ESLint on source code",
  "pretest": "Compile and lint before testing", 
  "test": "Run extension tests",
  "package": "Create VSIX package for distribution"
}
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.