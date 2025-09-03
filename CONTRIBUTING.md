# Contributing to VSCode Pomodoro Spotify

Thank you for your interest in contributing! We welcome contributions from the community.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally
3. **Install dependencies**: `npm install`
4. **Compile the extension**: `npm run compile`
5. **Open in VS Code** and press `F5` to launch the Extension Development Host

## Development Setup

For detailed development setup instructions, including Spotify API configuration, see `DEVELOPER_SETUP.md`.

## How to Contribute

### Reporting Issues
- Check existing [issues](https://github.com/sbblanke/vscode-pomodoro-spotify/issues) first
- Use the issue templates when available
- Include VS Code version, extension version, and steps to reproduce

### Suggesting Features
- Search existing [discussions](https://github.com/sbblanke/vscode-pomodoro-spotify/discussions) and issues
- Use the feature request template
- Describe the problem you're solving and your proposed solution

### Code Contributions

1. **Create a branch** for your feature/fix
2. **Make your changes** following the existing code style
3. **Test thoroughly** with different scenarios
4. **Update documentation** as needed
5. **Submit a pull request** with a clear description

### Code Style

- Follow TypeScript best practices
- Use existing error handling patterns
- Avoid `console.log` statements (use proper error handling)
- Write clear, descriptive commit messages
- Update comments and documentation

## Testing

- Test with both Free and Premium Spotify accounts
- Test authentication flow end-to-end
- Verify timer functionality across different scenarios
- Test with and without active Spotify sessions

## Security

- Never commit API keys or sensitive credentials
- Follow OAuth 2.0 best practices
- Report security issues privately via email

## Questions?

Feel free to [open a discussion](https://github.com/sbblanke/vscode-pomodoro-spotify/discussions) if you have questions about contributing.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.