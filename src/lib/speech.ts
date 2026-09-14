/**
 * Dictation, as much of it as the browser gives us.
 *
 * The Web Speech API is still prefixed in most engines and missing from
 * others, so this is the one place that knows that: `newRecognition()`
 * answers `null` where there is no engine, and a caller that gets null draws
 * no microphone at all rather than a button that does nothing.
 *
 * Nothing here reaches a server — the transcript is produced in the browser
 * and lands in the composer's draft, where the reader can edit it before it
 * is sent.
 */
import { browser } from '$app/environment';

/** The slice of `SpeechRecognition` this app uses. */
export type Recognition = {
	continuous: boolean;
	interimResults: boolean;
	lang: string;
	start: () => void;
	stop: () => void;
	onresult: ((event: SpeechRecognitionEventLike) => void) | null;
	onerror: (() => void) | null;
	onend: (() => void) | null;
};

export type SpeechRecognitionEventLike = {
	resultIndex: number;
	results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
};

/** True where this browser has a speech engine at all. */
export function canDictate(): boolean {
	return browser && Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);
}

/** A recognizer set up for continuous dictation, or null where unsupported. */
export function newRecognition(): Recognition | null {
	if (!browser) return null;
	const Engine = window.SpeechRecognition ?? window.webkitSpeechRecognition;
	if (!Engine) return null;

	const recognition = new Engine();
	recognition.continuous = true;
	recognition.interimResults = true;
	recognition.lang = navigator.language || 'en-US';
	return recognition;
}

/**
 * The results of one event, split into what the engine has settled on and
 * what it is still revising — the settled text is appended to the draft, the
 * rest is shown as it changes.
 */
export function readResults(event: SpeechRecognitionEventLike) {
	let settled = '';
	let pending = '';
	for (let index = event.resultIndex; index < event.results.length; index++) {
		const result = event.results[index];
		const { transcript } = result[0];
		if (result.isFinal) settled += `${transcript} `;
		else pending += transcript;
	}
	return { settled, pending };
}
