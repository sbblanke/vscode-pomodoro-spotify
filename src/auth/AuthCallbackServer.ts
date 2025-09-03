import * as http from 'http';
import * as url from 'url';
import * as vscode from 'vscode';

export class AuthCallbackServer {
    private server: http.Server | null = null;
    private readonly port: number = 3000; // Fixed port to match Spotify app configuration

    constructor() {
        // HTML content is embedded to avoid file path issues
    }

    public async startServer(): Promise<number> {
        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                if (!req.url) {
                    this.sendErrorResponse(res, 'Invalid request');
                    return;
                }

                const parsedUrl = url.parse(req.url, true);
                
                if (parsedUrl.pathname === '/callback') {
                    this.handleCallback(req, res, parsedUrl.query);
                } else {
                    this.send404Response(res);
                }
            });

            this.server.on('error', (error: any) => {
                if (error.code === 'EADDRINUSE') {
                    reject(new Error(`Port ${this.port} is already in use. Please ensure no other application is using this port and try again.`));
                } else {
                    reject(error);
                }
            });

            this.server.listen(this.port, '127.0.0.1', () => {
                // Auth callback server started
                resolve(this.port);
            });
        });
    }

    private handleCallback(_req: http.IncomingMessage, res: http.ServerResponse, query: any): void {
        try {
            // Check for authorization code or error
            const code = query.code;
            const error = query.error;
            const state = query.state;

            if (code) {
                // Success case - show success page and redirect to VSCode
                const successPageContent = this.getSuccessPageHtml();
                res.writeHead(200, { 
                    'Content-Type': 'text/html',
                    'Cache-Control': 'no-cache'
                });
                res.end(successPageContent);

                // After a delay, trigger the VSCode URI handler
                setTimeout(() => {
                    const vscodeUri = `vscode://sbblanke.vscode-pomodoro-spotify/auth-callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state || '')}`;
                    vscode.env.openExternal(vscode.Uri.parse(vscodeUri));
                }, 3000);

            } else if (error) {
                // Error case - show error page
                const errorPageContent = this.getErrorPageHtml(error);
                res.writeHead(200, { 
                    'Content-Type': 'text/html',
                    'Cache-Control': 'no-cache'
                });
                res.end(errorPageContent);
            } else {
                this.sendErrorResponse(res, 'Missing authorization code or error parameter');
            }
        } catch (err) {
            console.error('Error handling callback:', err);
            this.sendErrorResponse(res, 'Internal server error');
        }
    }

    private sendErrorResponse(res: http.ServerResponse, message: string): void {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end(`Error: ${message}`);
    }

    private send404Response(res: http.ServerResponse): void {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }

    public stopServer(): void {
        if (this.server) {
            this.server.close();
            this.server = null;
            // Auth callback server stopped
        }
    }

    public getCallbackUrl(): string {
        return `http://127.0.0.1:${this.port}/callback`;
    }

    private getSuccessPageHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Spotify Authorization - Success</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #1db954, #1ed760);
            color: white;
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            text-align: center;
        }
        .container {
            background: rgba(0, 0, 0, 0.1);
            backdrop-filter: blur(10px);
            padding: 3rem;
            border-radius: 20px;
            max-width: 500px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }
        .success-icon {
            font-size: 4rem;
            margin-bottom: 1rem;
            animation: bounce 1s ease-in-out;
        }
        h1 {
            margin: 1rem 0;
            font-size: 2rem;
            font-weight: 300;
        }
        p {
            font-size: 1.1rem;
            line-height: 1.6;
            margin: 1.5rem 0;
            opacity: 0.9;
        }
        .redirect-info {
            background: rgba(255, 255, 255, 0.1);
            padding: 1rem;
            border-radius: 10px;
            margin: 1.5rem 0;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .spinner {
            width: 20px;
            height: 20px;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-top: 2px solid white;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            display: inline-block;
            margin-right: 0.5rem;
        }
        @keyframes bounce {
            0%, 20%, 60%, 100% { transform: translateY(0); }
            40% { transform: translateY(-20px); }
            80% { transform: translateY(-10px); }
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .footer {
            margin-top: 2rem;
            font-size: 0.9rem;
            opacity: 0.7;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="success-icon">✅</div>
        <h1>Authorization Successful!</h1>
        <p>You have successfully authorized the VSCode Pomodoro Spotify extension to access your Spotify account.</p>
        
        <div class="redirect-info">
            <div class="spinner"></div>
            <strong>Redirecting to VS Code...</strong>
        </div>
        
        <p>If VS Code doesn't open automatically, please return to VS Code manually to continue. You can safely close this browser tab.</p>
        
        <div class="footer">
            VSCode Pomodoro Spotify Extension
        </div>
    </div>
</body>
</html>`;
    }

    private getErrorPageHtml(error: string): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Spotify Authorization - Error</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #dc2626, #ef4444);
            color: white;
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            text-align: center;
        }
        .container {
            background: rgba(0, 0, 0, 0.1);
            backdrop-filter: blur(10px);
            padding: 3rem;
            border-radius: 20px;
            max-width: 500px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }
        .error-icon {
            font-size: 4rem;
            margin-bottom: 1rem;
        }
        h1 {
            margin: 1rem 0;
            font-size: 2rem;
            font-weight: 300;
        }
        p {
            font-size: 1.1rem;
            line-height: 1.6;
            margin: 1.5rem 0;
            opacity: 0.9;
        }
        .error-info {
            background: rgba(255, 255, 255, 0.1);
            padding: 1rem;
            border-radius: 10px;
            margin: 1.5rem 0;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .footer {
            margin-top: 2rem;
            font-size: 0.9rem;
            opacity: 0.7;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="error-icon">❌</div>
        <h1>Authorization Failed</h1>
        <p>There was an error during the Spotify authorization process.</p>
        
        <div class="error-info">
            <strong>Error: ${error}</strong>
        </div>
        
        <p>Please return to VS Code and try the authorization process again. You can safely close this browser tab.</p>
        
        <div class="footer">
            VSCode Pomodoro Spotify Extension
        </div>
    </div>
</body>
</html>`;
    }
}