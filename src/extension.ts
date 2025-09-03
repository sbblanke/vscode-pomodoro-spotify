import * as vscode from 'vscode';
import { PomodoroTimer } from './timer/PomodoroTimer';
import { SpotifyService } from './spotify/SpotifyService';
import { StatusBarManager } from './ui/StatusBarManager';
import { ProductivityTracker } from './stats/ProductivityTracker';
import { ErrorHandler } from './utils/ErrorHandler';
import { SoundManager } from './audio/SoundManager';
import { WelcomeWebview } from './ui/WelcomeWebview';

export async function activate(context: vscode.ExtensionContext) {
    // Extension activation complete

    // Initialize error handling
    ErrorHandler.initialize(context);


    // Initialize core services
    const spotifyService = new SpotifyService(context);
    const soundManager = new SoundManager(context);
    const productivityTracker = new ProductivityTracker(context);
    const pomodoroTimer = new PomodoroTimer(context, spotifyService, productivityTracker, soundManager);
    const statusBarManager = new StatusBarManager(context, pomodoroTimer, spotifyService);
    const welcomeWebview = new WelcomeWebview(context, spotifyService, soundManager);

    // Register commands
    const commands = [
        vscode.commands.registerCommand('pomodoro-spotify.startTimer', () => {
            pomodoroTimer.start();
        }),
        vscode.commands.registerCommand('pomodoro-spotify.startCustomTimer', async () => {
            await pomodoroTimer.startCustom();
        }),
        vscode.commands.registerCommand('pomodoro-spotify.stopTimer', () => {
            pomodoroTimer.stop();
        }),
        vscode.commands.registerCommand('pomodoro-spotify.resetTimer', () => {
            pomodoroTimer.reset();
        }),
        vscode.commands.registerCommand('pomodoro-spotify.skipInterval', () => {
            pomodoroTimer.skip();
        }),
        vscode.commands.registerCommand('pomodoro-spotify.authenticateSpotify', async () => {
            try {
                await spotifyService.authenticate();
                vscode.window.showInformationMessage('Successfully connected to Spotify!');
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to authenticate with Spotify: ${error}`);
            }
        }),
        vscode.commands.registerCommand('pomodoro-spotify.configureSettings', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'pomodoroSpotify');
        }),
        vscode.commands.registerCommand('pomodoro-spotify.viewStats', async () => {
            await productivityTracker.getStatsCommand();
        }),
        vscode.commands.registerCommand('pomodoro-spotify.viewErrorHistory', async () => {
            const errors = await ErrorHandler.getErrorHistory();
            if (errors.length === 0) {
                vscode.window.showInformationMessage('No errors recorded.');
                return;
            }
            
            const recentErrors = errors.slice(-10).reverse();
            const errorList = recentErrors.map((e, i) => 
                `${i + 1}. [${new Date(e.timestamp).toLocaleString()}] ${e.error.type}: ${e.error.message}`
            ).join('\n\n');
            
            const choice = await vscode.window.showInformationMessage(
                `Recent Error History (${errors.length} total):\n\n${errorList}`,
                { modal: true },
                'Clear History',
                'Export Logs'
            );
            
            if (choice === 'Clear History') {
                await ErrorHandler.clearErrorHistory();
                vscode.window.showInformationMessage('Error history cleared.');
            } else if (choice === 'Export Logs') {
                const uri = await vscode.window.showSaveDialog({
                    defaultUri: vscode.Uri.file('pomodoro-error-log.json'),
                    filters: { 'JSON': ['json'] }
                });
                if (uri) {
                    await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(errors, null, 2), 'utf8'));
                    vscode.window.showInformationMessage(`Error log exported to ${uri.fsPath}`);
                }
            }
        }),
        vscode.commands.registerCommand('pomodoro-spotify.showTimerControls', async () => {
            await showTimerControlPanel(pomodoroTimer, spotifyService);
        }),
        vscode.commands.registerCommand('pomodoro-spotify.pauseTimer', () => {
            const state = pomodoroTimer.getState();
            if (state !== 'stopped') {
                if (pomodoroTimer.isPaused()) {
                    pomodoroTimer.resume();
                } else {
                    pomodoroTimer.pause();
                }
            } else {
                pomodoroTimer.start();
            }
        }),
        vscode.commands.registerCommand('pomodoro-spotify.restartInterval', () => {
            pomodoroTimer.restart();
        }),
        vscode.commands.registerCommand('pomodoro-spotify.playPause', async () => {
            try {
                await spotifyService.togglePlayback();
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to toggle playback: ${error}`);
            }
        }),
        vscode.commands.registerCommand('pomodoro-spotify.nextTrack', async () => {
            try {
                await spotifyService.nextTrack();
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to skip to next track: ${error}`);
            }
        }),
        vscode.commands.registerCommand('pomodoro-spotify.previousTrack', async () => {
            try {
                await spotifyService.previousTrack();
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to go to previous track: ${error}`);
            }
        }),
        vscode.commands.registerCommand('pomodoro-spotify.stopMusic', async () => {
            try {
                await spotifyService.pausePlayback();
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to stop music: ${error}`);
            }
        }),
        vscode.commands.registerCommand('pomodoro-spotify.configureSounds', async () => {
            await soundManager.configureSounds();
        }),
        vscode.commands.registerCommand('pomodoro-spotify.showWelcome', async () => {
            await welcomeWebview.show();
        })
    ];

    // Register URI handler for OAuth callbacks
    context.subscriptions.push(
        vscode.window.registerUriHandler({
            handleUri: async (uri: vscode.Uri) => {
                if (uri.path === '/auth-callback') {
                    await spotifyService.handleAuthCallback(uri);
                }
            }
        })
    );

    // Add all disposables to context
    commands.forEach(command => context.subscriptions.push(command));
    context.subscriptions.push(statusBarManager);

    // Show welcome message on first activation
    const hasShownWelcome = context.globalState.get('hasShownWelcome', false);
    if (!hasShownWelcome) {
        await welcomeWebview.show();
        context.globalState.update('hasShownWelcome', true);
    }
}


async function showTimerControlPanel(timer: PomodoroTimer, spotify: SpotifyService): Promise<void> {
    const currentTrack = await spotify.getCurrentTrack();
    const isRunning = timer.getState() !== 'stopped';
    const remainingTime = timer.getRemainingTime();
    
    const formatTime = (ms?: number): string => {
        if (!ms) return '0:00';
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };
    
    const trackInfo = currentTrack 
        ? `${currentTrack.isPlaying ? '▶️' : '⏸️'} ${currentTrack.name} - ${currentTrack.artists.join(', ')}`
        : '♪ No track playing';
    
    const trackProgress = currentTrack?.progressMs && currentTrack?.durationMs
        ? ` (${formatTime(currentTrack.progressMs)}/${formatTime(currentTrack.durationMs)})`
        : '';
    
    const timerInfo = isRunning 
        ? `🍅 ${Math.floor(remainingTime / 60)}:${(remainingTime % 60).toString().padStart(2, '0')} (${timer.getState()})`
        : '🍅 Timer stopped';
    
    const quickPick = vscode.window.createQuickPick();
    quickPick.title = 'Pomodoro Timer Controls';
    quickPick.placeholder = `${timerInfo} | ${trackInfo}${trackProgress}`;
    
    interface ControlItem extends vscode.QuickPickItem {
        action: string;
        data?: any;
    }
    
    const items: ControlItem[] = [
        {
            label: '$(play) Start Timer',
            description: 'Begin a new pomodoro session',
            action: 'start'
        },
        {
            label: '$(clock) Start Custom Timer',
            description: 'Set custom work/break durations',
            action: 'custom'
        },
        {
            label: '$(debug-pause) Pause/Resume Timer',
            description: isRunning ? 'Pause current session' : 'Resume paused session',
            action: 'toggle-timer'
        },
        {
            label: '$(debug-step-over) Skip Interval',
            description: 'Move to next interval',
            action: 'skip'
        },
        {
            label: '$(debug-stop) Stop Timer',
            description: 'End current session',
            action: 'stop'
        },
        {
            label: '$(play-circle) Play/Pause Music',
            description: currentTrack?.isPlaying ? 'Pause current track' : 'Resume playback',
            action: 'toggle-music'
        },
        {
            label: '$(chevron-right) Next Track',
            description: 'Skip to next song',
            action: 'next-track'
        },
        {
            label: '$(chevron-left) Previous Track',
            description: 'Go to previous song',
            action: 'previous-track'
        },
        {
            label: '$(list-unordered) Select Playlist',
            description: 'Choose a different playlist',
            action: 'select-playlist'
        },
        {
            label: '$(symbol-boolean) Toggle Shuffle',
            description: 'Toggle shuffle mode',
            action: 'toggle-shuffle'
        },
        {
            label: '$(gear) Settings',
            description: 'Configure pomodoro and Spotify settings',
            action: 'settings'
        }
    ];
    
    quickPick.items = items;
    
    quickPick.onDidChangeSelection(async ([selection]) => {
        if (!selection) return;
        
        const item = selection as ControlItem;
        
        if (item.action === 'select-playlist') {
            quickPick.hide();
            await showPlaylistSelector(spotify, timer);
            return;
        }
        
        quickPick.hide();
        
        try {
            switch (item.action) {
                case 'start':
                    timer.start();
                    break;
                case 'custom':
                    await timer.startCustom();
                    break;
                case 'toggle-timer':
                    if (isRunning) {
                        timer.pause();
                    } else {
                        timer.resume();
                    }
                    break;
                case 'skip':
                    timer.skip();
                    break;
                case 'stop':
                    timer.stop();
                    break;
                case 'toggle-music':
                    await spotify.togglePlayback();
                    break;
                case 'next-track':
                    await spotify.nextTrack();
                    break;
                case 'previous-track':
                    await spotify.previousTrack();
                    break;
                case 'toggle-shuffle':
                    const playbackState = await spotify.getCurrentPlaybackState();
                    const currentShuffle = playbackState?.shuffle_state || false;
                    await spotify.setShuffle(!currentShuffle);
                    vscode.window.showInformationMessage(`Shuffle ${!currentShuffle ? 'enabled' : 'disabled'}`);
                    break;
                case 'settings':
                    vscode.commands.executeCommand('workbench.action.openSettings', 'pomodoroSpotify');
                    break;
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Action failed: ${error}`);
        }
    });
    
    quickPick.show();
}

