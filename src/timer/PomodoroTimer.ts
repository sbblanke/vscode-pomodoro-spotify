import * as vscode from 'vscode';
import { SpotifyService } from '../spotify/SpotifyService';
import { ProductivityTracker } from '../stats/ProductivityTracker';
import { SoundManager, SoundTrigger } from '../audio/SoundManager';

export enum TimerState {
    Stopped = 'stopped',
    Work = 'work',
    ShortBreak = 'shortBreak',
    LongBreak = 'longBreak'
}

export interface TimerConfig {
    workInterval: number;
    shortBreakInterval: number;
    longBreakInterval: number;
    longBreakAfter: number;
}

export class PomodoroTimer {
    private timer: NodeJS.Timeout | undefined;
    private state: TimerState = TimerState.Stopped;
    private remainingTime: number = 0;
    private completedIntervals: number = 0;
    private customBreakDuration: number | undefined;
    private isCustomSession: boolean = false;
    private onStateChange: vscode.EventEmitter<TimerState> = new vscode.EventEmitter<TimerState>();
    private onTimeChange: vscode.EventEmitter<number> = new vscode.EventEmitter<number>();

    public readonly onDidChangeState = this.onStateChange.event;
    public readonly onDidChangeTime = this.onTimeChange.event;

    constructor(
        private context: vscode.ExtensionContext,
        private spotifyService: SpotifyService,
        private productivityTracker: ProductivityTracker,
        private soundManager?: SoundManager
    ) {
        this.loadState();
    }

    public start(): void {
        if (this.state === TimerState.Stopped) {
            this.productivityTracker.startSession();
            this.startWorkInterval();
        } else {
            this.resume();
        }
    }

    public async startCustom(): Promise<void> {
        if (this.state !== TimerState.Stopped) {
            const choice = await vscode.window.showWarningMessage(
                'Timer is already running. Stop current timer to start custom session?',
                'Stop and Start Custom', 'Cancel'
            );
            if (choice !== 'Stop and Start Custom') {
                return;
            }
            this.stop();
        }

        const workInput = await vscode.window.showInputBox({
            prompt: 'Work interval duration (minutes)',
            value: '25',
            validateInput: (value) => {
                const num = parseInt(value);
                if (isNaN(num) || num < 1 || num > 120) {
                    return 'Please enter a number between 1 and 120';
                }
                return undefined;
            }
        });

        if (!workInput) return;

        const breakInput = await vscode.window.showInputBox({
            prompt: 'Break interval duration (minutes)',
            value: '5', 
            validateInput: (value) => {
                const num = parseInt(value);
                if (isNaN(num) || num < 1 || num > 60) {
                    return 'Please enter a number between 1 and 60';
                }
                return undefined;
            }
        });

        if (!breakInput) return;

        this.productivityTracker.startSession();
        this.startCustomWorkInterval(parseInt(workInput), parseInt(breakInput));
    }

