import * as vscode from 'vscode';

export enum SoundTrigger {
    WorkStart = 'workStart',
    BreakStart = 'breakStart',
    LongBreakStart = 'longBreakStart',
    WorkEnd = 'workEnd',
    BreakEnd = 'breakEnd',
    Minute60Warning = '60minWarning',
    Minute30Warning = '30minWarning',
    Minute5Warning = '5minWarning',
    Minute1Warning = '1minWarning',
    SessionComplete = 'sessionComplete',
    TimerPause = 'timerPause',
    TimerResume = 'timerResume'
}

export interface SoundConfig {
    enabled: boolean;
    soundFile: string;
    volume: number;
}

export class SoundManager {
    private soundFiles: Map<string, ArrayBuffer> = new Map();

    constructor(_context: vscode.ExtensionContext) {
        this.loadDefaultSounds();
    }

    private async loadDefaultSounds(): Promise<void> {
        // Load default sound files from the extension's assets
        try {
            // For now, we'll use system notification sounds
            // In a full implementation, we would bundle actual sound files
            // Sound system initialized with system sounds
        } catch (error) {
            console.error('Error loading default sounds:', error);
        }
    }

    public async playSound(trigger: SoundTrigger): Promise<void> {
        const config = this.getSoundConfig(trigger);
        
        if (!config.enabled) {
            return;
        }

        try {
            // For now, we'll use the system notification sound
            // In a production version, we would play custom audio files
            await this.playSystemNotificationSound();
            
        } catch (error) {
            console.error(`Error playing sound for ${trigger}:`, error);
        }
    }

    private async playSystemNotificationSound(): Promise<void> {
        // Use VS Code's built-in notification system which plays system sounds
        // This is a fallback until custom audio files are implemented
        return Promise.resolve();
    }

    private getSoundConfig(trigger: SoundTrigger): SoundConfig {
        const config = vscode.workspace.getConfiguration('pomodoroSpotify.sounds');
        
        return {
            enabled: config.get(`${trigger}.enabled`, true),
            soundFile: config.get(`${trigger}.soundFile`, 'default'),
            volume: config.get(`${trigger}.volume`, 0.7)
        };
    }

    public getSoundTriggers(): { trigger: SoundTrigger; label: string; description: string }[] {
        return [
            {
                trigger: SoundTrigger.WorkStart,
                label: 'Work Session Start',
                description: 'When a work interval begins'
            },
            {
                trigger: SoundTrigger.BreakStart,
                label: 'Break Start',
                description: 'When a short break begins'
            },
            {
                trigger: SoundTrigger.LongBreakStart,
                label: 'Long Break Start',
                description: 'When a long break begins'
            },
            {
                trigger: SoundTrigger.WorkEnd,
                label: 'Work Session End',
                description: 'When a work interval completes'
            },
            {
                trigger: SoundTrigger.BreakEnd,
                label: 'Break End',
                description: 'When a break interval completes'
            },
            {
                trigger: SoundTrigger.Minute5Warning,
                label: '5 Minute Warning',
                description: '5 minutes before interval ends'
            },
            {
                trigger: SoundTrigger.Minute1Warning,
                label: '1 Minute Warning',
                description: '1 minute before interval ends'
            },
            {
                trigger: SoundTrigger.SessionComplete,
                label: 'Session Complete',
                description: 'When a full pomodoro cycle completes'
            },
            {
                trigger: SoundTrigger.TimerPause,
                label: 'Timer Paused',
                description: 'When timer is paused'
            },
            {
                trigger: SoundTrigger.TimerResume,
                label: 'Timer Resumed',
                description: 'When timer is resumed'
            }
        ];
    }

