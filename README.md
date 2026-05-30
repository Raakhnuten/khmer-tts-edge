# Khmer Text-to-Speech

Converts Khmer text to natural-sounding speech using **Microsoft Edge TTS** (free, online).

**Khmer voices:**
- `km-KH-PisethNeural` — Male (default)
- `km-KH-SreymomNeural` — Female

## Requirements

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

## Setup

```bash
npm install
```

## Web Interface (recommended)

```bash
npm run serve
```

Open http://localhost:3000 in your browser.

- Paste Khmer text, choose voice, click **Generate Audio**
- Short text (≤5000 chars) generates directly
- Long text creates a background job with progress tracking

## CLI Usage

### List voices

```bash
npm run voices
```

### Generate audio from file

Put text in `input/text.txt`, then:

```bash
npm run generate                     # uses default voice (Piseth)
npm run generate -- --voice km-KH-SreymomNeural
```

Output: `output/output.mp3`

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

## Subtitle Audio Editor

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

## Troubleshooting

| Problem | Fix |
|---|---|
| `FFmpeg not found` | Install FFmpeg and add to PATH (see above) |
| `Text does not contain any Khmer characters` | Make sure your text contains Khmer Unicode |
| `Text too long` | Maximum 100,000 characters |
| `ECONNREFUSED` / network error | Check internet connection; Edge TTS requires internet |
| Process crashes mid-way | Re-run — sessions resume automatically |
| `No completed segments` | Generate audio for at least one row before exporting |
| `Segment audio not available` | Generate the segment first, then play |
| SRT import fails | Check format: `HH:MM:SS,mmm --> HH:MM:SS,mmm` with Khmer text below |

## Notes

- Requires internet (calls Microsoft Edge TTS API)
- ffmpeg must be installed for audio merging
- 300ms silence inserted between chunks for natural pacing
- Resumable — re-run the same CLI command to skip completed chunks
