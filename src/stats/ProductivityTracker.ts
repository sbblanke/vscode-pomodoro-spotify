import * as vscode from 'vscode';

export interface SessionStats {
    date: string;
    completedWorkIntervals: number;
    totalWorkTime: number; // in minutes
    totalBreakTime: number; // in minutes
    skippedIntervals: number;
    sessionStartTime?: Date;
    sessionEndTime?: Date;
}

export interface ProductivityStats {
    allTime: {
        totalSessions: number;
        totalWorkTime: number;
        totalBreakTime: number;
        averageSessionLength: number;
        completionRate: number;
    };
    daily: SessionStats[];
    weekly: {
        weekOf: string;
        sessions: number;
        workTime: number;
        completionRate: number;
    }[];
}

export class ProductivityTracker {
    private context: vscode.ExtensionContext;
    private currentSession: SessionStats | null = null;
    private readonly STORAGE_KEY = 'pomodoroProductivityStats';

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    public startSession(): void {
        const today = new Date().toDateString();
        this.currentSession = {
            date: today,
            completedWorkIntervals: 0,
            totalWorkTime: 0,
            totalBreakTime: 0,
            skippedIntervals: 0,
            sessionStartTime: new Date()
        };
    }

    public endSession(): void {
        if (this.currentSession) {
            this.currentSession.sessionEndTime = new Date();
            this.saveSession(this.currentSession);
            this.currentSession = null;
        }
    }

    public recordCompletedWorkInterval(durationMinutes: number): void {
        if (this.currentSession) {
            this.currentSession.completedWorkIntervals++;
            this.currentSession.totalWorkTime += durationMinutes;
        }
    }

    public recordCompletedBreakInterval(durationMinutes: number): void {
        if (this.currentSession) {
            this.currentSession.totalBreakTime += durationMinutes;
        }
    }

    public recordSkippedInterval(): void {
        if (this.currentSession) {
            this.currentSession.skippedIntervals++;
        }
    }

    private async saveSession(session: SessionStats): Promise<void> {
        const existingStats = await this.getAllStats();
        
        // Find or create today's entry
        const existingTodayIndex = existingStats.daily.findIndex(s => s.date === session.date);
        
        if (existingTodayIndex >= 0) {
            // Merge with existing day's stats
            const existing = existingStats.daily[existingTodayIndex];
            existing.completedWorkIntervals += session.completedWorkIntervals;
            existing.totalWorkTime += session.totalWorkTime;
            existing.totalBreakTime += session.totalBreakTime;
            existing.skippedIntervals += session.skippedIntervals;
            existing.sessionEndTime = session.sessionEndTime;
        } else {
            // Add new day
            existingStats.daily.push(session);
        }

        // Keep only last 90 days
        existingStats.daily = existingStats.daily
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 90);

