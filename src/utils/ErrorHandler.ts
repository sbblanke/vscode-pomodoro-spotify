import * as vscode from 'vscode';

export enum ErrorType {
    SpotifyAuth = 'spotify_auth',
    SpotifyAPI = 'spotify_api',
    Network = 'network',
    Configuration = 'configuration',
    Timer = 'timer',
    General = 'general'
}

export interface ExtensionError {
    type: ErrorType;
    message: string;
    originalError?: Error;
    recoverable: boolean;
    recoveryAction?: () => Promise<void>;
}

export class ErrorHandler {
    private static readonly ERROR_LOG_KEY = 'pomodoroErrorLog';
    private static context: vscode.ExtensionContext;

    public static initialize(context: vscode.ExtensionContext): void {
        this.context = context;
    }

    public static async handleError(error: ExtensionError): Promise<void> {
        console.error(`[${error.type}] ${error.message}`, error.originalError);
        
        // Log error for troubleshooting
        await this.logError(error);
        
        // Show appropriate user message
        if (error.recoverable) {
            await this.showRecoverableError(error);
        } else {
            await this.showCriticalError(error);
        }
    }

    public static createSpotifyAuthError(originalError: Error): ExtensionError {
        return {
            type: ErrorType.SpotifyAuth,
            message: 'Spotify authentication failed. Your session may have expired.',
            originalError,
            recoverable: true,
            recoveryAction: async () => {
                await vscode.commands.executeCommand('pomodoro-spotify.authenticateSpotify');
            }
        };
    }

    public static createSpotifyAPIError(originalError: Error, action: string): ExtensionError {
        return {
            type: ErrorType.SpotifyAPI,
            message: `Spotify API error during ${action}. Check your internet connection and Spotify account status.`,
            originalError,
            recoverable: true,
            recoveryAction: async () => {
                const choice = await vscode.window.showWarningMessage(
                    'Spotify connection lost. Timer will continue without music.',
                    'Retry Connection',
                    'Continue Without Music'
                );
                if (choice === 'Retry Connection') {
                    await vscode.commands.executeCommand('pomodoro-spotify.authenticateSpotify');
                }
            }
        };
    }

    public static createNetworkError(originalError: Error): ExtensionError {
        return {
            type: ErrorType.Network,
            message: 'Network connectivity issue detected. Timer continues normally.',
            originalError,
            recoverable: true,
            recoveryAction: undefined // No recovery action needed
        };
    }

    public static createConfigurationError(setting: string): ExtensionError {
        return {
            type: ErrorType.Configuration,
            message: `Configuration error: Invalid or missing ${setting} setting.`,
            recoverable: true,
            recoveryAction: async () => {
                await vscode.commands.executeCommand('pomodoro-spotify.configureSettings');
            }
        };
    }

    public static createTimerError(originalError: Error): ExtensionError {
        return {
            type: ErrorType.Timer,
            message: 'Timer system error occurred.',
            originalError,
            recoverable: true,
            recoveryAction: async () => {
                await vscode.commands.executeCommand('pomodoro-spotify.resetTimer');
            }
        };
    }

    private static async showRecoverableError(error: ExtensionError): Promise<void> {
        // For network errors, just show a brief notification without blocking
        if (error.type === ErrorType.Network) {
            // Show a brief, non-intrusive message
            vscode.window.showInformationMessage(error.message, {modal: false});
            return;
        }

        // For other recoverable errors, show options
        let message = error.message;
        const actions: string[] = [];

        if (error.recoveryAction) {
            actions.push('Retry');
        }
        actions.push('Continue');

        const choice = await vscode.window.showWarningMessage(message, ...actions);

        switch (choice) {
            case 'Retry':
                if (error.recoveryAction) {
                    try {
                        await error.recoveryAction();
                    } catch (recoveryError) {
                        console.error('Recovery action failed:', recoveryError);
                        vscode.window.showErrorMessage('Recovery failed. Extension will continue without this feature.');
                    }
                }
                break;
            case 'Continue':
            default:
                // User chose to continue, no action needed
                break;
        }
    }