    public stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
        this.state = TimerState.Stopped;
        this.productivityTracker.endSession();
        this.onStateChange.fire(this.state);
        this.saveState();
    }

    public reset(): void {
        this.stop();
        this.remainingTime = 0;
        this.completedIntervals = 0;
        this.onTimeChange.fire(this.remainingTime);
        this.saveState();
    }

    public skip(): void {
        this.productivityTracker.recordSkippedInterval();
        if (this.state === TimerState.Work) {
            this.skipWorkInterval();
        } else if (this.state === TimerState.ShortBreak || this.state === TimerState.LongBreak) {
            this.skipBreakInterval();
        }
    }

    public pause(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
            this.saveState();
            this.soundManager?.playSound(SoundTrigger.TimerPause);
            this.showNotification('Timer paused');
        }
    }

    public restart(): void {
        if (this.state !== TimerState.Stopped) {
            if (this.timer) {
                clearInterval(this.timer);
                this.timer = undefined;
            }
            
            // Restart the current interval with full time
            if (this.state === TimerState.Work) {
                const config = this.getConfig();
                this.remainingTime = this.isCustomSession ? 
                    (this.customBreakDuration ? 25 * 60 : 25 * 60) : // Default to 25 for custom work
                    config.workInterval * 60;
            } else if (this.state === TimerState.ShortBreak) {
                const config = this.getConfig();
                this.remainingTime = this.isCustomSession ? 
                    (this.customBreakDuration || 5) * 60 :
                    config.shortBreakInterval * 60;
            } else if (this.state === TimerState.LongBreak) {
                const config = this.getConfig();
                this.remainingTime = config.longBreakInterval * 60;
            }
            
            this.startTimer();
            this.onTimeChange.fire(this.remainingTime);
            this.showNotification(`${this.state.charAt(0).toUpperCase() + this.state.slice(1)} interval restarted`);
        }
    }

    public getState(): TimerState {
        return this.state;
    }

    public getRemainingTime(): number {
        return this.remainingTime;
    }

    public isPaused(): boolean {
        return this.state !== TimerState.Stopped && !this.timer && this.remainingTime > 0;
    }

    public getCompletedIntervals(): number {
        return this.completedIntervals;
    }

    private skipWorkInterval(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
        
        // Don't count as completed since it was skipped
        this.saveState();
        
        // Skip directly to break with pause behavior
        const transitionMode = vscode.workspace.getConfiguration('pomodoroSpotify').get<string>('transitionMode', 'manual');
        const autoStart = transitionMode === 'auto';
        
        if (autoStart) {
            setTimeout(() => this.startBreakInterval(true), 1000);
        } else {
            this.showCompletionNotification('Work session skipped. Time for a break.', () => {
                setTimeout(() => this.startBreakInterval(true), 1000);
            });
        }
    }

    private skipBreakInterval(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
        
        this.saveState();
        
        // Skip directly to work with pause behavior
        const transitionMode = vscode.workspace.getConfiguration('pomodoroSpotify').get<string>('transitionMode', 'manual');
        const autoStart = transitionMode === 'auto';
        
        if (autoStart) {
            setTimeout(() => this.startWorkInterval(true), 1000);
        } else {
            this.showCompletionNotification('Break skipped. Ready for work session?', () => {
                setTimeout(() => this.startWorkInterval(true), 1000);
            });
        }
    }

    private startWorkInterval(wasSkipped: boolean = false): void {
        const config = this.getConfig();
        this.state = TimerState.Work;
        this.remainingTime = config.workInterval * 60; // Convert minutes to seconds
        this.startTimer();
        this.onStateChange.fire(this.state);
        
        // Start work playlist - pause first if this was from a skip
        if (wasSkipped) {
            this.spotifyService.switchToWorkPlaylistWithPause();
        } else {
            this.spotifyService.switchToWorkPlaylist();
        }
        
        this.soundManager?.playSound(SoundTrigger.WorkStart);
        this.showNotification(`Work session started! 🍅 Focus for ${config.workInterval} minutes.`);
    }

    private startCustomWorkInterval(workMinutes: number, breakMinutes: number): void {
        this.state = TimerState.Work;
        this.remainingTime = workMinutes * 60;
        this.customBreakDuration = breakMinutes;
        this.isCustomSession = true;
        this.startTimer();
        this.onStateChange.fire(this.state);
        
        this.spotifyService.switchToWorkPlaylist();
        this.soundManager?.playSound(SoundTrigger.WorkStart);
        this.showNotification(`Custom work session started! 🍅 Focus for ${workMinutes} minutes.`);
    }

    private startCustomBreakInterval(): void {
        this.state = TimerState.ShortBreak;
        this.remainingTime = (this.customBreakDuration || 5) * 60;
        this.startTimer();
        this.onStateChange.fire(this.state);
        
        this.spotifyService.switchToBreakPlaylist();
        this.soundManager?.playSound(SoundTrigger.BreakStart);
        this.showNotification(`Custom break started! ☕ Relax for ${this.customBreakDuration || 5} minutes.`);
    }

    private startBreakInterval(wasSkipped: boolean = false): void {
        const config = this.getConfig();
        const isLongBreak = this.shouldTakeLongBreak();
        
        this.state = isLongBreak ? TimerState.LongBreak : TimerState.ShortBreak;
        const breakDuration = isLongBreak ? config.longBreakInterval : config.shortBreakInterval;
        this.remainingTime = breakDuration * 60;
        
        this.startTimer();
        this.onStateChange.fire(this.state);
        
        // Start break playlist - pause first if this was from a skip
        if (wasSkipped) {
            this.spotifyService.switchToBreakPlaylistWithPause();
        } else {
            this.spotifyService.switchToBreakPlaylist();
        }
        
        const breakType = isLongBreak ? 'long break' : 'short break';
        this.soundManager?.playSound(isLongBreak ? SoundTrigger.LongBreakStart : SoundTrigger.BreakStart);
        this.showNotification(`${breakType.charAt(0).toUpperCase() + breakType.slice(1)} time! ☕ Relax for ${breakDuration} minutes.`);
    }

    private startTimer(): void {
        this.timer = setInterval(() => {
            this.remainingTime--;
            this.onTimeChange.fire(this.remainingTime);
            
            // Check for warning sound triggers
            if (this.soundManager) {
                if (this.soundManager.shouldPlayWarningSound(this.remainingTime, SoundTrigger.Minute5Warning)) {
                    this.soundManager.playSound(SoundTrigger.Minute5Warning);
                } else if (this.soundManager.shouldPlayWarningSound(this.remainingTime, SoundTrigger.Minute1Warning)) {
                    this.soundManager.playSound(SoundTrigger.Minute1Warning);
                }
            }
            
            if (this.remainingTime <= 0) {
                if (this.state === TimerState.Work) {
                    this.completeWorkInterval();
                } else {
                    this.completeBreakInterval();
                }
            }
            
            this.saveState();
        }, 1000);
    }

    public resume(): void {
        if (!this.timer && this.remainingTime > 0) {
            this.startTimer();
            this.soundManager?.playSound(SoundTrigger.TimerResume);
            this.showNotification('Timer resumed');
        }
    }

    private completeWorkInterval(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
        
        const config = this.getConfig();
        this.productivityTracker.recordCompletedWorkInterval(config.workInterval);
        this.completedIntervals++;
        this.saveState();
        
        this.soundManager?.playSound(SoundTrigger.WorkEnd);
        
        const transitionMode = vscode.workspace.getConfiguration('pomodoroSpotify').get<string>('transitionMode', 'manual');
        const autoStart = transitionMode === 'auto';
        
        if (this.isCustomSession) {
            // Handle custom session break
            if (autoStart) {
                setTimeout(() => this.startCustomBreakInterval(), 1000);
            } else {
                this.showCompletionNotification('Work session completed! 🎉 Time for a custom break.', () => {
                    setTimeout(() => this.startCustomBreakInterval(), 1000);
                });
            }
        } else {
            // Handle regular session break
            if (autoStart) {
                setTimeout(() => this.startBreakInterval(), 1000);
            } else {
                this.showCompletionNotification('Work session completed! 🎉 Time for a break.', () => {
                    setTimeout(() => this.startBreakInterval(), 1000);
                });
            }
        }
    }

    private completeBreakInterval(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
        
        const config = this.getConfig();
        const breakDuration = this.state === TimerState.LongBreak ? config.longBreakInterval : config.shortBreakInterval;
        this.productivityTracker.recordCompletedBreakInterval(breakDuration);
        
        this.soundManager?.playSound(SoundTrigger.BreakEnd);
        
        const transitionMode = vscode.workspace.getConfiguration('pomodoroSpotify').get<string>('transitionMode', 'manual');
        const autoStart = transitionMode === 'auto';
        
        if (this.isCustomSession) {
            // End custom session after break
            this.isCustomSession = false;
            this.customBreakDuration = undefined;
            
            if (autoStart) {
                setTimeout(() => this.startWorkInterval(), 1000);
            } else {
                this.showCompletionNotification('Custom break completed! 💪 Start regular session?', () => {
                    setTimeout(() => this.startWorkInterval(), 1000);
                });
            }
        } else {
            // Handle regular session work continuation
            if (autoStart) {
                setTimeout(() => this.startWorkInterval(), 1000);
            } else {
                this.showCompletionNotification('Break time is over! 💪 Ready for another work session?', () => {
                    setTimeout(() => this.startWorkInterval(), 1000);
                });
            }
        }
    }

    private shouldTakeLongBreak(): boolean {
        const config = this.getConfig();
        return this.completedIntervals % config.longBreakAfter === 0;
    }

    private showCompletionNotification(message: string, onContinue: () => void): void {
        const config = vscode.workspace.getConfiguration('pomodoroSpotify');
        if (config.get('showNotifications', true)) {
            vscode.window.showInformationMessage(message, 'Continue', 'Stop Timer')
                .then(selection => {
                    if (selection === 'Continue') {
                        onContinue();
                    } else if (selection === 'Stop Timer') {
                        this.stop();
                    }
                });
        } else {
            // Auto-continue if notifications are disabled
            onContinue();
        }
    }

    private showNotification(message: string): void {
        const config = vscode.workspace.getConfiguration('pomodoroSpotify');
        if (config.get('showNotifications', true)) {
            vscode.window.showInformationMessage(message);
        }
    }

    private getConfig(): TimerConfig {
        const config = vscode.workspace.getConfiguration('pomodoroSpotify');
        return {
            workInterval: config.get('workInterval', 25),
            shortBreakInterval: config.get('shortBreakInterval', 5),
            longBreakInterval: config.get('longBreakInterval', 15),
            longBreakAfter: config.get('longBreakAfter', 4)
        };
    }

    private saveState(): void {
        this.context.workspaceState.update('pomodoroState', {
            state: this.state,
            remainingTime: this.remainingTime,
            completedIntervals: this.completedIntervals,
            timestamp: Date.now()
        });
    }

    private loadState(): void {
        const savedState = this.context.workspaceState.get('pomodoroState') as any;
        if (savedState) {
            this.state = savedState.state || TimerState.Stopped;
            this.completedIntervals = savedState.completedIntervals || 0;
            
            // Handle time calculation for sessions that were interrupted
            const timeSinceLastSave = Math.floor((Date.now() - (savedState.timestamp || 0)) / 1000);
            const savedRemainingTime = savedState.remainingTime || 0;
            
            if (this.state !== TimerState.Stopped && savedRemainingTime > 0) {
                this.remainingTime = Math.max(0, savedRemainingTime - timeSinceLastSave);
                if (this.remainingTime <= 0) {
                    // Timer would have completed while VSCode was closed
                    this.state = TimerState.Stopped;
                    this.remainingTime = 0;
                }
            } else {
                this.remainingTime = 0;
            }
        }
    }

    public dispose(): void {
        if (this.timer) {
            clearInterval(this.timer);
        }
        this.onStateChange.dispose();
        this.onTimeChange.dispose();
    }
}