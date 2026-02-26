<script lang="ts">
	import { onDestroy } from 'svelte';
	import { get } from 'svelte/store';

	import { audioSession } from '$lib/stores/audio-session';
	import { getConfidenceLabel } from '$lib/utils/confidence';
	import type { AudioSession, ConfidenceLevel } from '$lib/types';

	let session = $state<AudioSession | null>(get(audioSession));
	let audioElement = $state<HTMLAudioElement | null>(null);
	let audioUrl = $state('');
	let activeWordIndex = $state(-1);
	let lastFile: File | null = null;

	const unsubscribe = audioSession.subscribe((value) => {
		session = value;
	});

	function getConfidenceClass(level: ConfidenceLevel): string {
		if (level === 'high') {
			return 'high';
		}
		if (level === 'medium') {
			return 'medium';
		}

		return 'low';
	}

	function formatTime(totalSeconds: number): string {
		const rounded = Math.max(0, Math.floor(totalSeconds));
		const minutes = Math.floor(rounded / 60);
		const seconds = rounded % 60;
		return `${minutes}:${seconds.toString().padStart(2, '0')}`;
	}

	function updateActiveWord(): void {
		if (!audioElement || !session) {
			activeWordIndex = -1;
			return;
		}

		const currentTime = audioElement.currentTime;
		activeWordIndex = session.transcript.words.findIndex(
			(word) => currentTime >= word.start && currentTime <= word.end
		);
	}

	async function seekTo(startTime: number): Promise<void> {
		if (!audioElement) {
			return;
		}

		audioElement.currentTime = Math.max(0, startTime);
		updateActiveWord();

		try {
			await audioElement.play();
		} catch {
			// Ignore autoplay restrictions after manual seeking.
		}
	}

	$effect(() => {
		const nextFile = session?.audioFile ?? null;
		if (nextFile === lastFile) {
			return;
		}

		if (audioUrl) {
			URL.revokeObjectURL(audioUrl);
		}

		lastFile = nextFile;
		audioUrl = nextFile ? URL.createObjectURL(nextFile) : '';
		activeWordIndex = -1;
	});

	onDestroy(() => {
		unsubscribe();
		if (audioUrl) {
			URL.revokeObjectURL(audioUrl);
		}
	});
</script>

<main class="page">
	<header class="header">
		<div>
			<h1>Playback + Auto-Transcript</h1>
			<p>Words are color-coded by confidence and can be clicked to jump in the audio.</p>
		</div>
		<a href="/" class="back-link">Record or upload another file</a>
	</header>

	{#if !session}
		<section class="empty-state">
			<h2>No audio loaded</h2>
			<p>
				Go back to the first page to record or upload audio, then run transcription before opening
				this view.
			</p>
		</section>
	{:else}
		<section class="player-card">
			<h2>{session.sourceName}</h2>
			<audio
				bind:this={audioElement}
				controls
				src={audioUrl}
				ontimeupdate={updateActiveWord}
				onseeked={updateActiveWord}
				onloadedmetadata={updateActiveWord}
			></audio>
			<p class="meta">
				Language: {session.transcript.language || 'unknown'} · Words: {session.transcript.words.length}
			</p>
		</section>

		<section class="legend">
			<span class="legend-item high">High confidence</span>
			<span class="legend-item medium">Medium confidence</span>
			<span class="legend-item low">Low confidence</span>
		</section>

		<section class="transcript-card">
			<h3>Transcript</h3>
			<div class="transcript-words">
				{#each session.transcript.words as word, index}
					<button
						type="button"
						class={`word ${getConfidenceClass(word.confidenceLevel)}`}
						class:active={index === activeWordIndex}
						onclick={() => seekTo(word.start)}
						title={`${getConfidenceLabel(word.confidenceLevel)} (${Math.round(word.confidence * 100)}%) at ${formatTime(word.start)}`}
					>
						{word.text}
					</button>
				{/each}
			</div>
		</section>
	{/if}
</main>

<style>
	.page {
		max-width: 960px;
		margin: 0 auto;
		padding: 2rem 1rem 4rem;
		font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
	}

	.header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 1.25rem;
	}

	h1 {
		margin: 0 0 0.35rem;
	}

	.header p {
		margin: 0;
		color: #475569;
	}

	.back-link {
		color: #0f172a;
		font-weight: 600;
	}

	.empty-state,
	.player-card,
	.transcript-card {
		border: 1px solid #dbe2ea;
		border-radius: 0.75rem;
		padding: 1rem;
		background: #ffffff;
	}

	.player-card h2,
	.transcript-card h3,
	.empty-state h2 {
		margin-top: 0;
	}

	audio {
		display: block;
		width: min(100%, 520px);
		margin: 0.5rem 0;
	}

	.meta {
		margin: 0;
		color: #64748b;
	}

	.legend {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
		margin: 1rem 0;
	}

	.legend-item {
		border-radius: 9999px;
		padding: 0.35rem 0.7rem;
		font-size: 0.82rem;
		font-weight: 600;
	}

	.legend-item.high {
		background: #dcfce7;
		color: #166534;
	}

	.legend-item.medium {
		background: #fef3c7;
		color: #92400e;
	}

	.legend-item.low {
		background: #fee2e2;
		color: #991b1b;
	}

	.transcript-words {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.word {
		border-radius: 9999px;
		border: 1px solid transparent;
		padding: 0.35rem 0.65rem;
		font-size: 0.92rem;
		cursor: pointer;
		transition: transform 0.15s ease, border-color 0.15s ease;
	}

	.word:hover {
		transform: translateY(-1px);
		border-color: #0f172a;
	}

	.word.active {
		outline: 2px solid #0f172a;
		outline-offset: 1px;
	}

	.word.high {
		background: #dcfce7;
		color: #166534;
	}

	.word.medium {
		background: #fef3c7;
		color: #92400e;
	}

	.word.low {
		background: #fee2e2;
		color: #991b1b;
	}
</style>
