# Khmer Text-to-Speech

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Convert Khmer text to natural-sounding speech using **Microsoft Edge TTS** (free, online). Features a web interface, CLI tools, and a subtitle audio editor.

**🎯 Key Features:**
- 🗣️ Two Khmer voices (male & female)
- 🌐 Web interface with real-time progress
- 🎬 Subtitle audio editor with timing synchronization
- 📝 Support for long text (up to 100,000 characters)
- ⚡ Concurrent processing for speed
- 🔄 Auto-resume for interrupted sessions
- 🎵 High-quality MP3 output (24kHz, 96kbps)

## 📋 Table of Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Web Interface](#web-interface)
- [CLI Usage](#cli-usage)
- [Subtitle Editor](#subtitle-editor)
- [API Documentation](#api-documentation)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

## 🔧 Requirements

- **Node.js** 18+
- **FFmpeg** (for merging audio chunks)

### Installing FFmpeg on Windows

1. Download from https://ffmpeg.org/download.html (select "Windows builds from gyan.dev")
2. Extract the zip (e.g. to `C:\ffmpeg`)
3. Add `C:\ffmpeg\bin` to your **System PATH**:
   - Open **System Properties** → **Advanced** → **Environment Variables**
   - Under "System variables", find `Path`, click **Edit** → **New**
   - Add `C:\ffmpeg\bin`
   - Click OK, restart any open terminals
4. Verify: open a new terminal and run `ffmpeg -version`

## 📦 Installation

```bash
npm install
```

## ⚙️ Configuration

Create a `.env` file (optional):

```bash
cp .env.example .env
```

Available environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `TTS_CONCURRENCY` | 3 | Concurrent TTS requests (1-5) |
| `OUTPUT_DIR` | output | Output directory path |

## 🚀 Quick Start

### Web Interface (Recommended)

1. Start the server:
   ```bash
   npm run serve
   ```

2. Open http://localhost:3000

3. Paste Khmer text and generate audio!

### CLI Quick Example

1. Create your text file:
   ```bash
   echo "សួស្តី! នេះជាការសាកល្បង។" > input/text.txt
   ```

2. Generate audio:
   ```bash
   npm run generate
   ```

3. Find your audio: `output/output.mp3`

## 🌐 Web Interface

The web interface supports both short (≤5,000 characters) and long text generation.

### Features:
- **Direct generation** for short text (instant playback)
- **Background jobs** for long text (with progress tracking)
- **Voice selection**: Piseth (male) or Sreymom (female)
- **Audio preview** and download
- **Character counter** with mode indicator
- **Sample text** for testing

### Screenshots

Main interface with voice selection and progress tracking:

```
┌─────────────────────────────────────┐
│ Khmer TTS — បម្លែងអក្សរជាសំឡេង      │
├─────────────────────────────────────┤
│ [Khmer text input area]             │
│                      5,234 characters│
│ [Load sample] [Clear]               │
├─────────────────────────────────────┤
│ Voice:                              │
│ [Piseth ✓] [Sreymom]                │
├─────────────────────────────────────┤
│ [Generate Audio]                    │
│                                     │
│ Processing chunk 45 of 100...       │
│ ████████████░░░░░░░░░░░ 45%        │
└─────────────────────────────────────┘
```

## 💻 CLI Usage

### List Available Voices

```bash
npm run voices
```

Output:
```
Name                                          Locale       Gender     Local Name
--------------------------------------------------------------------------------------
km-KH-PisethNeural                            km-KH        Male       ពិសិដ្ឋ
km-KH-SreymomNeural                           km-KH        Female     ស្រីមុំ

Total: 2 Khmer voice(s)
```

### Generate Audio from File

1. Create or edit `input/text.txt` with your Khmer text
2. Run generation:

```bash
# Use default voice (Piseth - male)
npm run generate

# Use specific voice (Sreymom - female)
npm run generate -- --voice km-KH-SreymomNeural
```

3. Output saved to: `output/output.mp3`

### Resume Interrupted Sessions

The CLI automatically resumes from the last successful chunk if interrupted:

```bash
# First run (interrupted at chunk 45/100)
npm run generate

# Re-run same command - skips chunks 1-45, continues from 46
npm run generate
```

## Long Audio (100,000 characters max)

The app handles long text by:

1. **Splitting by Khmer sentence endings** (។ ៕ ៖) and newlines
2. **Generating each chunk** via Edge TTS with retry (3 attempts, exponential backoff)
3. **Inserting 300ms silence** between chunks for natural pacing
4. **Merging with FFmpeg** (lossless concat, no re-encode)

Progress is tracked via the web UI's job system (`POST /api/jobs`, `GET /api/jobs/:id`).

### Time estimates (approx)

| Text length | Chunks (~1000 chars) | Generation time |
|---|---|---|
| 5,000 chars | ~5 | 30–60s |
| 10,000 chars | ~10 | 1–2 min |
| 50,000 chars | ~50 | 5–10 min |
| 100,000 chars | ~100 | 10–20 min |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/voices` | List available Khmer voices |
| `POST` | `/api/generate` | Direct generate (short text only, ≤5000 chars) |
| `POST` | `/api/jobs` | Create a long-audio job |
| `GET` | `/api/jobs/:id` | Poll job status |
| `GET` | `/api/download/:id` | Download completed audio |

### POST /api/generate

```json
{ "text": "សួស្តី!", "voice": "km-KH-PisethNeural" }
```
Returns `audio/mpeg` binary.

### POST /api/jobs

```json
{ "text": "...long khmer text...", "voice": "km-KH-SreymomNeural" }
```
Response: `{ "id": "uuid" }`

### GET /api/jobs/:id

Response:
```json
{
  "id": "uuid",
  "status": "processing",
  "progress": 45,
  "currentChunk": 5,
  "totalChunks": 11,
  "error": null,
  "createdAt": "..."
}
```

## Validation

- Text must contain at least one Khmer character (U+1780–U+17FF)
- Empty text is rejected
- Maximum 100,000 characters
- Only `km-KH-PisethNeural` and `km-KH-SreymomNeural` voices accepted

## Project Structure

```
├── input/text.txt              CLI input file
├── output/
│   ├── tmp/                    Temp files for direct generation
│   ├── jobs/                   TTS job output directories
│   └── subtitle-jobs/          Subtitle job output
│       └── <jobId>/
│           ├── metadata.json
│           ├── segments/       Raw Edge TTS output
│           ├── adjusted/       Speed-adjusted MP3s
│           └── final.mp3       Exported merged audio
├── public/
│   ├── index.html              Simple TTS UI
│   └── subtitle-editor.html    Subtitle editor UI
├── src/
│   ├── index.ts                CLI entry point
│   ├── server.ts               Express server + TTS + subtitle API
│   ├── generate.ts             Core TTS engine (chunk, synthesize, merge)
│   ├── subtitle.ts             Subtitle engine (SRT, segments, atempo, export)
│   └── voices.ts               Voice listing + validation
├── package.json
└── tsconfig.json
```

## 📡 API Documentation

### REST API Endpoints

#### GET `/api/voices`
List available Khmer voices.

**Response:**
```json
[
  {
    "name": "km-KH-PisethNeural",
    "locale": "km-KH",
    "gender": "Male",
    "localName": "ពិសិដ្ឋ"
  }
]
```

#### POST `/api/generate`
Generate audio directly (for short text ≤5,000 characters).

**Request:**
```json
{
  "text": "សួស្តី!",
  "voice": "km-KH-PisethNeural"
}
```

**Response:** Binary MP3 audio stream

**Errors:**
- `400`: Invalid text or voice
- `500`: Generation failed

#### POST `/api/jobs`
Create a background job for long text.

**Request:**
```json
{
  "text": "...long text...",
  "voice": "km-KH-SreymomNeural"
}
```

**Response:**
```json
{
  "id": "uuid-job-id"
}
```

#### GET `/api/jobs/:id`
Poll job status and progress.

**Response:**
```json
{
  "id": "uuid",
  "status": "processing",
  "progress": 45,
  "currentChunk": 45,
  "totalChunks": 100,
  "error": null,
  "createdAt": "2026-06-07T15:10:00.000Z"
}
```

Status values: `pending`, `processing`, `completed`, `failed`

#### GET `/api/download/:id`
Download completed job audio.

**Response:** Binary MP3 file (attachment)

### Subtitle API

See [Subtitle Editor](#subtitle-editor) section for subtitle-specific endpoints.

## 🎬 Subtitle Editor

The subtitle editor lets you import SRT files, assign voices per subtitle segment, generate audio, adjust speed to fit timing, preview, and export a final merged MP3.

### Access

Open `http://localhost:3000/subtitle-editor.html`, or click **Subtitle Editor** from the main TTS page.

### How to Import an SRT

1. Click **Choose .srt file** or paste SRT text into the text area
2. Click **Import** — parsed segments appear in the table
3. SRT format: standard `HH:MM:SS,mmm --> HH:MM:SS,mmm` with Khmer text

Example SRT:
```
1
00:00:01,500 --> 00:00:04,000
សួស្តី! ស្វាគមន៍

2
00:00:05,000 --> 00:00:08,500
នេះជាឧទាហរណ៍នៃការប្រើប្រាស់
```

### How to Edit Khmer Subtitles

- Click any text cell to edit the Khmer text inline
- Text is validated for Khmer characters (U+1780–U+17FF)
- Invalid text shows a red border
- Use the voice dropdown per row to pick Male (Piseth) or Female (Sreymom)
- **All Male** / **All Female** buttons set every row at once
- Checkboxes select which rows to process

### How to Generate Selected Audio

1. Check the rows you want to generate (default: all)
2. Click **Generate Selected Audio**
3. Each segment is generated via Edge TTS, then speed-adjusted (FFmpeg atempo) to fit the subtitle duration slot
4. Progress is shown per row: `pending → generating → completed` or `failed`
5. Failed rows show a red badge; re-select and click Generate to retry
6. Completed rows show the speed ratio (e.g. `1.5x`) if audio was adjusted

### Speed / Duration Matching

If the generated audio is longer than the subtitle slot, FFmpeg atempo speeds it up to fit (e.g. 6s of audio into a 4s slot = 1.5x). Ratios above 2.0 are chained. Pitch is preserved as naturally as possible.

### How to Play Individual Segments

- Click the play button (▶) on any completed row to preview that segment
- Playing stops automatically when another row is clicked
- The playhead on the timeline follows the currently playing segment
- Press **Space** while a single row is selected to play/pause

### Timeline

The bottom timeline shows:
- **Time ruler** with 5-second markers
- **Green blocks** — subtitle durations (click to select row)
- **Blue blocks** — generated audio (shows speed ratio if adjusted)
- **Red playhead** — click anywhere on the timeline to move it
- Horizontally scrollable for long projects

### How to Export Final MP3

1. Generate audio for all desired segments
2. Click **Export Final Audio**
3. A merged MP3 is created with silence gaps matching the original subtitle timing
4. The file downloads automatically

### Storage

```
output/subtitle-jobs/<jobId>/
  metadata.json     Job metadata + segment statuses
  segments/         Raw Edge TTS output
  adjusted/         Speed-adjusted MP3s
  final.mp3         Exported merged audio
```

## Subtitle API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/subtitles/import` | Parse SRT text, return segments |
| `POST` | `/api/subtitles/jobs` | Create a subtitle job |
| `GET` | `/api/subtitles/jobs/:id` | Get job + segment statuses |
| `POST` | `/api/subtitles/segments/:id/generate` | Generate audio for selected segments |
| `GET` | `/api/subtitles/segments/:id/audio?index=N` | Download individual segment MP3 |
| `POST` | `/api/subtitles/export` | Trigger final export |
| `GET` | `/api/subtitles/export/:id/download` | Download exported MP3 |

## 🐛 Troubleshooting

### Common Issues

#### FFmpeg not found

**Error:** `FFmpeg not found. Install FFmpeg and add it to your PATH.`

**Solution:**
1. Download FFmpeg from https://ffmpeg.org/download.html
2. Extract to `C:\ffmpeg` (Windows) or `/usr/local/bin` (Mac/Linux)
3. Add to system PATH
4. Restart terminal and verify: `ffmpeg -version`

#### Text validation errors

**Error:** `Text does not contain any Khmer characters`

**Solution:** Ensure text contains Khmer Unicode (U+1780–U+17FF). Copy text from a reliable source or use the sample text button.

#### Network errors

**Error:** `ECONNREFUSED` or `network timeout`

**Solution:**
- Check internet connection (Edge TTS requires online access)
- Disable VPN or proxy temporarily
- Check firewall settings

#### Port already in use

**Error:** `EADDRINUSE: address already in use :::3000`

**Solution:**
```bash
# Change port via environment variable
PORT=3001 npm run serve

# Or kill process using port 3000 (Windows)
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Or (Linux/Mac)
lsof -ti:3000 | xargs kill
```

#### Generation fails mid-way

**Solution:** Re-run the same command. The session will resume from the last successful chunk automatically.

#### Audio file is empty or corrupted

**Possible causes:**
- Interrupted generation
- Disk space full
- Invalid text characters

**Solution:**
1. Check available disk space
2. Clear output directory: `npm run clean`
3. Regenerate with smaller text chunk

#### SRT import fails

**Error:** `No valid subtitle blocks found`

**Solution:** Ensure SRT format is correct:
```srt
1
00:00:01,500 --> 00:00:04,000
សួស្តី!

2
00:00:05,000 --> 00:00:08,500
នេះជាឧទាហរណ៍
```

Time format must be: `HH:MM:SS,mmm` with `-->` separator.

### Performance Tips

1. **Adjust concurrency** for faster generation:
   ```bash
   TTS_CONCURRENCY=5 npm run serve
   ```

2. **Use direct generation** for text ≤5,000 chars (faster than jobs)

3. **Process large files overnight** for texts over 50,000 characters

### Getting Help

- Check [existing issues](../../issues)
- Create a [new issue](../../issues/new) with:
  - OS and Node.js version
  - Full error message
  - Steps to reproduce
  - Sample text (if applicable)

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Quick contribution checklist:
- [ ] Fork the repository
- [ ] Create a feature branch
- [ ] Make your changes
- [ ] Run `npm run typecheck`
- [ ] Test both web and CLI
- [ ] Submit pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Microsoft Edge TTS for providing free Khmer voices
- [@andresaya/edge-tts](https://www.npmjs.com/package/@andresaya/edge-tts) npm package
- Khmer language community

## 📞 Support

- **Issues**: [GitHub Issues](../../issues)
- **Discussions**: [GitHub Discussions](../../discussions)
- **Email**: [Your contact]

---

Made with ❤️ for the Khmer language community | ធ្វើឡើងដោយស្នេហា សម្រាប់សហគមន៍ភាសាខ្មែរ
