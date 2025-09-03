import * as vscode from 'vscode';
import * as https from 'https';
import * as crypto from 'crypto';
import { ErrorHandler, ErrorType } from '../utils/ErrorHandler';
import { AuthCallbackServer } from '../auth/AuthCallbackServer';

export interface PlaylistInfo {
    id: string;
    name: string;
    description: string;
    trackCount: number;
}

export interface CurrentTrack {
    name: string;
    artists: string[];
    isPlaying: boolean;
    progressMs?: number;
    durationMs?: number;
    album?: string;
    imageUrl?: string;
}

export class SpotifyService {
    private codeVerifier: string = '';
    private authState: string = '';
    private lastKnownTrack: CurrentTrack | null = null;
    private networkConnected: boolean = true;
    private pendingAuthResolve: Function | undefined;
    private pendingAuthReject: Function | undefined;
    private authCallbackServer: AuthCallbackServer | null = null;
    
    // Client ID from VS Code settings, environment variable, or fallback to built-in
    private getClientId(): string {
        const config = vscode.workspace.getConfiguration('pomodoroSpotify');
        const settingsClientId = config.get<string>('spotify.clientId', '');
        
        if (settingsClientId) {
            return settingsClientId;
        }
        
        if (process.env.SPOTIFY_CLIENT_ID) {
            return process.env.SPOTIFY_CLIENT_ID;
        }
        
        // Built-in client ID for personal use - trigger user awareness
        this.showSharedClientIdWarning();
        return 'c8bb1453d9954a9db7cceb166fdeb4d5';
    }

    private async showSharedClientIdWarning(): Promise<void> {
        // Only show warning once per session
        const hasShownWarning = this.context.globalState.get('hasShownClientIdWarning', false);
        if (hasShownWarning) {
            return;
        }

        const action = await vscode.window.showInformationMessage(
            '🔒 You\'re using a shared Spotify Client ID (limited to 25 total users). For enhanced security and reliability, consider setting up your own Spotify Developer App.',
            { modal: false },
            'Set Up Custom Client ID',
            'Learn More',
            'Dismiss'
        );

        switch (action) {
            case 'Set Up Custom Client ID':
                await this.openClientIdSetupGuide();
                break;
            case 'Learn More':
                await this.showClientIdInformation();
                break;
            case 'Dismiss':
                await this.context.globalState.update('hasShownClientIdWarning', true);
                break;
        }
    }

    private async openClientIdSetupGuide(): Promise<void> {
        const action = await vscode.window.showInformationMessage(
            '📋 Client ID Setup:\n\n1. Go to developer.spotify.com\n2. Create a new app\n3. Set redirect URI to: http://127.0.0.1:3000/callback\n4. Copy your Client ID\n5. Open VS Code Settings and search for "pomodoro spotify client"',
            { modal: true },
            'Open Spotify Developer Dashboard',
            'Open VS Code Settings'
        );

        if (action === 'Open Spotify Developer Dashboard') {
            vscode.env.openExternal(vscode.Uri.parse('https://developer.spotify.com/dashboard'));
        } else if (action === 'Open VS Code Settings') {
            vscode.commands.executeCommand('workbench.action.openSettings', 'pomodoroSpotify.spotify.clientId');
        }
    }

    private async showClientIdInformation(): Promise<void> {
        vscode.window.showInformationMessage(
            '🔒 Security & Reliability Info:\n\n' +
            '• Shared Client ID: Limited to 25 total users across all installations\n' +
            '• Custom Client ID: Unlimited users for your personal use\n' +
            '• Setup takes 5 minutes and is completely free\n' +
            '• Your data remains private and secure with either option',
            { modal: true },
            'Got it'
        );
        await this.context.globalState.update('hasShownClientIdWarning', true);
    }

