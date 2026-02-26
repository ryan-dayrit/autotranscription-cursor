#!/usr/bin/env python3
"""Generate word-level transcription with confidence using faster-whisper."""

from __future__ import annotations

import argparse
import json
import os
import platform
import sys
from typing import Any

try:
    from faster_whisper import WhisperModel
except ImportError as import_error:
    WhisperModel = None  # type: ignore[assignment]
    FASTER_WHISPER_IMPORT_ERROR: ImportError | None = import_error
else:
    FASTER_WHISPER_IMPORT_ERROR = None


def safe_float(value: Any, fallback: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback

    if number != number:  # NaN check
        return fallback

    return number


def is_unsupported_macos_intel_python() -> bool:
    return (
        sys.platform == "darwin"
        and platform.machine() == "x86_64"
        and sys.version_info >= (3, 14)
    )


def missing_faster_whisper_message() -> str:
    if is_unsupported_macos_intel_python():
        return (
            "faster-whisper is unavailable on macOS Intel (x86_64) with Python 3.14+ "
            "because onnxruntime wheels are not published for that combination. "
            "Use Python 3.13 (or lower) on Intel Macs, then run `pip install -r requirements.txt`."
        )

    details = f" Import error: {FASTER_WHISPER_IMPORT_ERROR!s}" if FASTER_WHISPER_IMPORT_ERROR else ""
    return "faster-whisper is not installed. Run `pip install -r requirements.txt`." + details


def build_model(model_size: str) -> WhisperModel:
    if WhisperModel is None:
        raise RuntimeError(missing_faster_whisper_message())

    return WhisperModel(model_size, device="cpu", compute_type="int8")


def transcribe_audio(input_path: str, model_size: str) -> dict[str, Any]:
    model = build_model(model_size)
    segments, info = model.transcribe(
        input_path,
        beam_size=5,
        temperature=0.0,
        word_timestamps=True,
        vad_filter=True,
        condition_on_previous_text=False,
    )

    words: list[dict[str, float | str]] = []
    text_parts: list[str] = []
    duration = 0.0

    for segment in segments:
        segment_text = (getattr(segment, "text", "") or "").strip()
        if segment_text:
            text_parts.append(segment_text)

        segment_start = safe_float(getattr(segment, "start", 0.0), 0.0)
        segment_end = safe_float(getattr(segment, "end", segment_start + 0.01), segment_start + 0.01)
        duration = max(duration, segment_end)

        for word in (getattr(segment, "words", None) or []):
            token = (getattr(word, "word", "") or "").strip()
            if not token:
                continue

            start = safe_float(getattr(word, "start", segment_start), segment_start)
            end = safe_float(getattr(word, "end", segment_end), max(start + 0.01, segment_end))
            if end <= start:
                end = start + 0.01

            confidence = safe_float(getattr(word, "probability", 0.0), 0.0)
            confidence = min(1.0, max(0.0, confidence))

            words.append(
                {
                    "text": token,
                    "start": start,
                    "end": end,
                    "confidence": confidence,
                }
            )

    text = " ".join(text_parts).strip()
    if not text:
        text = " ".join(word["text"] for word in words).strip()

    return {
        "text": text,
        "language": getattr(info, "language", None),
        "duration": duration,
        "words": words,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Transcribe audio with faster-whisper.")
    parser.add_argument(
        "--check",
        action="store_true",
        help="Only check if faster-whisper is available; exit 0 if yes, 1 with message if no.",
    )
    parser.add_argument("--input", help="Input audio file path")
    parser.add_argument("--output", help="Output JSON path")
    parser.add_argument(
        "--model-size",
        default=os.environ.get("WHISPER_MODEL_SIZE", "base"),
        help="Whisper model size (tiny, base, small, medium, large-v3, etc.)",
    )
    args = parser.parse_args()
    if not args.check and (not args.input or not args.output):
        parser.error("--input and --output are required unless --check is used.")
    return args


def main() -> int:
    args = parse_args()

    if args.check:
        if WhisperModel is None or is_unsupported_macos_intel_python():
            print(missing_faster_whisper_message(), file=sys.stderr)
            return 1
        return 0

    if not os.path.exists(args.input):
        print(f"Input audio not found: {args.input}", file=sys.stderr)
        return 2

    try:
        result = transcribe_audio(args.input, args.model_size)
    except Exception as exc:  # noqa: BLE001
        print(f"Transcription failed: {exc}", file=sys.stderr)
        return 1

    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as output_file:
        json.dump(result, output_file, indent=2, ensure_ascii=False)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
