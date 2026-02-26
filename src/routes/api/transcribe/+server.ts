import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { json } from '@sveltejs/kit';

import type { TranscriptPayload, TranscriptWord } from '$lib/types';
import { getConfidenceLevel, normalizeConfidence } from '$lib/utils/confidence';

import type { RequestHandler } from './$types';

type ScriptWord = {
	text?: unknown;
	start?: unknown;
	end?: unknown;
	confidence?: unknown;
};

type ScriptOutput = {
	text?: unknown;
	language?: unknown;
	duration?: unknown;
	words?: ScriptWord[];
};

type SerializableError = {
	message?: unknown;
	stderr?: unknown;
};

const execFileAsync = promisify(execFile);
const pythonBin = process.env.PYTHON_BIN || 'python3';
const scriptPath = resolve('scripts/transcribe.py');
const tempDirectory = join(tmpdir(), 'sveltekit-audio-transcription');

async function checkTranscribeAvailable(): Promise<{ ok: true } | { ok: false; message: string }> {
	try {
		await execFileAsync(pythonBin, [scriptPath, '--check'], {
			timeout: 5000,
			maxBuffer: 1024 * 1024
		});
		return { ok: true };
	} catch (err: unknown) {
		const msg = getErrorMessage(err);
		return { ok: false, message: msg };
	}
}

function sanitizeFilename(input: string): string {
	return input.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function asFiniteNumber(value: unknown, fallbackValue: number): number {
	const numeric = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(numeric)) {
		return fallbackValue;
	}

	return numeric;
}

function getErrorMessage(error: unknown): string {
	if (error && typeof error === 'object') {
		const serializableError = error as SerializableError;
		if (typeof serializableError.stderr === 'string' && serializableError.stderr.trim()) {
			return serializableError.stderr.trim();
		}
		if (typeof serializableError.message === 'string' && serializableError.message.trim()) {
			return serializableError.message.trim();
		}
	}

	return 'Transcription failed unexpectedly.';
}

function isEnvironmentError(message: string): boolean {
	return (
		message.includes('pip install') ||
		message.includes('Python 3.13') ||
		message.includes('onnxruntime') ||
		message.includes('faster-whisper is unavailable')
	);
}

function normalizeWords(rawWords: ScriptWord[] | undefined): TranscriptWord[] {
	if (!Array.isArray(rawWords)) {
		return [];
	}

	return rawWords
		.map((rawWord) => {
			const text = typeof rawWord.text === 'string' ? rawWord.text.trim() : '';
			if (!text) {
				return null;
			}

			const start = Math.max(0, asFiniteNumber(rawWord.start, 0));
			const end = Math.max(start + 0.01, asFiniteNumber(rawWord.end, start + 0.01));
			const confidence = normalizeConfidence(rawWord.confidence);

			return {
				text,
				start,
				end,
				confidence,
				confidenceLevel: getConfidenceLevel(confidence)
			};
		})
		.filter((word): word is TranscriptWord => word !== null);
}

async function cleanupTempFile(path: string): Promise<void> {
	await rm(path, { force: true }).catch(() => undefined);
}

export const POST: RequestHandler = async ({ request }) => {
	let inputPath = '';
	let outputPath = '';

	try {
		const formData = await request.formData();
		const file = formData.get('audio');

		if (!(file instanceof File)) {
			return json({ message: 'Expected an audio file in the "audio" field.' }, { status: 400 });
		}

		if (file.size === 0) {
			return json({ message: 'The uploaded audio file is empty.' }, { status: 400 });
		}

		const check = await checkTranscribeAvailable();
		if (!check.ok) {
			return json(
				{ message: check.message },
				{ status: 503 }
			);
		}

		const requestId = randomUUID();
		const safeName = sanitizeFilename(file.name || 'audio.webm');
		const extension = extname(safeName) || '.webm';

		await mkdir(tempDirectory, { recursive: true });

		inputPath = join(tempDirectory, `${requestId}${extension}`);
		outputPath = join(tempDirectory, `${requestId}.json`);

		const fileBytes = Buffer.from(await file.arrayBuffer());
		await writeFile(inputPath, fileBytes);

		await execFileAsync(
			pythonBin,
			[scriptPath, '--input', inputPath, '--output', outputPath],
			{
				timeout: 10 * 60 * 1000,
				maxBuffer: 4 * 1024 * 1024
			}
		);

		const rawJson = await readFile(outputPath, 'utf8');
		const scriptResponse = JSON.parse(rawJson) as ScriptOutput;
		const words = normalizeWords(scriptResponse.words);

		const fullText =
			typeof scriptResponse.text === 'string' && scriptResponse.text.trim()
				? scriptResponse.text.trim()
				: words.map((word) => word.text).join(' ');

		const payload: TranscriptPayload = {
			fullText,
			words,
			language: typeof scriptResponse.language === 'string' ? scriptResponse.language : undefined,
			duration: asFiniteNumber(scriptResponse.duration, Number.NaN)
		};

		if (!Number.isFinite(payload.duration)) {
			delete payload.duration;
		}

		return json(payload);
	} catch (error) {
		const message = getErrorMessage(error);
		const fullMessage = isEnvironmentError(message)
			? message
			: `${message}\n\nMake sure Python dependencies are installed (\`pip install -r requirements.txt\`).`;
		return json({ message: fullMessage }, { status: 500 });
	} finally {
		if (inputPath) {
			await cleanupTempFile(inputPath);
		}
		if (outputPath) {
			await cleanupTempFile(outputPath);
		}
	}
};