async function showPlaylistSelector(spotify: SpotifyService, _timer: PomodoroTimer): Promise<void> {
    const playlists = await spotify.getPlaylists();
    const config = vscode.workspace.getConfiguration('pomodoroSpotify');
    
    if (playlists.length === 0) {
        vscode.window.showInformationMessage('No playlists found. Make sure you have playlists in your Spotify account.');
        return;
    }
    
    const quickPick = vscode.window.createQuickPick();
    quickPick.title = 'Select Playlist';
    quickPick.placeholder = 'Choose a playlist to play';
    
    interface PlaylistItem extends vscode.QuickPickItem {
        playlistId: string;
    }
    
    const items: PlaylistItem[] = playlists.map(playlist => ({
        label: `$(list-unordered) ${playlist.name}`,
        description: `${playlist.trackCount} tracks`,
        detail: playlist.description || 'No description',
        playlistId: playlist.id
    }));
    
    quickPick.items = items;
    
    quickPick.onDidChangeSelection(async ([selection]) => {
        if (!selection) return;
        
        const item = selection as PlaylistItem;
        quickPick.hide();
        
        try {
            await spotify.setPlaylist(item.playlistId);
            
            const setAsDefault = await vscode.window.showQuickPick([
                { label: 'Yes, set as work playlist default', value: 'work' },
                { label: 'Yes, set as break playlist default', value: 'break' },
                { label: 'No, just play this time', value: 'none' }
            ], {
                title: 'Set as Default Playlist?',
                placeHolder: 'Would you like to set this as a default playlist?'
            });
            
            if (setAsDefault?.value === 'work') {
                await config.update('workPlaylist', item.playlistId, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`Set "${selection.label.replace('$(list-unordered) ', '')}" as default work playlist`);
            } else if (setAsDefault?.value === 'break') {
                await config.update('breakPlaylist', item.playlistId, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`Set "${selection.label.replace('$(list-unordered) ', '')}" as default break playlist`);
            }
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to play playlist: ${error}`);
        }
    });
    
    quickPick.show();
}

export function deactivate() {
    // Extension deactivation cleanup complete
}