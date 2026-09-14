import {
	Experimental_AbstractRealtimeSession as AbstractRealtimeSession,
	type Experimental_RealtimeModel as RealtimeModel,
	type Experimental_RealtimeState as RealtimeState,
	type JSONValue,
	type UIMessage
} from 'ai';
import { toolLabel } from '$lib/ai/labels';
import {
	callState,
	voiceSession,
	type CallState,
	type VoiceToolCall,
	type VoiceToolResult
} from '$lib/ai/realtime';
import { jsonValueSchema } from '$lib/ai/schemas';

/**
 * A voice call with the assistant, as one object the screen can read.
 *
 * The SDK owns everything hard about this: `AbstractRealtimeSession` (from
 * `ai`) holds the socket, captures the microphone, plays the model's audio,
 * stops that playback the moment the caller starts speaking again, assembles
 * both sides into `UIMessage`s and normalises tool calls. It is framework
 * agnostic on purpose — one abstract `setState` is all a binding has to
 * write, which is what `@ai-sdk/react`'s `experimental_useRealtime` does with
 * React state. `@ai-sdk/svelte` has no realtime binding yet, so
 * `SvelteRealtimeSession` below is that same binding in runes. Nothing here
 * re-implements a mechanism the SDK already has.
 *
 * `VoiceCall` is the app's own layer on top: the microphone permission, the
 * mute switch, the input level the orb breathes with, and which tool is
 * running — the things a call screen needs and a transport does not have an
 * opinion about.
 */

/**
 * The SDK session with Svelte's state instead of React's. One object rather
 * than a field per key so `setState` stays generic and needs no cast; the
 * base class only calls it when a value actually changed, so replacing the
 * record is one update per real change.
 */
class SvelteRealtimeSession extends AbstractRealtimeSession {
	#state = $state.raw<RealtimeState>({
		status: 'disconnected',
		messages: [],
		events: [],
		isCapturing: false,
		isPlaying: false
	});

	protected setState<K extends keyof RealtimeState>(key: K, value: RealtimeState[K]): void {
		const next: RealtimeState = { ...this.#state };
		next[key] = value;
		this.#state = next;
	}

	get status(): RealtimeState['status'] {
		return this.#state.status;
	}

	get messages(): UIMessage[] {
		return this.#state.messages;
	}

	get isPlaying(): boolean {
		return this.#state.isPlaying;
	}
}

/** What a tool call has to go through to run: the server, with the caller's session. */
export type RunVoiceTool = (call: VoiceToolCall) => Promise<VoiceToolResult>;

export type VoiceCallOptions = {
	/** The realtime model id, from the page load — the server decides which. */
	modelId: string;
	/** The endpoint that mints the ephemeral token and lists the tools. */
	tokenEndpoint: string;
	/** Runs one tool the model called. Never throws — see `#handleToolCall`. */
	runTool: RunVoiceTool;
};

/**
 * The provider events the screen reads nothing from. The SDK keeps a ring of
 * them for debug UI; this app has none, so it keeps the smallest ring the
 * option allows rather than five hundred of them per call.
 */
const KEPT_EVENTS = 1;

/**
 * The microphone, asked for the way a call wants it: the browser's own echo
 * cancellation is what keeps the model from hearing itself and answering its
 * own last sentence.
 */
const MICROPHONE: MediaStreamConstraints = {
	audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
};

export class VoiceCall {
	#options: VoiceCallOptions;
	#session = $state.raw<SvelteRealtimeSession | null>(null);
	#stream: MediaStream | null = null;
	#stopMeter: (() => void) | null = null;

	#starting = $state(false);
	/**
	 * Set the moment the call is hung up, and checked after every await in
	 * `start()`. Opening a call is three round trips — the microphone, the
	 * setup endpoint, the socket — and a reader who changes their mind during
	 * them would otherwise leave a session that finished connecting after the
	 * screen that was holding it had gone.
	 */
	#hungUp = false;
	#muted = $state(false);
	#level = $state(0);
	#failure = $state<string | null>(null);
	/** Tool calls still running, and the newest one's name — the "looking it up" line. */
	#running = $state(0);
	#tool = $state<string | null>(null);

	constructor(options: VoiceCallOptions) {
		this.#options = options;
	}

