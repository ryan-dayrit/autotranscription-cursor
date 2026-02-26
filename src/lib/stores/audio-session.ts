import { writable } from 'svelte/store';

import type { AudioSession } from '$lib/types';

export const audioSession = writable<AudioSession | null>(null);
