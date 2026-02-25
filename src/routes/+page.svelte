<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { onDestroy } from 'svelte';

	import { audioSession } from '$lib/stores/audio-session';
	import type { TranscriptPayload } from '$lib/types';

	type ErrorResponse = {
		message?: string;
	};

	const supportedMimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

	let mediaRecorder: MediaRecorder | null = null;
	let mediaStream: MediaStream | null = null;
	let recordedChunks: Blob[] = [];

	let selectedFile = $state<File | null>(null);
	let previewUrl = $state('');
	let isRecording = $state(false);
	let isTranscribing = $state(false);
	let errorMessage = $state('');
	let infoMessage = $state('');

	const canRecordAudio = browser
		? typeof window !== 'undefined' &&
			'MediaRecorder' in window &&
			Boolean(navigator.mediaDevices?.getUserMedia)
		: false;

	function resetPreviewUrl(): void {
		if (previewUrl) {
			URL.revokeObjectURL(previewUrl);
			previewUrl = '';
		}
	}

	function setSelectedFile(file: File): void {
		resetPreviewUrl();
		selectedFile = file;
		previewUrl = URL.createObjectURL(file);
		errorMessage = '';
	}

	function stopMediaTracks(): void {
		if (!mediaStream) {
			return;
		}

		for (const track of mediaStream.getTracks()) {
			track.stop();
		}

		mediaStream = null;
	}

	function buildRecordingFile(chunks: Blob[], mimeType: string): File {
		const extension = mimeType.includes('mp4') ? 'm4a' : 'webm';
		const safeTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const blob = new Blob(chunks, { type: mimeType });
		return new File([blob], `recording-${safeTimestamp}.${extension}`, { type: mimeType });
	}

	function getRecorderOptions(): MediaRecorderOptions {
		for (const mimeType of supportedMimeTypes) {
			if (MediaRecorder.isTypeSupported(mimeType)) {
				return { mimeType };
			}
		}

		return {};
	}

	async function startRecording(): Promise<void> {
		if (!canRecordAudio) {
			errorMessage = 'Audio recording is not supported in this browser.';
			return;
		}

		if (isRecording || isTranscribing) {
			return;
		}

		try {
			errorMessage = '';
			infoMessage = 'Recording in progress...';

			mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
			mediaRecorder = new MediaRecorder(mediaStream, getRecorderOptions());
			recordedChunks = [];

			mediaRecorder.ondataavailable = (event: BlobEvent) => {
				if (event.data.size > 0) {
					recordedChunks.push(event.data);
				}
			};

			mediaRecorder.onstop = () => {
				const mimeType = mediaRecorder?.mimeType || recordedChunks[0]?.type || 'audio/webm';

				if (recordedChunks.length > 0) {
					setSelectedFile(buildRecordingFile(recordedChunks, mimeType));
					infoMessage = 'Recording saved. You can transcribe it now.';
				} else {
					errorMessage = 'The recording did not capture any audio data.';
				}

				recordedChunks = [];
				stopMediaTracks();
				mediaRecorder = null;
			};

			mediaRecorder.onerror = () => {
				errorMessage = 'Recording failed. Please try again.';
				stopMediaTracks();
				mediaRecorder = null;
				isRecording = false;
			};

			mediaRecorder.start();
			isRecording = true;
		} catch {
			errorMessage = 'Could not access your microphone. Check permissions and try again.';
			infoMessage = '';
			stopMediaTracks();
			mediaRecorder = null;
			isRecording = false;
		}
	}

	function stopRecording(): void {
		if (!mediaRecorder || mediaRecorder.state !== 'recording') {
			return;
		}

		mediaRecorder.stop();
		isRecording = false;
	}

	function onFileChange(event: Event): void {
		const input = event.currentTarget as HTMLInputElement | null;
		const file = input?.files?.[0];

		if (!file) {
			return;
		}

		stopMediaTracks();
		mediaRecorder = null;
		isRecording = false;
		infoMessage = 'Audio file ready for transcription.';
		setSelectedFile(file);
	}

	async function transcribeAndOpenPlayback(): Promise<void> {
		if (!selectedFile || isTranscribing || isRecording) {
			return;
		}

		try {
			isTranscribing = true;
			errorMessage = '';
			infoMessage = 'Transcribing audio... the first run may take up to a minute while the model downloads.';

			const formData = new FormData();
			formData.append('audio', selectedFile, selectedFile.name);

			const response = await fetch('/api/transcribe', {
				method: 'POST',
				body: formData
			});
			const responseBody = (await response.json()) as TranscriptPayload | ErrorResponse;

			if (!response.ok) {
				const apiMessage =
					typeof responseBody === 'object' &&
					responseBody !== null &&
					'message' in responseBody &&
					typeof responseBody.message === 'string'
						? responseBody.message
						: 'Transcription request failed.';
				throw new Error(apiMessage);
			}

			const transcript = responseBody as TranscriptPayload;
			if (transcript.words.length === 0) {
				throw new Error('No words were detected in this audio.');
			}

			audioSession.set({
				audioFile: selectedFile,
				sourceName: selectedFile.name,
				transcript
			});

			await goto('/playback');
		} catch (error) {
			const fallbackMessage = 'Unable to transcribe this audio file.';
			errorMessage = error instanceof Error ? error.message : fallbackMessage;
		} finally {
			isTranscribing = false;
		}
	}

	onDestroy(() => {
		resetPreviewUrl();
		stopMediaTracks();
	});