	/** What the orb is doing. */
	get state(): CallState {
		if (this.#failure) return 'failed';
		if (this.#starting || !this.#session) return 'connecting';
		return callState({
			status: this.#session.status,
			isPlaying: this.#session.isPlaying,
			working: this.#running > 0
		});
	}

	/** Both sides of the call, as the SDK assembled them from the transcripts. */
	get messages(): UIMessage[] {
		return this.#session?.messages ?? [];
	}

	/** How loudly the caller is speaking right now, 0 to 1. */
	get level(): number {
		return this.#level;
	}

	get muted(): boolean {
		return this.#muted;
	}

	/** Why the call could not start or could not continue, in words for the reader. */
	get failure(): string | null {
		return this.#failure;
	}

	/** What the assistant is doing while it is not talking — "Opening a record". */
	get activity(): string | null {
		return this.#tool === null ? null : toolLabel(this.#tool, false);
	}

	/**
	 * Ask for the microphone, open the session, start sending audio. The
	 * permission comes first on purpose: a refused microphone should cost
	 * nothing on the server, and a session opened before it would be a socket
	 * with nothing to say into it.
	 */
	async start(): Promise<void> {
		if (this.#session || this.#starting) return;
		this.#starting = true;
		this.#hungUp = false;
		this.#failure = null;

		let stream: MediaStream;
		try {
			stream = await navigator.mediaDevices.getUserMedia(MICROPHONE);
		} catch {
			this.#starting = false;
			this.#failure =
				'This browser would not give the page a microphone. Allow it for this site and try again.';
			return;
		}
		if (this.#hungUp) {
			stream.getTracks().forEach((track) => track.stop());
			this.#starting = false;
			return;
		}

		try {
			const session = new SvelteRealtimeSession({
				model: await realtimeModel(this.#options.modelId),
				api: { token: this.#options.tokenEndpoint },
				sessionConfig: voiceSession(),
				maxEvents: KEPT_EVENTS,
				// The SDK hands a tool call's arguments over as they came off the
				// wire, so they are parsed here as what they must be — JSON — and
				// as nothing more: whether they are valid arguments for the named
				// tool is that tool's own schema's answer, on the server.
				onToolCall: ({ toolCall }) => {
					const args = jsonValueSchema.safeParse(toolCall.args);
					return this.#handleToolCall(toolCall.toolName, args.success ? args.data : null);
				},
				onError: (error) => {
					this.#failure = error.message;
				}
			});
			await session.connect();
			if (this.#hungUp) {
				session.dispose();
				stream.getTracks().forEach((track) => track.stop());
				return;
			}
			session.startAudioCapture(stream);

			this.#session = session;
			this.#stream = stream;
			this.#stopMeter = meterInput(stream, (level) => {
				this.#level = level;
			});
		} catch (cause) {
			stream.getTracks().forEach((track) => track.stop());
			this.#failure = cause instanceof Error ? cause.message : 'The call could not be started.';
		} finally {
			this.#starting = false;
		}
	}

	/** Hang up: the socket, the microphone and the level meter all go together. */
	end(): void {
		this.#hungUp = true;
		this.#stopMeter?.();
		this.#stopMeter = null;
		this.#session?.dispose();
		this.#session = null;
		this.#stream?.getTracks().forEach((track) => track.stop());
		this.#stream = null;
		this.#level = 0;
		this.#muted = false;
		this.#running = 0;
		this.#tool = null;
	}

	/** Hang up and dial again — what the screen offers after a call that failed. */
	async retry(): Promise<void> {
		this.end();
		await this.start();
	}

	/**
	 * Mute by silencing the track rather than by stopping capture: the session
	 * keeps its turn detection and its socket, and unmuting is instant instead
	 * of being a second negotiation.
	 */
	toggleMute(): void {
		if (!this.#stream) return;
		this.#muted = !this.#muted;
		for (const track of this.#stream.getAudioTracks()) track.enabled = !this.#muted;
		if (this.#muted) this.#level = 0;
	}

	/**
	 * One tool call, run on the server with the caller's own session — the
	 * same gate, the same client, the same data modules as a typed turn.
	 *
	 * It never throws: a thrown handler leaves the SDK with no output to send
	 * back, and the model then waits for a result that is never coming. An
	 * error is returned as the tool's output instead, which the model can read
	 * and say out loud.
	 */
	async #handleToolCall(name: string, input: JSONValue): Promise<VoiceToolResult> {
		this.#running += 1;
		this.#tool = name;
		try {
			return await this.#options.runTool({ name, input });
		} catch (cause) {
			return { error: cause instanceof Error ? cause.message : 'That did not work.' };
		} finally {
			this.#running -= 1;
			if (this.#running === 0) this.#tool = null;
		}
	}
}

/**
 * The realtime model, built in the browser. This is the one client module
 * that imports the provider package, and it has to be: the browser half of a
 * realtime model is what parses the provider's events and serialises ours,
 * so it cannot live on the server the way `chatModel()` does. It is loaded
 * only when a call starts, so the provider is a chunk of its own rather than
 * part of every page.
 *
 * The key is a placeholder and is never used: `doCreateClientSecret` is the
 * only method that authenticates, it runs on the server, and the browser
 * connects with the ephemeral token that call returns.
 */
async function realtimeModel(modelId: string): Promise<RealtimeModel> {
	const { createOpenAI } = await import('@ai-sdk/openai');
	return createOpenAI({ apiKey: 'client-side' }).experimental_realtime(modelId);
}

/**
 * The caller's input level, for the orb to breathe with. Read off an
 * analyser over the same stream the session is sending, because the SDK's
 * own capture graph is its business — a second analyser costs one node and
 * asks nothing of it.
 *
 * Returns the teardown. Root-mean-square of the waveform, lifted with a
 * square root so ordinary speech moves the orb rather than only a shout.
 */
function meterInput(stream: MediaStream, onLevel: (level: number) => void): () => void {
	const context = new AudioContext();
	const analyser = context.createAnalyser();
	analyser.fftSize = 512;
	analyser.smoothingTimeConstant = 0.7;
	context.createMediaStreamSource(stream).connect(analyser);

	const samples = new Uint8Array(analyser.fftSize);
	let frame = 0;
	let reported = 0;

	function tick() {
		analyser.getByteTimeDomainData(samples);
		let sum = 0;
		for (const sample of samples) {
			const centred = (sample - 128) / 128;
			sum += centred * centred;
		}
		const level = Math.min(1, Math.sqrt(Math.sqrt(sum / samples.length)) * 1.6);
		// A deadband, because this runs every frame and the orb cannot show a
		// difference of a hundredth: below it, the report is the only cost.
		if (Math.abs(level - reported) > 0.02) {
			reported = level;
			onLevel(level);
		}
		frame = requestAnimationFrame(tick);
	}

	frame = requestAnimationFrame(tick);

	return () => {
		cancelAnimationFrame(frame);
		analyser.disconnect();
		void context.close();
	};
}