    private logClientIdUsage(): void {
        const clientId = this.getClientId();
        const isSharedClientId = clientId === 'c8bb1453d9954a9db7cceb166fdeb4d5';
        const timestamp = new Date().toISOString();
        
        // Log anonymized usage statistics (no personal data)
        const usageStats = {
            timestamp,
            isSharedClientId,
            sessionId: this.generateSessionId(), // Anonymous session identifier
        };
        
        if (isSharedClientId) {
            console.warn('🔒 Pomodoro Spotify: Using shared Client ID - consider configuring custom Client ID for enhanced reliability');
            
            // Store usage count for potential user notifications
            const currentCount = this.context.globalState.get('sharedClientIdUsageCount', 0) as number;
            this.context.globalState.update('sharedClientIdUsageCount', currentCount + 1);
            
            // Show scaling information after multiple uses
            if (currentCount > 0 && currentCount % 5 === 0) {
                this.showScalingInformation();
            }
        }
        
        // Store anonymized usage log (limit to last 10 entries to prevent unbounded growth)
        const existingLogs = this.context.globalState.get('clientIdUsageLogs', []) as any[];
        const newLogs = [...existingLogs.slice(-9), usageStats]; // Keep only last 10
        this.context.globalState.update('clientIdUsageLogs', newLogs);
    }

    private generateSessionId(): string {
        // Generate anonymous session ID (not tied to user identity)
        return Math.random().toString(36).substring(2, 15);
    }

    private async showScalingInformation(): Promise<void> {
        const action = await vscode.window.showInformationMessage(
            '📈 Scaling Notice: You\'re actively using the shared Spotify Client ID. As the extension grows in popularity, consider setting up your own Client ID to ensure uninterrupted service.',
            { modal: false },
            'Set Up My Own Client ID',
            'Remind Me Later'
        );

        if (action === 'Set Up My Own Client ID') {
            await this.openClientIdSetupGuide();
        }
    }
    private readonly ACCESS_TOKEN_KEY = 'spotify_access_token';
    private readonly REFRESH_TOKEN_KEY = 'spotify_refresh_token';
    private readonly TOKEN_EXPIRY_KEY = 'spotify_token_expiry';
    // Will be set dynamically using proper VSCode extension ID format
    private redirectUri: string = '';
    private readonly SCOPES = [
        'user-read-playback-state',
        'user-modify-playback-state',
        'playlist-read-private',
        'playlist-read-collaborative'
    ];

    private onAuthStateChange: vscode.EventEmitter<boolean> = new vscode.EventEmitter<boolean>();
    public readonly onDidChangeAuthState = this.onAuthStateChange.event;

    constructor(private context: vscode.ExtensionContext) {
        // Use the exact redirect URI configured in Spotify app settings
        this.redirectUri = 'http://127.0.0.1:3000/callback';
        this.authCallbackServer = new AuthCallbackServer();
    }

    public async authenticate(): Promise<void> {
        // Log usage for monitoring (anonymized)
        this.logClientIdUsage();
        
        return new Promise(async (resolve, reject) => {
            try {
                this.pendingAuthResolve = resolve;
                this.pendingAuthReject = reject;
                
                // Start the local callback server
                if (!this.authCallbackServer) {
                    this.authCallbackServer = new AuthCallbackServer();
                }
                
                const port = await this.authCallbackServer.startServer();
                // Auth server started successfully
                
                await this.openAuthUrl();
                
                // Set timeout for authentication
                setTimeout(() => {
                    if (this.pendingAuthReject) {
                        this.pendingAuthReject(new Error('Authentication timeout'));
                        this.pendingAuthReject = undefined;
                        this.pendingAuthResolve = undefined;
                        this.authCallbackServer?.stopServer();
                    }
                }, 300000); // 5 minute timeout
                
            } catch (error) {
                console.error('Error starting authentication:', error);
                reject(error);
            }
        });
    }

    public async isAuthenticated(): Promise<boolean> {
        const accessToken = await this.context.secrets.get(this.ACCESS_TOKEN_KEY);
        const tokenExpiry = await this.context.globalState.get(this.TOKEN_EXPIRY_KEY) as number;
        
        if (!accessToken || !tokenExpiry) {
            return false;
        }

        // Check if token is expired (with 5-minute buffer)
        const now = Date.now();
        if (tokenExpiry - 300000 < now) {
            // Try to refresh the token
            const refreshed = await this.refreshAccessToken();
            return refreshed;
        }

        return true;
    }

    public async getPlaylists(): Promise<PlaylistInfo[]> {
        return await ErrorHandler.withErrorHandling(async () => {
            const accessToken = await this.context.secrets.get(this.ACCESS_TOKEN_KEY);
            if (!accessToken) {
                throw new Error('Spotify not authenticated');
            }

            const response = await this.makeSpotifyRequest('/v1/me/playlists?limit=50', accessToken);
            return response.items.map((playlist: any) => ({
                id: playlist.id,
                name: playlist.name,
                description: playlist.description || '',
                trackCount: playlist.tracks.total
            }));
        }, ErrorType.SpotifyAPI, 'fetching playlists') || [];
    }