    private static async showCriticalError(error: ExtensionError): Promise<void> {
        const choice = await vscode.window.showErrorMessage(
            `Critical error: ${error.message}`,
            'Report Issue',
            'Restart Extension'
        );

        switch (choice) {
            case 'Report Issue':
                this.showReportIssueDialog(error);
                break;
            case 'Restart Extension':
                await vscode.commands.executeCommand('workbench.action.reloadWindow');
                break;
        }
    }

    private static showReportIssueDialog(error: ExtensionError): void {        
        vscode.window.showInformationMessage(
            `Error details logged for troubleshooting:\n\nType: ${error.type}\nMessage: ${error.message}\n\nCheck Developer Tools console for more details.`,
            {modal: true}
        );
    }


    private static async logError(error: ExtensionError): Promise<void> {
        if (!this.context) return;

        const errorLog = this.context.globalState.get<Array<{timestamp: string, error: ExtensionError}>>(this.ERROR_LOG_KEY, []);
        
        errorLog.push({
            timestamp: new Date().toISOString(),
            error: {
                ...error,
                originalError: error.originalError ? {
                    name: error.originalError.name,
                    message: error.originalError.message,
                    stack: error.originalError.stack
                } as any : undefined
            }
        });

        // Keep only last 50 errors
        const recentErrors = errorLog.slice(-50);
        await this.context.globalState.update(this.ERROR_LOG_KEY, recentErrors);
    }

    public static async getErrorHistory(): Promise<Array<{timestamp: string, error: ExtensionError}>> {
        if (!this.context) return [];
        return this.context.globalState.get<Array<{timestamp: string, error: ExtensionError}>>(this.ERROR_LOG_KEY, []);
    }

    public static async clearErrorHistory(): Promise<void> {
        if (!this.context) return;
        await this.context.globalState.update(this.ERROR_LOG_KEY, []);
    }

    public static isNetworkError(error: Error): boolean {
        const networkErrorMessages = [
            'ENOTFOUND',
            'ECONNREFUSED',
            'ECONNRESET',
            'ETIMEDOUT',
            'Network request failed'
        ];
        
        return networkErrorMessages.some(msg => 
            error.message?.includes(msg) || error.name?.includes(msg)
        );
    }

    public static isSpotifyAuthError(error: Error): boolean {
        const authErrorMessages = [
            'Invalid access token',
            'Token expired',
            'Authentication required',
            'Unauthorized',
            'invalid_grant'
        ];
        
        return authErrorMessages.some(msg => 
            error.message?.includes(msg)
        );
    }

    public static async withErrorHandling<T>(
        operation: () => Promise<T>,
        errorType: ErrorType,
        context: string
    ): Promise<T | null> {
        try {
            return await operation();
        } catch (error) {
            let extensionError: ExtensionError;

            if (error instanceof Error) {
                if (this.isNetworkError(error)) {
                    extensionError = this.createNetworkError(error);
                } else if (errorType === ErrorType.SpotifyAPI && this.isSpotifyAuthError(error)) {
                    extensionError = this.createSpotifyAuthError(error);
                } else {
                    switch (errorType) {
                        case ErrorType.SpotifyAuth:
                            extensionError = this.createSpotifyAuthError(error);
                            break;
                        case ErrorType.SpotifyAPI:
                            extensionError = this.createSpotifyAPIError(error, context);
                            break;
                        case ErrorType.Timer:
                            extensionError = this.createTimerError(error);
                            break;
                        default:
                            extensionError = {
                                type: errorType,
                                message: `Error in ${context}: ${error.message}`,
                                originalError: error,
                                recoverable: true
                            };
                    }
                }
            } else {
                extensionError = {
                    type: errorType,
                    message: `Unknown error in ${context}`,
                    recoverable: false
                };
            }

            await this.handleError(extensionError);
            return null;
        }
    }
}