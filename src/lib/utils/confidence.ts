import type { ConfidenceLevel } from '$lib/types';

export function normalizeConfidence(rawValue: unknown): number {
	const numericValue = typeof rawValue === 'number' ? rawValue : Number(rawValue);
	if (!Number.isFinite(numericValue)) {
		return 0;
	}

	return Math.min(1, Math.max(0, numericValue));
}

export function getConfidenceLevel(rawValue: unknown): ConfidenceLevel {
	const confidence = normalizeConfidence(rawValue);

	if (confidence >= 0.8) {
		return 'high';
	}
	if (confidence >= 0.6) {
		return 'medium';
	}

	return 'low';
}

export function getConfidenceLabel(level: ConfidenceLevel): string {
	if (level === 'high') {
		return 'High confidence';
	}
	if (level === 'medium') {
		return 'Medium confidence';
	}

	return 'Low confidence';
}
