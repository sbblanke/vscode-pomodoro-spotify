import * as vscode from 'vscode';
import { SpotifyService } from '../spotify/SpotifyService';
import { SoundManager } from '../audio/SoundManager';

export class WelcomeWebview {
    private panel: vscode.WebviewPanel | undefined;

    constructor(
        private context: vscode.ExtensionContext,
        private spotifyService: SpotifyService,
        private soundManager: SoundManager
    ) {}

    public async show(): Promise<void> {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'pomodoroWelcome',
            '🍅 Pomodoro Spotify - Welcome',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.context.extensionUri, 'assets')
                ]
            }
        );

        this.panel.webview.html = await this.getWebviewContent();
        this.setupMessageHandlers();

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });
    }

    private setupMessageHandlers(): void {
        if (!this.panel) return;

        this.panel.webview.onDidReceiveMessage(async (message) => {
            // Input validation for all webview messages
            if (!message || typeof message.command !== 'string') {
                console.error('Invalid webview message received:', message);
                return;
            }

            switch (message.command) {
                case 'authenticateSpotify':
                    try {
                        await this.spotifyService.authenticate();
                        this.panel?.webview.postMessage({
                            command: 'authSuccess',
                            message: 'Successfully connected to Spotify!'
                        });
                    } catch (error) {
                        this.panel?.webview.postMessage({
                            command: 'authError',
                            message: `Authentication failed: ${error}`
                        });
                    }
                    break;

                case 'checkAuthStatus':
                    const isAuthenticated = await this.spotifyService.isAuthenticated();
                    this.panel?.webview.postMessage({
                        command: 'authStatus',
                        authenticated: isAuthenticated
                    });
                    break;

                case 'getPlaylists':
                    if (await this.spotifyService.isAuthenticated()) {
                        const playlists = await this.spotifyService.getPlaylists();
                        this.panel?.webview.postMessage({
                            command: 'playlistsData',
                            playlists: playlists
                        });
                    }
                    break;

                case 'setPlaylist':
                    if (!message.type || !message.playlistId || 
                        (message.type !== 'workPlaylist' && message.type !== 'breakPlaylist') ||
                        typeof message.playlistId !== 'string') {
                        console.error('Invalid setPlaylist message:', message);
                        return;
                    }
                    const config = vscode.workspace.getConfiguration('pomodoroSpotify');
                    await config.update(message.type, message.playlistId, vscode.ConfigurationTarget.Global);
                    this.panel?.webview.postMessage({
                        command: 'playlistSet',
                        message: `${message.type} playlist set successfully!`
                    });
                    break;

                case 'updateConfig':
                    if (!message.config || typeof message.config !== 'object') {
                        console.error('Invalid updateConfig message:', message);
                        return;
                    }
                    const configObj = vscode.workspace.getConfiguration('pomodoroSpotify');
                    const allowedKeys = ['workInterval', 'shortBreakInterval', 'longBreakInterval', 'longBreakAfter', 'transitionMode'];
                    for (const [key, value] of Object.entries(message.config)) {
                        if (!allowedKeys.includes(key)) {
                            console.error('Invalid config key:', key);
                            continue;
                        }
                        await configObj.update(key, value, vscode.ConfigurationTarget.Global);
                    }
                    this.panel?.webview.postMessage({
                        command: 'configUpdated',
                        message: 'Settings saved successfully!'
                    });
                    break;

                case 'testSound':
                    await this.soundManager.playSound(message.trigger);
                    break;

                case 'openSettings':
                    vscode.commands.executeCommand('workbench.action.openSettings', 'pomodoroSpotify');
                    break;

                case 'startTimer':
                    vscode.commands.executeCommand('pomodoro-spotify.startTimer');
                    break;
            }
        });
    }

    private htmlEscape(unsafe: string): string {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    private async getWebviewContent(): Promise<string> {
        const isAuthenticated = await this.spotifyService.isAuthenticated();
        const config = vscode.workspace.getConfiguration('pomodoroSpotify');
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src vscode-resource: https: data:;">
    <title>Pomodoro Spotify Welcome</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        
        .container {
            max-width: 800px;
            margin: 0 auto;
        }
        
        .header {
            text-align: center;
            margin-bottom: 40px;
        }
        
        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
            color: var(--vscode-textLink-foreground);
        }
        
        .header p {
            font-size: 1.2em;
            color: var(--vscode-descriptionForeground);
        }
        
        .section {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 25px;
            margin: 20px 0;
        }
        
        .section h2 {
            color: var(--vscode-textLink-foreground);
            margin-top: 0;
            font-size: 1.5em;
        }
        
        .step {
            margin: 20px 0;
            padding: 15px;
            border-left: 4px solid var(--vscode-textLink-foreground);
            background-color: var(--vscode-input-background);
        }
        
        .step h3 {
            margin-top: 0;
            color: var(--vscode-editor-foreground);
        }
        
        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 12px 24px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            margin: 5px 5px 5px 0;
        }
        
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        
        button.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        
        input, select {
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 8px 12px;
            border-radius: 4px;
            margin: 5px 0;
            width: 100%;
            max-width: 300px;
        }
        
        .auth-status {
            padding: 10px;
            border-radius: 4px;
            margin: 10px 0;
        }
        
        .auth-success {
            background-color: var(--vscode-testing-iconPassed);
            color: white;
        }
        
        .auth-error {
            background-color: var(--vscode-testing-iconFailed);
            color: white;
        }
        
        .playlist-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 15px;
            margin: 15px 0;
        }
        
        .playlist-item {
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            padding: 15px;
            cursor: pointer;
        }
        
        .playlist-item:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        
        .playlist-item.selected {
            border-color: var(--vscode-textLink-foreground);
            background-color: var(--vscode-list-activeSelectionBackground);
        }
        
        .config-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin: 20px 0;
        }
        
        .config-item {
            display: flex;
            flex-direction: column;
            gap: 5px;
        }
        
        .config-item label {
            font-weight: 500;
            color: var(--vscode-editor-foreground);
        }
        
        .hidden {
            display: none;
        }
        
        .message {
            padding: 10px;
            border-radius: 4px;
            margin: 10px 0;
            background-color: var(--vscode-notifications-background);
            border: 1px solid var(--vscode-notifications-border);
        }
        
        .progress-bar {
            width: 100%;
            height: 20px;
            background-color: var(--vscode-input-background);
            border-radius: 10px;
            overflow: hidden;
            margin: 10px 0;
        }
        
        .progress-fill {
            height: 100%;
            background-color: var(--vscode-textLink-foreground);
            transition: width 0.3s ease;
        }
        
        .screenshot {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            margin: 10px 0;
            max-width: 100%;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🍅🎵 Welcome to Pomodoro Spotify</h1>
            <p>Boost your productivity with the perfect combination of focus time and music</p>
        </div>

        <!-- Step 1: Spotify Authentication -->
        <div class="section">
            <h2>🎵 Step 1: Connect to Spotify</h2>
            <div id="auth-section">
                <p>First, let's connect your Spotify account to enable automatic music switching during your focus sessions.</p>
                <div id="auth-status" class="hidden auth-status"></div>
                <button id="auth-button" onclick="authenticateSpotify()">Connect to Spotify</button>
                <button class="secondary" onclick="toggleSpotifyHelp()">Need Help Setting Up Spotify?</button>
                
                <div id="spotify-help" class="hidden">
                    <div class="step">
                        <h3>Don't have a Spotify Developer Account?</h3>
                        <p>If you're using your own Spotify Client ID, you'll need a Spotify Developer account:</p>
                        <ol>
                            <li>Go to <a href="https://developer.spotify.com/">Spotify Developer Dashboard</a></li>
                            <li>Log in with your Spotify account</li>
                            <li>Click "Create an App"</li>
                            <li>Fill in the app details (name can be anything like "My Pomodoro App")</li>
                            <li>Set the Redirect URI to: <code>http://127.0.0.1:3000/callback</code></li>
                            <li>Save and note your Client ID for configuration</li>
                        </ol>
                        <p><strong>Note:</strong> This extension comes with a built-in Client ID, so you can skip the developer setup if you're just using it for personal productivity!</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Step 2: Timer Configuration -->
        <div class="section">
            <h2>⏱️ Step 2: Configure Your Pomodoro Timer</h2>
            <p>Customize your focus and break intervals to match your productivity style.</p>
            
            <div class="config-grid">
                <div class="config-item">
                    <label for="work-interval">Work Interval (minutes):</label>
                    <input type="number" id="work-interval" value="${this.htmlEscape(String(config.get('workInterval', 25)))}" min="1" max="120">
                </div>
                
                <div class="config-item">
                    <label for="short-break">Short Break (minutes):</label>
                    <input type="number" id="short-break" value="${this.htmlEscape(String(config.get('shortBreakInterval', 5)))}" min="1" max="30">
                </div>
                
                <div class="config-item">
                    <label for="long-break">Long Break (minutes):</label>
                    <input type="number" id="long-break" value="${this.htmlEscape(String(config.get('longBreakInterval', 15)))}" min="1" max="60">
                </div>
                
                <div class="config-item">
                    <label for="long-break-after">Long break after intervals:</label>
                    <input type="number" id="long-break-after" value="${this.htmlEscape(String(config.get('longBreakAfter', 4)))}" min="1" max="10">
                </div>
            </div>
            
            <div class="config-item">
                <label for="transition-mode">Interval Transitions:</label>
                <select id="transition-mode">
                    <option value="manual" ${config.get('transitionMode') === 'manual' ? 'selected' : ''}>Manual (show notification with confirmation)</option>
                    <option value="auto" ${config.get('transitionMode') === 'auto' ? 'selected' : ''}>Automatic (start next interval immediately)</option>
                </select>
            </div>
            
            <button onclick="saveTimerConfig()">Save Timer Settings</button>
        </div>

        <!-- Step 3: Playlist Setup -->
        <div class="section" id="playlist-section">
            <h2>🎼 Step 3: Set Up Your Playlists</h2>
            <div id="playlist-auth-required" ${isAuthenticated ? 'class="hidden"' : ''}>
                <p>Connect to Spotify first to select your playlists for work and break sessions.</p>
            </div>
            
            <div id="playlist-config" ${!isAuthenticated ? 'class="hidden"' : ''}>
                <p>Choose playlists that will automatically play during your work and break sessions.</p>
                
                <div class="step">
                    <h3>Work Session Playlist</h3>
                    <p>Choose music that helps you focus - instrumental, ambient, or your favorite concentration tracks.</p>
                    <div id="work-playlists" class="playlist-grid"></div>
                    <button class="secondary" onclick="refreshPlaylists()">Refresh Playlists</button>
                </div>
                
                <div class="step">
                    <h3>Break Session Playlist</h3>
                    <p>Choose more relaxing music for your breaks - something that helps you unwind.</p>
                    <div id="break-playlists" class="playlist-grid"></div>
                </div>
            </div>
        </div>

        <!-- Step 4: Sound Configuration -->
        <div class="section">
            <h2>🔊 Step 4: Notification Sounds</h2>
            <p>Configure audio notifications to stay aware of your timer transitions.</p>
            
            <div class="step">
                <h3>Sound Settings</h3>
                <p>Choose which events should play notification sounds:</p>
                <label><input type="checkbox" id="sound-work-start" checked> Work session start</label><br>
                <label><input type="checkbox" id="sound-break-start" checked> Break start</label><br>
                <label><input type="checkbox" id="sound-1min-warning" checked> 1-minute warning</label><br>
                <label><input type="checkbox" id="sound-5min-warning"> 5-minute warning</label><br>
                <button class="secondary" onclick="openSoundSettings()">Advanced Sound Settings</button>
            </div>
        </div>

        <!-- Step 5: Ready to Go -->
        <div class="section">
            <h2>🚀 Step 5: You're All Set!</h2>
            <p>Your Pomodoro Spotify extension is now configured and ready to boost your productivity.</p>
            
            <div class="step">
                <h3>Quick Tips:</h3>
                <ul>
                    <li>Click the timer in your status bar to access quick controls</li>
                    <li>Use <kbd>Ctrl+Shift+Alt+S</kbd> to start a timer quickly</li>
                    <li>The extension will automatically switch playlists between work and breaks</li>
                    <li>You can customize all settings anytime in VS Code preferences</li>
                </ul>
            </div>
            
            <button onclick="startFirstTimer()">🍅 Start Your First Pomodoro</button>
            <button class="secondary" onclick="openAdvancedSettings()">Open Advanced Settings</button>
        </div>

        <!-- Progress Indicator -->
        <div class="progress-bar">
            <div class="progress-fill" id="progress" style="width: 20%"></div>
        </div>
        <p style="text-align: center; color: var(--vscode-descriptionForeground);">Setup Progress</p>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentWorkPlaylist = null;
        let currentBreakPlaylist = null;
        let playlists = [];

        // Check auth status on load
        window.onload = function() {
            checkAuthStatus();
        };

        function checkAuthStatus() {
            vscode.postMessage({ command: 'checkAuthStatus' });
        }

        function authenticateSpotify() {
            document.getElementById('auth-status').innerHTML = 'Connecting to Spotify...';
            document.getElementById('auth-status').className = 'auth-status';
            document.getElementById('auth-status').classList.remove('hidden');
            
            vscode.postMessage({ command: 'authenticateSpotify' });
        }

        function toggleSpotifyHelp() {
            const help = document.getElementById('spotify-help');
            help.classList.toggle('hidden');
        }

        function saveTimerConfig() {
            const config = {
                workInterval: parseInt(document.getElementById('work-interval').value),
                shortBreakInterval: parseInt(document.getElementById('short-break').value),
                longBreakInterval: parseInt(document.getElementById('long-break').value),
                longBreakAfter: parseInt(document.getElementById('long-break-after').value),
                transitionMode: document.getElementById('transition-mode').value
            };
            
            vscode.postMessage({ command: 'updateConfig', config: config });
            updateProgress(40);
        }

        function refreshPlaylists() {
            vscode.postMessage({ command: 'getPlaylists' });
        }

        function selectWorkPlaylist(playlistId, element) {
            // Remove selection from other work playlist elements
            document.querySelectorAll('#work-playlists .playlist-item').forEach(item => {
                item.classList.remove('selected');
            });
            
            // Add selection to clicked element
            element.classList.add('selected');
            currentWorkPlaylist = playlistId;
            
            vscode.postMessage({ 
                command: 'setPlaylist', 
                type: 'workPlaylist', 
                playlistId: playlistId 
            });
            updateProgress(60);
        }

        function selectBreakPlaylist(playlistId, element) {
            // Remove selection from other break playlist elements
            document.querySelectorAll('#break-playlists .playlist-item').forEach(item => {
                item.classList.remove('selected');
            });
            
            // Add selection to clicked element
            element.classList.add('selected');
            currentBreakPlaylist = playlistId;
            
            vscode.postMessage({ 
                command: 'setPlaylist', 
                type: 'breakPlaylist', 
                playlistId: playlistId 
            });
            updateProgress(80);
        }

        function openSoundSettings() {
            vscode.postMessage({ command: 'openSettings' });
        }

        function startFirstTimer() {
            vscode.postMessage({ command: 'startTimer' });
            updateProgress(100);
        }

        function openAdvancedSettings() {
            vscode.postMessage({ command: 'openSettings' });
        }

        function updateProgress(percentage) {
            document.getElementById('progress').style.width = percentage + '%';
        }

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
                case 'authSuccess':
                    document.getElementById('auth-status').innerHTML = message.message;
                    document.getElementById('auth-status').className = 'auth-status auth-success';
                    document.getElementById('playlist-auth-required').classList.add('hidden');
                    document.getElementById('playlist-config').classList.remove('hidden');
                    refreshPlaylists();
                    updateProgress(20);
                    break;
                    
                case 'authError':
                    document.getElementById('auth-status').innerHTML = message.message;
                    document.getElementById('auth-status').className = 'auth-status auth-error';
                    break;
                    
                case 'authStatus':
                    if (message.authenticated) {
                        document.getElementById('auth-status').innerHTML = 'Already connected to Spotify ✓';
                        document.getElementById('auth-status').className = 'auth-status auth-success';
                        document.getElementById('auth-status').classList.remove('hidden');
                        document.getElementById('playlist-auth-required').classList.add('hidden');
                        document.getElementById('playlist-config').classList.remove('hidden');
                        refreshPlaylists();
                        updateProgress(20);
                    }
                    break;
                    
                case 'playlistsData':
                    playlists = message.playlists;
                    renderPlaylists();
                    break;
                    
                case 'playlistSet':
                    showMessage(message.message);
                    break;
                    
                case 'configUpdated':
                    showMessage(message.message);
                    break;
            }
        });

        function renderPlaylists() {
            const workContainer = document.getElementById('work-playlists');
            const breakContainer = document.getElementById('break-playlists');
            
            workContainer.innerHTML = '';
            breakContainer.innerHTML = '';
            
            playlists.forEach(playlist => {
                const workItem = createPlaylistItem(playlist, 'work');
                const breakItem = createPlaylistItem(playlist, 'break');
                
                workContainer.appendChild(workItem);
                breakContainer.appendChild(breakItem);
            });
        }

        function createPlaylistItem(playlist, type) {
            const item = document.createElement('div');
            item.className = 'playlist-item';
            item.innerHTML = \`
                <strong>\${playlist.name}</strong><br>
                <small>\${playlist.trackCount} tracks</small><br>
                <small>\${playlist.description || 'No description'}</small>
            \`;
            
            item.onclick = function() {
                if (type === 'work') {
                    selectWorkPlaylist(playlist.id, item);
                } else {
                    selectBreakPlaylist(playlist.id, item);
                }
            };
            
            return item;
        }

        function showMessage(text) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message';
            messageDiv.textContent = text;
            
            document.body.appendChild(messageDiv);
            
            setTimeout(() => {
                messageDiv.remove();
            }, 3000);
        }
    </script>
</body>
</html>`;
    }

    public dispose(): void {
        this.panel?.dispose();
    }
}