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

If you see `pkg-config is required for building PyAV`, install system dependencies first:

**macOS (Homebrew)**

```bash
brew install pkg-config ffmpeg
```

**Ubuntu / Debian**

```bash
sudo apt-get update
sudo apt-get install -y pkg-config ffmpeg libavcodec-dev libavdevice-dev libavfilter-dev libavformat-dev libavutil-dev libswresample-dev libswscale-dev
```

Then create a virtual environment and install Python packages:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Python compatibility note (macOS Intel)

`faster-whisper` depends on `onnxruntime`. PyPI currently does **not** publish `onnxruntime`
wheels for **macOS x86_64 + Python 3.14+**, so installation/transcription will fail on that
combination.

If you are on an Intel Mac, use Python **3.13 or lower** for this project.

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