        await this.context.globalState.update(this.STORAGE_KEY, existingStats);
    }

    public async getAllStats(): Promise<ProductivityStats> {
        const stored = this.context.globalState.get<ProductivityStats>(this.STORAGE_KEY);
        
        if (!stored) {
            return {
                allTime: {
                    totalSessions: 0,
                    totalWorkTime: 0,
                    totalBreakTime: 0,
                    averageSessionLength: 0,
                    completionRate: 0
                },
                daily: [],
                weekly: []
            };
        }

        // Calculate all-time stats
        const allTime = this.calculateAllTimeStats(stored.daily);
        const weekly = this.calculateWeeklyStats(stored.daily);

        return {
            allTime,
            daily: stored.daily,
            weekly
        };
    }

    private calculateAllTimeStats(dailyStats: SessionStats[]): ProductivityStats['allTime'] {
        if (dailyStats.length === 0) {
            return {
                totalSessions: 0,
                totalWorkTime: 0,
                totalBreakTime: 0,
                averageSessionLength: 0,
                completionRate: 0
            };
        }

        const totalSessions = dailyStats.length;
        const totalWorkTime = dailyStats.reduce((sum, day) => sum + day.totalWorkTime, 0);
        const totalBreakTime = dailyStats.reduce((sum, day) => sum + day.totalBreakTime, 0);
        const totalIntervals = dailyStats.reduce((sum, day) => sum + day.completedWorkIntervals, 0);
        const totalSkipped = dailyStats.reduce((sum, day) => sum + day.skippedIntervals, 0);

        const averageSessionLength = totalSessions > 0 ? (totalWorkTime + totalBreakTime) / totalSessions : 0;
        const completionRate = (totalIntervals + totalSkipped) > 0 ? 
            (totalIntervals / (totalIntervals + totalSkipped)) * 100 : 0;

        return {
            totalSessions,
            totalWorkTime,
            totalBreakTime,
            averageSessionLength,
            completionRate
        };
    }

    private calculateWeeklyStats(dailyStats: SessionStats[]): ProductivityStats['weekly'] {
        const weeklyMap = new Map<string, {sessions: number, workTime: number, intervals: number, skipped: number}>();

        dailyStats.forEach(day => {
            const date = new Date(day.date);
            const weekStart = this.getWeekStart(date);
            const weekKey = weekStart.toDateString();

            if (!weeklyMap.has(weekKey)) {
                weeklyMap.set(weekKey, {sessions: 0, workTime: 0, intervals: 0, skipped: 0});
            }

            const week = weeklyMap.get(weekKey)!;
            week.sessions++;
            week.workTime += day.totalWorkTime;
            week.intervals += day.completedWorkIntervals;
            week.skipped += day.skippedIntervals;
        });

        return Array.from(weeklyMap.entries()).map(([weekOf, data]) => ({
            weekOf,
            sessions: data.sessions,
            workTime: data.workTime,
            completionRate: (data.intervals + data.skipped) > 0 ? 
                (data.intervals / (data.intervals + data.skipped)) * 100 : 0
        })).sort((a, b) => new Date(b.weekOf).getTime() - new Date(a.weekOf).getTime());
    }

    private getWeekStart(date: Date): Date {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day;
        return new Date(d.setDate(diff));
    }

    public async getStatsCommand(): Promise<void> {
        const stats = await this.getAllStats();
        
        const message = this.formatStatsMessage(stats);
        const action = await vscode.window.showInformationMessage(
            message,
            { modal: true },
            'Export Data',
            'Reset Stats'
        );

        if (action === 'Export Data') {
            await this.exportStats(stats);
        } else if (action === 'Reset Stats') {
            await this.resetStats();
        }
    }

    private formatStatsMessage(stats: ProductivityStats): string {
        const { allTime } = stats;
        const hoursWorked = Math.floor(allTime.totalWorkTime / 60);
        const minutesWorked = allTime.totalWorkTime % 60;

        return `🍅 **Productivity Statistics**

**All Time:**
• Sessions: ${allTime.totalSessions}
• Work Time: ${hoursWorked}h ${minutesWorked}m
• Avg Session: ${allTime.averageSessionLength.toFixed(1)} min
• Completion Rate: ${allTime.completionRate.toFixed(1)}%

**This Week:**
${stats.weekly[0] ? `• Sessions: ${stats.weekly[0].sessions}
• Work Time: ${Math.floor(stats.weekly[0].workTime / 60)}h ${stats.weekly[0].workTime % 60}m
• Completion Rate: ${stats.weekly[0].completionRate.toFixed(1)}%` : 'No data yet'}

**Recent Daily Average:**
${stats.daily.length > 0 ? `• ${(stats.daily.slice(0, 7).reduce((sum, day) => sum + day.completedWorkIntervals, 0) / Math.min(7, stats.daily.length)).toFixed(1)} intervals per day` : 'No data yet'}`;
    }

    private async exportStats(stats: ProductivityStats): Promise<void> {
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file('pomodoro-stats.json'),
            filters: {
                'JSON': ['json'],
                'CSV': ['csv']
            }
        });

        if (uri) {
            const content = uri.fsPath.endsWith('.csv') ? 
                this.statsToCSV(stats) : 
                JSON.stringify(stats, null, 2);
            
            await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
            vscode.window.showInformationMessage(`Stats exported to ${uri.fsPath}`);
        }
    }

    private statsToCSV(stats: ProductivityStats): string {
        const headers = ['Date', 'Work_Intervals', 'Work_Time_Min', 'Break_Time_Min', 'Skipped'];
        const rows = stats.daily.map(day => 
            [day.date, day.completedWorkIntervals, day.totalWorkTime, day.totalBreakTime, day.skippedIntervals].join(',')
        );
        return [headers.join(','), ...rows].join('\n');
    }

    private async resetStats(): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            'This will permanently delete all productivity statistics. Are you sure?',
            { modal: true },
            'Delete All Stats'
        );

        if (confirm) {
            await this.context.globalState.update(this.STORAGE_KEY, undefined);
            vscode.window.showInformationMessage('Productivity statistics reset successfully.');
        }
    }
}