# Audio transcription web app (SvelteKit)

This project is a Svelte web app with two pages:

1. **Record / Upload page** (`/`)
   - Record audio using your microphone (MediaRecorder)
   - Or upload an audio file
   - Send the selected audio to the backend for transcription
2. **Playback page** (`/playback`)
   - Plays back the audio
   - Displays word-by-word transcript
   - Colors each word by confidence level:
     - **High** (green)
     - **Medium** (yellow)
     - **Low** (red)
   - Click a word to seek audio to that timestamp

The backend endpoint (`POST /api/transcribe`) calls a Python script using `faster-whisper` to generate word timestamps and confidence values.

## Stack

- SvelteKit + TypeScript
- Browser recording via MediaRecorder
- Python `faster-whisper` for transcription

## Setup

### 1) Install JavaScript dependencies

```bash
npm install
```

### 2) Install Python dependencies

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run locally

```bash
npm run dev
```

Then open the printed local URL (usually `http://localhost:5173`).

## Notes

- The first transcription can be slow because Whisper model files are downloaded/cached.
- You can choose a model size with:
  - env var: `WHISPER_MODEL_SIZE` (default: `base`)
- If your Python binary is not `python3`, set:
  - env var: `PYTHON_BIN`
