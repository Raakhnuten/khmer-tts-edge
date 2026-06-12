# Contributing to Khmer TTS

Thank you for your interest in contributing to Khmer TTS! This document provides guidelines for contributing to the project.

## Development Setup

### Prerequisites

- **Node.js** 18+ (recommended: use [nvm](https://github.com/nvm-sh/nvm))
- **FFmpeg** (required for audio processing)
- **Git**

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd text-to-speech
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create environment file (optional):
   ```bash
   cp .env.example .env
   ```

4. Start development server:
   ```bash
   npm run dev
   ```

## Project Structure

```
├── src/
│   ├── server.ts           # Express server with API endpoints
│   ├── generate.ts         # Core TTS generation engine
│   ├── subtitle.ts         # Subtitle audio processing
│   ├── voices.ts           # Voice validation and listing
│   ├── index.ts            # CLI entry point
│   └── utils/
│       └── asyncPool.ts    # Concurrent processing utilities
├── public/
│   ├── index.html          # Main TTS UI
│   └── subtitle-editor.html # Subtitle editor UI
├── input/                  # CLI input files
└── output/                 # Generated audio files
```

## Development Guidelines

### Code Style

- Use TypeScript strict mode
- Follow existing code formatting
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Keep functions small and focused

### Commit Messages

Follow conventional commits format:

```
type(scope): subject

body (optional)

footer (optional)
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Build process or tooling changes

Examples:
```
feat(tts): add support for voice speed adjustment
fix(subtitle): handle invalid SRT timing gracefully
docs(readme): update installation instructions
```

### Testing

Before submitting:

1. Run type check:
   ```bash
   npm run typecheck
   ```

2. Test the web interface:
   ```bash
   npm run serve
   ```
   Open http://localhost:3000 and test both UIs

3. Test CLI commands:
   ```bash
   npm run voices
   npm run generate
   ```

### Pull Request Process

1. Create a feature branch:
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. Make your changes with clear commits

3. Update documentation if needed (README, code comments)

4. Push and create a pull request with:
   - Clear title and description
   - Link to related issues
   - Screenshots for UI changes
   - List of breaking changes (if any)

## Areas for Contribution

### High Priority

- [ ] Add unit tests for core modules
- [ ] Improve error messages and user feedback
- [ ] Add support for more audio formats (WAV, OGG)
- [ ] Optimize memory usage for very long texts
- [ ] Add progress persistence for interrupted jobs

### Features

- [ ] Batch processing for multiple files
- [ ] Audio preview before full generation
- [ ] Custom voice parameters (speed, pitch, volume)
- [ ] Export to video with subtitles
- [ ] API rate limiting and authentication
- [ ] Docker support

### UI/UX

- [ ] Dark mode toggle
- [ ] Keyboard shortcuts documentation
- [ ] Mobile-responsive improvements
- [ ] Drag-and-drop file upload
- [ ] Real-time waveform visualization

### Documentation

- [ ] API documentation with examples
- [ ] Video tutorials
- [ ] Troubleshooting guide
- [ ] Performance optimization tips

## Bug Reports

When reporting bugs, include:

1. **Environment**: OS, Node.js version, FFmpeg version
2. **Steps to reproduce**: Detailed steps
3. **Expected behavior**: What should happen
4. **Actual behavior**: What actually happens
5. **Screenshots/logs**: If applicable
6. **Sample text**: If it's text-specific

## Feature Requests

For feature requests:

1. **Use case**: Why do you need this feature?
2. **Proposed solution**: How would it work?
3. **Alternatives**: Have you considered other approaches?
4. **Examples**: Similar features in other tools

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on constructive feedback
- Respect different viewpoints and experiences

## Questions?

- Open a [GitHub Issue](../../issues) for questions
- Check existing issues and discussions first

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (MIT).

---

Thank you for contributing! 🙏
