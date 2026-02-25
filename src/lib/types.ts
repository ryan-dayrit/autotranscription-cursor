export type ConfidenceLevel = 'low' | 'medium' | 'high';

export interface TranscriptWord {
	text: string;
	start: number;
	end: number;
	confidence: number;
	confidenceLevel: ConfidenceLevel;
}

export interface TranscriptPayload {
	fullText: string;
	words: TranscriptWord[];
	language?: string;
	duration?: number;
}

export interface AudioSession {
	audioFile: File;
	sourceName: string;
	transcript: TranscriptPayload;
}