    public async getCurrentTrack(): Promise<CurrentTrack | null> {
        const accessToken = await this.context.secrets.get(this.ACCESS_TOKEN_KEY);
        if (!accessToken) {
            return null;
        }

        try {
            const response = await this.makeSpotifyRequest('/v1/me/player/currently-playing', accessToken);
            if (!response || !response.item) {
                return this.lastKnownTrack;
            }

            const currentTrack = {
                name: response.item.name,
                artists: response.item.artists.map((artist: any) => artist.name),
                isPlaying: response.is_playing,
                progressMs: response.progress_ms,
                durationMs: response.item.duration_ms,
                album: response.item.album?.name,
                imageUrl: response.item.album?.images?.[0]?.url
            };
            
            this.lastKnownTrack = currentTrack;
            this.networkConnected = true;
            return currentTrack;
        } catch (error) {
            this.networkConnected = false;
            
            // Return cached track with network error indication
            if (this.lastKnownTrack) {
                return {
                    ...this.lastKnownTrack,
                    name: `⚠️ ${this.lastKnownTrack.name}`,
                    isPlaying: true // Assume still playing if we had a track
                };
            }
            
            return {
                name: '⚠️ Network Error',
                artists: ['Connection Lost'],
                isPlaying: false
            };
        }
    }

    public async switchToWorkPlaylist(): Promise<void> {
        const config = vscode.workspace.getConfiguration('pomodoroSpotify');
        const workPlaylistId = config.get('workPlaylist') as string;
        const shuffleWork = config.get('shuffleWorkPlaylist', false) as boolean;
        
        if (workPlaylistId && config.get('autoStartMusic', true)) {
            await this.playPlaylist(workPlaylistId, shuffleWork);
        }
    }

    public async switchToBreakPlaylist(): Promise<void> {
        const config = vscode.workspace.getConfiguration('pomodoroSpotify');
        const breakPlaylistId = config.get('breakPlaylist') as string;
        const shuffleBreak = config.get('shuffleBreakPlaylist', false) as boolean;
        
        if (breakPlaylistId && config.get('autoStartMusic', true)) {
            await this.playPlaylist(breakPlaylistId, shuffleBreak);
        }
    }

    public async pauseMusic(): Promise<void> {
        const accessToken = await this.context.secrets.get(this.ACCESS_TOKEN_KEY);
        if (!accessToken) {
            return;
        }

        try {
            await this.makeSpotifyRequest('/v1/me/player/pause', accessToken, 'PUT');
        } catch (error) {
            // Only log pause errors, don't show user notifications for pause failures
            // Error pausing music (this is usually harmless)
        }
    }

    public async switchToWorkPlaylistWithPause(): Promise<void> {
        await this.pauseMusic();
        await new Promise(resolve => setTimeout(resolve, 300)); // Brief pause
        await this.switchToWorkPlaylist();
    }

    public async switchToBreakPlaylistWithPause(): Promise<void> {
        await this.pauseMusic();
        await new Promise(resolve => setTimeout(resolve, 300)); // Brief pause
        await this.switchToBreakPlaylist();
    }