</script>

<main class="page">
	<h1>Audio Transcription Studio</h1>
	<p class="subtitle">
		Record audio from your microphone or upload an audio file, then generate a timestamped transcript
		with confidence scoring.
	</p>

	<div class="card-grid">
		<section class="card">
			<h2>1) Record audio</h2>
			<p>Use your microphone to create a fresh audio clip.</p>
			<div class="button-row">
				<button type="button" class="primary" onclick={startRecording} disabled={!canRecordAudio || isRecording || isTranscribing}>
					Start recording
				</button>
				<button type="button" class="secondary" onclick={stopRecording} disabled={!isRecording}>
					Stop recording
				</button>
			</div>
			{#if !canRecordAudio}
				<p class="hint">This browser does not expose the MediaRecorder API.</p>
			{/if}
		</section>

		<section class="card">
			<h2>2) Upload audio</h2>
			<p>Select a file instead of recording (wav, mp3, m4a, webm, and more).</p>
			<label class="upload">
				<input type="file" accept="audio/*" onchange={onFileChange} disabled={isTranscribing} />
			</label>
		</section>
	</div>

	{#if selectedFile}
		<section class="selected-file">
			<h3>Selected audio</h3>
			<p>
				<strong>{selectedFile.name}</strong> ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
			</p>
			<audio controls src={previewUrl}></audio>
		</section>
	{/if}

	<div class="actions">
		<button
			type="button"
			class="primary"
			onclick={transcribeAndOpenPlayback}
			disabled={!selectedFile || isRecording || isTranscribing}
		>
			{#if isTranscribing}
				Transcribing...
			{:else}
				Transcribe and open playback page
			{/if}
		</button>
	</div>

	{#if infoMessage}
		<p class="info">{infoMessage}</p>
	{/if}
	{#if errorMessage}
		<p class="error">{errorMessage}</p>
	{/if}
</main>

<style>
	.page {
		max-width: 960px;
		margin: 0 auto;
		padding: 2rem 1rem 4rem;
		font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
	}

	h1 {
		margin-bottom: 0.35rem;
		font-size: clamp(1.8rem, 3vw, 2.5rem);
	}

	.subtitle {
		margin: 0 0 1.5rem;
		color: #475569;
	}

	.card-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.card {
		border: 1px solid #cbd5e1;
		border-radius: 0.75rem;
		padding: 1rem;
		background: #f8fafc;
	}

	.card h2 {
		margin-top: 0;
	}

	.button-row {
		display: flex;
		gap: 0.65rem;
		flex-wrap: wrap;
	}

	button {
		border: 0;
		border-radius: 0.5rem;
		padding: 0.65rem 1rem;
		font-size: 0.95rem;
		font-weight: 600;
		cursor: pointer;
	}

	button:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.primary {
		background: #0f172a;
		color: #ffffff;
	}

	.secondary {
		background: #e2e8f0;
		color: #0f172a;
	}

	.upload input {
		display: block;
		width: 100%;
		font-size: 0.95rem;
	}

	.selected-file {
		border: 1px solid #e2e8f0;
		border-radius: 0.75rem;
		padding: 1rem;
		margin: 1rem 0;
		background: #ffffff;
	}

	audio {
		display: block;
		width: min(100%, 520px);
		margin-top: 0.5rem;
	}

	.actions {
		margin-top: 1rem;
	}

	.hint,
	.info,
	.error {
		margin-top: 0.75rem;
	}

	.hint {
		color: #64748b;
		font-size: 0.9rem;
	}

	.info {
		color: #0c4a6e;
	}

	.error {
		color: #991b1b;
		font-weight: 600;
	}
</style>