    public async configureSounds(): Promise<void> {
        const triggers = this.getSoundTriggers();
        
        const quickPick = vscode.window.createQuickPick();
        quickPick.title = 'Configure Notification Sounds';
        quickPick.placeholder = 'Select a sound trigger to configure';
        
        interface SoundItem extends vscode.QuickPickItem {
            trigger: SoundTrigger;
        }
        
        quickPick.items = triggers.map(t => {
            const config = this.getSoundConfig(t.trigger);
            return {
                label: `$(${config.enabled ? 'unmute' : 'mute'}) ${t.label}`,
                description: config.enabled ? 'Enabled' : 'Disabled',
                detail: t.description,
                trigger: t.trigger
            };
        });
        
        quickPick.onDidChangeSelection(async ([selection]) => {
            if (!selection) return;
            
            const item = selection as SoundItem;
            quickPick.hide();
            
            await this.configureSoundTrigger(item.trigger);
        });
        
        quickPick.show();
    }

    private async configureSoundTrigger(trigger: SoundTrigger): Promise<void> {
        const config = this.getSoundConfig(trigger);
        const triggerInfo = this.getSoundTriggers().find(t => t.trigger === trigger);
        
        if (!triggerInfo) return;
        
        const choice = await vscode.window.showQuickPick([
            {
                label: config.enabled ? '$(mute) Disable' : '$(unmute) Enable',
                value: 'toggle'
            },
            {
                label: '$(play) Test Sound',
                value: 'test'
            },
            {
                label: '$(settings-gear) Volume Settings',
                value: 'volume'
            }
        ], {
            title: `Configure ${triggerInfo.label}`,
            placeHolder: `Current: ${config.enabled ? 'Enabled' : 'Disabled'} | Volume: ${Math.round(config.volume * 100)}%`
        });
        
        switch (choice?.value) {
            case 'toggle':
                await this.toggleSoundTrigger(trigger);
                break;
            case 'test':
                await this.playSound(trigger);
                vscode.window.showInformationMessage(`Played test sound for ${triggerInfo.label}`);
                break;
            case 'volume':
                await this.configureVolume(trigger);
                break;
        }
    }

    private async toggleSoundTrigger(trigger: SoundTrigger): Promise<void> {
        const config = vscode.workspace.getConfiguration('pomodoroSpotify.sounds');
        const currentEnabled = config.get(`${trigger}.enabled`, true);
        
        await config.update(`${trigger}.enabled`, !currentEnabled, vscode.ConfigurationTarget.Global);
        
        const triggerInfo = this.getSoundTriggers().find(t => t.trigger === trigger);
        vscode.window.showInformationMessage(
            `${triggerInfo?.label} sound ${!currentEnabled ? 'enabled' : 'disabled'}`
        );
    }

    private async configureVolume(trigger: SoundTrigger): Promise<void> {
        const config = vscode.workspace.getConfiguration('pomodoroSpotify.sounds');
        const currentVolume = config.get(`${trigger}.volume`, 0.7);
        
        const volumeInput = await vscode.window.showInputBox({
            prompt: 'Set volume (0-100)',
            value: Math.round(currentVolume * 100).toString(),
            validateInput: (value) => {
                const num = parseInt(value);
                if (isNaN(num) || num < 0 || num > 100) {
                    return 'Please enter a number between 0 and 100';
                }
                return undefined;
            }
        });
        
        if (volumeInput) {
            const newVolume = parseInt(volumeInput) / 100;
            await config.update(`${trigger}.volume`, newVolume, vscode.ConfigurationTarget.Global);
            
            const triggerInfo = this.getSoundTriggers().find(t => t.trigger === trigger);
            vscode.window.showInformationMessage(`${triggerInfo?.label} volume set to ${volumeInput}%`);
        }
    }

    public shouldPlayWarningSound(remainingTime: number, trigger: SoundTrigger): boolean {
        const config = this.getSoundConfig(trigger);
        
        if (!config.enabled) {
            return false;
        }
        
        switch (trigger) {
            case SoundTrigger.Minute5Warning:
                return remainingTime === 300; // 5 minutes
            case SoundTrigger.Minute1Warning:
                return remainingTime === 60; // 1 minute
            default:
                return false;
        }
    }

    public dispose(): void {
        // Cleanup resources
        this.soundFiles.clear();
    }
}