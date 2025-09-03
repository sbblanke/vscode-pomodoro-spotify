import * as vscode from 'vscode';
import { PomodoroTimer, TimerState } from '../timer/PomodoroTimer';
import { SpotifyService } from '../spotify/SpotifyService';

export class StatusBarManager implements vscode.Disposable {
    private timerStatusBarItem: vscode.StatusBarItem;
    private musicStatusBarItem: vscode.StatusBarItem;
    private trackUpdateInterval: NodeJS.Timeout | undefined;
    private disposables: vscode.Disposable[] = [];

    constructor(
        _context: vscode.ExtensionContext,
        private pomodoroTimer: PomodoroTimer,
        private spotifyService: SpotifyService
    ) {
        // Create status bar items
        this.timerStatusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        this.musicStatusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            99
        );

        this.setupStatusBarItems();
        this.setupEventListeners();
        this.updateDisplay();
        this.checkAuthAndStartUpdates();
    }

    private setupStatusBarItems(): void {
        // Timer status bar item
        this.timerStatusBarItem.command = 'pomodoro-spotify.showTimerControls';
        this.timerStatusBarItem.tooltip = 'Pomodoro Timer - Click for controls';
        this.timerStatusBarItem.show();

        // Music status bar item
        this.musicStatusBarItem.command = 'pomodoro-spotify.authenticateSpotify';
        this.musicStatusBarItem.tooltip = 'Spotify Integration - Click to connect';
        this.musicStatusBarItem.show();
    }

    private setupEventListeners(): void {
        // Listen to timer state changes
        this.disposables.push(
            this.pomodoroTimer.onDidChangeState(() => {
                this.updateTimerDisplay();
            })
        );

        // Listen to timer time changes
        this.disposables.push(
            this.pomodoroTimer.onDidChangeTime(() => {
                this.updateTimerDisplay();
            })
        );

        // Listen to Spotify authentication changes
        this.disposables.push(
            this.spotifyService.onDidChangeAuthState((isAuthenticated) => {
                this.updateMusicDisplay();
                if (isAuthenticated) {
                    this.startTrackUpdates();
                } else {
                    this.stopTrackUpdates();
                }
            })
        );
    }

    private async checkAuthAndStartUpdates(): Promise<void> {
        const isAuthenticated = await this.spotifyService.isAuthenticated();
        if (isAuthenticated) {
            this.startTrackUpdates();
        }
    }

    private updateDisplay(): void {
        this.updateTimerDisplay();
        this.updateMusicDisplay();
    }

    private updateTimerDisplay(): void {
        const state = this.pomodoroTimer.getState();
        const remainingTime = this.pomodoroTimer.getRemainingTime();
        const completedIntervals = this.pomodoroTimer.getCompletedIntervals();
        const isNetworkConnected = this.spotifyService.isNetworkConnected();

        let icon: string;
        let text: string;
        let tooltip: string;

        switch (state) {
            case TimerState.Work:
                icon = isNetworkConnected ? '🍅' : '⚠️';
                text = `${icon} ${this.formatTime(remainingTime)}`;
                tooltip = `Work session - ${this.formatTime(remainingTime)} remaining ${isNetworkConnected ? '' : '(Network Issue)'} (Click for controls)`;
                break;

            case TimerState.ShortBreak:
                icon = isNetworkConnected ? '☕' : '⚠️';
                text = `${icon} ${this.formatTime(remainingTime)}`;
                tooltip = `Short break - ${this.formatTime(remainingTime)} remaining ${isNetworkConnected ? '' : '(Network Issue)'} (Click for controls)`;
                break;

            case TimerState.LongBreak:
                icon = isNetworkConnected ? '🌟' : '⚠️';
                text = `${icon} ${this.formatTime(remainingTime)}`;
                tooltip = `Long break - ${this.formatTime(remainingTime)} remaining ${isNetworkConnected ? '' : '(Network Issue)'} (Click for controls)`;
                break;

            case TimerState.Stopped:
            default:
                icon = isNetworkConnected ? '⏱️' : '⚠️';
                text = completedIntervals > 0 
                    ? `${icon} ${completedIntervals} done` 
                    : `${icon} Ready`;
                tooltip = `Pomodoro Timer - ${completedIntervals} intervals completed ${isNetworkConnected ? '' : '(Network Issue)'} (Click for controls)`;
                break;
        }

        this.timerStatusBarItem.text = text;
        this.timerStatusBarItem.tooltip = tooltip;
        this.timerStatusBarItem.command = 'pomodoro-spotify.showTimerControls';
    }

    private async updateMusicDisplay(): Promise<void> {
        try {
            const isAuthenticated = await this.spotifyService.isAuthenticated();

            if (!isAuthenticated) {
                this.musicStatusBarItem.text = '🎵 Connect Spotify';
                this.musicStatusBarItem.tooltip = 'Click to connect to Spotify';
                this.musicStatusBarItem.command = 'pomodoro-spotify.authenticateSpotify';
                return;
            }

            const currentTrack = await this.spotifyService.getCurrentTrack();
            
            if (currentTrack) {
                const playIcon = currentTrack.isPlaying ? '▶️' : '⏸️';
                const trackInfo = `${currentTrack.name} - ${currentTrack.artists.join(', ')}`;
                const displayText = trackInfo.length > 40 
                    ? trackInfo.substring(0, 37) + '...' 
                    : trackInfo;

                this.musicStatusBarItem.text = `${playIcon} ${displayText}`;
                this.musicStatusBarItem.tooltip = `${currentTrack.isPlaying ? 'Now playing' : 'Paused'}: ${trackInfo}`;
                this.musicStatusBarItem.command = undefined; // Remove click action when playing
            } else {
                this.musicStatusBarItem.text = '🎵 No music';
                this.musicStatusBarItem.tooltip = 'No track currently playing on Spotify';
                this.musicStatusBarItem.command = undefined;
            }
        } catch (error) {
            console.error('Error updating music display:', error);
            this.musicStatusBarItem.text = '🎵 Error';
            this.musicStatusBarItem.tooltip = 'Error connecting to Spotify';
            this.musicStatusBarItem.command = 'pomodoro-spotify.authenticateSpotify';
        }
    }

    private formatTime(seconds: number): string {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    private startTrackUpdates(): void {
        this.stopTrackUpdates();
        
        // Initial update
        this.updateMusicDisplay();
        
        // Then update every 2 seconds for more responsiveness
        this.trackUpdateInterval = setInterval(async () => {
            try {
                await this.updateMusicDisplay();
            } catch (error) {
                console.error('Error in track update interval:', error);
            }
        }, 2000);
    }

    private stopTrackUpdates(): void {
        if (this.trackUpdateInterval) {
            clearInterval(this.trackUpdateInterval);
            this.trackUpdateInterval = undefined;
        }
    }

    public dispose(): void {
        this.stopTrackUpdates();
        this.timerStatusBarItem.dispose();
        this.musicStatusBarItem.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}