    private async playPlaylist(playlistId: string, shuffle: boolean = false): Promise<void> {
        const accessToken = await this.context.secrets.get(this.ACCESS_TOKEN_KEY);
        if (!accessToken) {
            return;
        }

        try {
            // First, ensure we have an active device
            const activeDevice = await this.ensureActiveDevice(accessToken);
            if (!activeDevice) {
                // No active device available for playback
                vscode.window.showWarningMessage(
                    'No Spotify device is active. Please open Spotify on any device (phone, desktop, web player) and start playing something, then try again.',
                    'Open Spotify Web Player'
                ).then(selection => {
                    if (selection === 'Open Spotify Web Player') {
                        vscode.env.openExternal(vscode.Uri.parse('https://open.spotify.com/'));
                    }
                });
                return;
            }

            // Set shuffle state first if specified
            await this.makeSpotifyRequest(`/v1/me/player/shuffle?state=${shuffle}`, accessToken, 'PUT');

            await this.makeSpotifyRequest('/v1/me/player/play', accessToken, 'PUT', {
                context_uri: `spotify:playlist:${playlistId}`
            });
        } catch (error) {
            console.error('Error playing playlist:', error);
            // Provide user guidance for device issues
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('NO_ACTIVE_DEVICE')) {
                vscode.window.showWarningMessage(
                    'No active Spotify device found. Please open Spotify on any device and start playing music, then try again.',
                    'Open Spotify Web Player'
                ).then(selection => {
                    if (selection === 'Open Spotify Web Player') {
                        vscode.env.openExternal(vscode.Uri.parse('https://open.spotify.com/'));
                    }
                });
            }
        }
    }

    private async ensureActiveDevice(accessToken: string): Promise<boolean> {
        try {
            // First, check if there's already an active device
            const playerState = await this.makeSpotifyRequest('/v1/me/player', accessToken);
            if (playerState && playerState.device && playerState.device.is_active) {
                return true; // Active device found
            }

            // Get available devices
            const devicesResponse = await this.makeSpotifyRequest('/v1/me/player/devices', accessToken);
            const devices = devicesResponse.devices || [];
            
            if (devices.length === 0) {
                // No Spotify devices available
                return false;
            }

            // Find the best device to activate with smart prioritization
            const availableDevice = this.selectBestDevice(devices);
            
            if (!availableDevice) {
                // No suitable device found for activation
                return false;
            }

            // Try to activate the device by transferring playback to it
            try {
                await this.makeSpotifyRequest('/v1/me/player', accessToken, 'PUT', {
                    device_ids: [availableDevice.id],
                    play: false // Don't start playing immediately
                });
                
                // Wait a moment for the transfer to complete
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                return true;
            } catch (transferError) {
                // Could not transfer playback to device
                return false;
            }

        } catch (error) {
            console.error('Error ensuring active device:', error);
            return false;
        }
    }

    private async makeSpotifyRequest(endpoint: string, accessToken: string, method: string = 'GET', body?: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const options: https.RequestOptions = {
                hostname: 'api.spotify.com',
                path: endpoint,
                method: method,
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            const jsonData = data ? JSON.parse(data) : {};
                            resolve(jsonData);
                        } catch (parseError) {
                            resolve(data);
                        }
                    } else {
                        // Sanitize error response to prevent information disclosure
                        const sanitizedError = res.statusCode === 401 ? 'Authentication required' :
                                               res.statusCode === 403 ? 'Access forbidden' :
                                               res.statusCode === 429 ? 'Rate limit exceeded' :
                                               res.statusCode === 404 ? 'Resource not found' :
                                               `Request failed with status ${res.statusCode}`;
                        reject(new Error(sanitizedError));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            if (body) {
                req.write(JSON.stringify(body));
            }
            req.end();
        });
    }

    private generateCodeChallenge(codeVerifier: string): string {
        return crypto
            .createHash('sha256')
            .update(codeVerifier)
            .digest('base64url');
    }

    private generateCodeVerifier(): string {
        return crypto.randomBytes(32).toString('base64url');
    }

    public async handleAuthCallback(uri: vscode.Uri): Promise<void> {
        const query = new URLSearchParams(uri.query);
        const code = query.get('code');
        const error = query.get('error');
        const state = query.get('state');
        
        // Verify state parameter to prevent CSRF attacks
        if (state !== this.authState) {
            const stateError = new Error('Invalid state parameter - potential CSRF attack');
            if (this.pendingAuthReject) {
                this.pendingAuthReject(stateError);
            }
            vscode.window.showErrorMessage('Authentication failed: Security error');
            this.authCallbackServer?.stopServer();
            return;
        }
        
        if (code && this.pendingAuthResolve) {
            try {
                await this.exchangeCodeForTokens(code);
                this.onAuthStateChange.fire(true);
                this.pendingAuthResolve();
                vscode.window.showInformationMessage(
                    '🎉 Spotify Connected! Configure your playlists in Settings to enable automatic music switching during focus sessions.',
                    'Open Settings'
                ).then(selection => {
                    if (selection === 'Open Settings') {
                        vscode.commands.executeCommand('workbench.action.openSettings', 'pomodoroSpotify');
                    }
                });
            } catch (authError) {
                if (this.pendingAuthReject) {
                    this.pendingAuthReject(authError);
                }
                vscode.window.showErrorMessage(`Authentication failed: ${authError}`);
            }
        } else if (error && this.pendingAuthReject) {
            this.pendingAuthReject(new Error(`Authentication failed: ${error}`));
            vscode.window.showErrorMessage(`Spotify authentication failed: ${error}`);
        }
        
        // Clean up
        this.pendingAuthResolve = undefined;
        this.pendingAuthReject = undefined;
        this.authCallbackServer?.stopServer();
    }

    private async exchangeCodeForTokens(code: string): Promise<void> {
        
        const body = new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: this.redirectUri,
            client_id: this.getClientId(),
            code_verifier: this.codeVerifier
        });

        return new Promise((resolve, reject) => {
            const options: https.RequestOptions = {
                hostname: 'accounts.spotify.com',
                path: '/api/token',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', async () => {
                    try {
                        if (res.statusCode !== 200) {
                            reject(new Error(`Token exchange failed: ${res.statusCode} ${data}`));
                            return;
                        }

                        const tokenData = JSON.parse(data);
                        
                        // Store tokens securely
                        await this.context.secrets.store(this.ACCESS_TOKEN_KEY, tokenData.access_token);
                        await this.context.secrets.store(this.REFRESH_TOKEN_KEY, tokenData.refresh_token);
                        
                        // Calculate expiry time
                        const expiryTime = Date.now() + (tokenData.expires_in * 1000);
                        await this.context.globalState.update(this.TOKEN_EXPIRY_KEY, expiryTime);
                        
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                });
            });

            req.on('error', reject);
            req.write(body.toString());
            req.end();
        });
    }

    private async refreshAccessToken(): Promise<boolean> {
        const refreshToken = await this.context.secrets.get(this.REFRESH_TOKEN_KEY);
        if (!refreshToken) {
            return false;
        }

        const body = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: this.getClientId()
        });

        return new Promise((resolve) => {
            const options: https.RequestOptions = {
                hostname: 'accounts.spotify.com',
                path: '/api/token',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', async () => {
                    try {
                        if (res.statusCode !== 200) {
                            resolve(false);
                            return;
                        }

                        const tokenData = JSON.parse(data);
                        
                        // Update tokens
                        await this.context.secrets.store(this.ACCESS_TOKEN_KEY, tokenData.access_token);
                        if (tokenData.refresh_token) {
                            await this.context.secrets.store(this.REFRESH_TOKEN_KEY, tokenData.refresh_token);
                        }
                        
                        // Update expiry
                        const expiryTime = Date.now() + (tokenData.expires_in * 1000);
                        await this.context.globalState.update(this.TOKEN_EXPIRY_KEY, expiryTime);
                        
                        resolve(true);
                    } catch (error) {
                        console.error('Token refresh failed:', error);
                        resolve(false);
                    }
                });
            });

            req.on('error', () => resolve(false));
            req.write(body.toString());
            req.end();
        });
    }

    private async openAuthUrl(): Promise<void> {
        this.codeVerifier = this.generateCodeVerifier();
        this.authState = crypto.randomBytes(32).toString('base64url');
        const codeChallenge = this.generateCodeChallenge(this.codeVerifier);
        
        const authUrl = `https://accounts.spotify.com/authorize?` +
            `client_id=${this.getClientId()}&` +
            `response_type=code&` +
            `redirect_uri=${encodeURIComponent(this.redirectUri)}&` +
            `scope=${encodeURIComponent(this.SCOPES.join(' '))}&` +
            `code_challenge_method=S256&` +
            `code_challenge=${codeChallenge}&` +
            `state=${this.authState}`;
            
        // Opening Spotify authorization URL
        
        vscode.env.openExternal(vscode.Uri.parse(authUrl)).then(
            (success) => {
                if (success) {
                    vscode.window.showInformationMessage(
                        '🎵 Spotify Authorization: After clicking "Agree" in your browser, you will see a success page that will automatically redirect back to VS Code.',
                        { modal: false }
                    );
                } else {
                    vscode.window.showErrorMessage('Failed to open browser for Spotify authorization');
                }
            },
            (error) => {
                console.error('Error opening auth URL:', error);
                vscode.window.showErrorMessage(`Failed to open authorization page: ${error}`);
            }
        );
    }


    public isNetworkConnected(): boolean {
        return this.networkConnected;
    }

    public async togglePlayback(): Promise<void> {
        const playbackState = await this.getCurrentTrack();
        if (playbackState?.isPlaying) {
            await this.pauseMusic();
        } else {
            await this.resumePlayback();
        }
        // Clear cache to force immediate update on next status bar refresh
        setTimeout(() => {
            this.lastKnownTrack = null;
        }, 300);
    }

    public async nextTrack(): Promise<void> {
        const accessToken = await this.context.secrets.get(this.ACCESS_TOKEN_KEY);
        if (!accessToken) {
            throw new Error('Not authenticated with Spotify');
        }
        await this.makeSpotifyRequest('/v1/me/player/next', accessToken, 'POST');
        // Clear cache to force immediate update on next status bar refresh
        setTimeout(() => {
            this.lastKnownTrack = null;
        }, 500);
    }

    public async previousTrack(): Promise<void> {
        const accessToken = await this.context.secrets.get(this.ACCESS_TOKEN_KEY);
        if (!accessToken) {
            throw new Error('Not authenticated with Spotify');
        }
        await this.makeSpotifyRequest('/v1/me/player/previous', accessToken, 'POST');
        // Clear cache to force immediate update on next status bar refresh
        setTimeout(() => {
            this.lastKnownTrack = null;
        }, 500);
    }

    private async resumePlayback(): Promise<void> {
        const accessToken = await this.context.secrets.get(this.ACCESS_TOKEN_KEY);
        if (!accessToken) {
            throw new Error('Not authenticated with Spotify');
        }
        return this.makeSpotifyRequest('/v1/me/player/play', accessToken, 'PUT');
    }

    public async pausePlayback(): Promise<void> {
        await this.pauseMusic();
    }

    public async setShuffle(state: boolean): Promise<void> {
        const accessToken = await this.context.secrets.get(this.ACCESS_TOKEN_KEY);
        if (!accessToken) {
            throw new Error('Not authenticated with Spotify');
        }
        await this.makeSpotifyRequest(`/v1/me/player/shuffle?state=${state}`, accessToken, 'PUT');
    }

    /**
     * Smart device selection that prioritizes the most appropriate device for the user
     */
    private selectBestDevice(devices: any[]): any {
        if (!devices || devices.length === 0) {
            return null;
        }

        // Priority order for device selection:
        // 1. Currently active device (highest priority)
        const activeDevice = devices.find(device => device.is_active);
        if (activeDevice) {
            return activeDevice;
        }

        // 2. Computer/Desktop applications (likely current device)
        const computerDevices = devices.filter(device => 
            !device.is_restricted && 
            (device.type === 'Computer' || device.type === 'Desktop')
        );
        if (computerDevices.length > 0) {
            const selectedDevice = computerDevices[0];
            return selectedDevice;
        }

        // 3. Spotify Web Player (browser-based, likely current device)
        const webPlayers = devices.filter(device => 
            !device.is_restricted && 
            device.name.toLowerCase().includes('web player')
        );
        if (webPlayers.length > 0) {
            const selectedDevice = webPlayers[0];
            return selectedDevice;
        }

        // 4. Mobile devices (phones/tablets)
        const mobileDevices = devices.filter(device => 
            !device.is_restricted && 
            (device.type === 'Smartphone' || device.type === 'Tablet')
        );
        if (mobileDevices.length > 0) {
            const selectedDevice = mobileDevices[0];
            return selectedDevice;
        }

        // 5. Any other non-restricted device (speakers, smart devices, etc.)
        const otherDevices = devices.filter(device => !device.is_restricted);
        if (otherDevices.length > 0) {
            const selectedDevice = otherDevices[0];
            return selectedDevice;
        }

        // 6. Fallback to any device, even if restricted
        const fallbackDevice = devices[0];
        // Fallback device selected
        return fallbackDevice;
    }

    public async setPlaylist(playlistId: string, shuffle: boolean = false): Promise<void> {
        await this.playPlaylist(playlistId, shuffle);
    }

    public async getCurrentPlaybackState(): Promise<any> {
        const accessToken = await this.context.secrets.get(this.ACCESS_TOKEN_KEY);
        if (!accessToken) {
            return null;
        }

        try {
            return await this.makeSpotifyRequest('/v1/me/player', accessToken);
        } catch (error) {
            console.error('Error getting playback state:', error);
            return null;
        }
    }

    public dispose(): void {
        this.onAuthStateChange.dispose();
        this.authCallbackServer?.stopServer();
    }
}