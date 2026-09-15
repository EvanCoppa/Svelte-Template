<script lang="ts">
	import MicIcon from '@lucide/svelte/icons/mic';
	import MicOffIcon from '@lucide/svelte/icons/mic-off';
	import PhoneIcon from '@lucide/svelte/icons/phone';
	import XIcon from '@lucide/svelte/icons/x';
	import { z } from 'zod';
	import {
		captionOf,
		callStatusLabel,
		lastTurn,
		type CallState,
		type VoiceToolCall,
		type VoiceToolResult
	} from '$lib/ai/realtime';
	import { VoiceCall } from '$lib/ai/realtime.svelte';
	import Orb from './assistant-orb.svelte';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';

	/**
	 * The call: the assistant with the typing taken out.
	 *
	 * Everything on this screen is the orb, what it is doing, and the last
	 * thing either of you said — because on a call there is nothing to read,
	 * only something to listen to. The transcript is there so you can check a
	 * name you half-heard, not so you can follow along; a thread you want to
	 * keep is the typed one.
	 *
	 * It is `ui/dialog` rather than `Modal`, which is the documented exception:
	 * `Modal` is a tray holding a card, and a call is a room you step into. It
	 * keeps the dialog's focus trap and its Escape, because it is still a thing
	 * you are inside and have to be able to leave.
	 *
	 * The page owns the data — which model, what this workspace is called — and
	 * the connection belongs to `VoiceCall`, which is opened when this opens and
	 * hung up when it closes. There is no other way out: closing IS hanging up.
	 */
	let {
		open,
		modelId,
		workspace,
		onClose
	}: {
		open: boolean;
		/** The realtime model the server chose, from the page load. */
		modelId: string;
		/** What the caller is talking about — the active organization's name. */
		workspace: string;
		onClose: () => void;
	} = $props();

	/** What SvelteKit's `error()` answers with, which is all a failed relay says. */
	const refusalSchema = z.object({ message: z.string() });

	let call = $state<VoiceCall | null>(null);

	/**
	 * One call per opening. The effect's teardown is the hang-up, so every way
	 * out of this screen — the button, Escape, a click outside, navigating away
	 * — releases the microphone and closes the socket through the same line.
	 */
	$effect(() => {
		if (!open) return;

		const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		const started = new VoiceCall({
			modelId,
			tokenEndpoint: `/assistant/realtime/token?tz=${encodeURIComponent(timeZone)}`,
			runTool
		});
		call = started;
		void started.start();

		return () => {
			started.end();
			call = null;
		};
	});

	/**
	 * A tool call, relayed to the server and run there with this caller's
	 * session. The body is the tool's output whatever it is; a request that
	 * failed outright becomes an output the model can say out loud, because a
	 * tool call with no output at all would leave it waiting for one.
	 */
	async function runTool({ name, input }: VoiceToolCall): Promise<VoiceToolResult> {
		const response = await fetch('/assistant/realtime/tool', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name, input })
		});
		const body = await response.json().catch(() => null);
		if (response.ok) return body;

		// A refusal is SvelteKit's own error body; anything else is a relay that
		// did not arrive at all, and both have to become something to say.
		const refusal = refusalSchema.safeParse(body);
		return { error: refusal.success ? refusal.data.message : 'That could not be run.' };
	}

	const phase = $derived<CallState>(call?.state ?? 'connecting');
	const turn = $derived(lastTurn(call?.messages ?? []));
	const caption = $derived(captionOf(turn));

	/**
	 * How fast the orb turns. Not decoration: it is the one place the state
	 * shows at a glance, so the differences are wide enough to read across a
	 * room — barely moving while it waits, quick while it is looking something
	 * up, steady while it talks.
	 */
	const SPEED = {
		idle: 0.4,
		connecting: 0.5,
		listening: 1,
		thinking: 2.4,
		speaking: 1.6,
		failed: 0.3
	} satisfies Record<CallState, number>;

	/** The orb swells with the caller's own voice, and only then: while the
	    assistant is talking the microphone is hearing an echo-cancelled room,
	    and a swell from that would be the orb reacting to itself. */
	const level = $derived(phase === 'listening' && call ? call.level : 0);

	/**
	 * The one line under the orb. A call that hung up itself says why, a call
	 * about to reach one of its limits says so while there is still time to do
	 * something about it, and otherwise it is what the assistant is doing. The
	 * words for the first two are `$lib/ai/realtime`'s, beside the deadlines
	 * they belong to.
	 */
	const status = $derived(call?.ended ?? call?.notice ?? call?.activity ?? callStatusLabel(phase));
</script>

<Dialog.Root
	{open}
	onOpenChange={(next) => {
		if (!next) onClose();
	}}
>
	<Dialog.Content
		showCloseButton={false}
		class="bg-background inset-0 flex h-dvh w-dvw max-w-none translate-x-0 translate-y-0 flex-col items-center justify-between gap-0 rounded-none border-0 p-0 shadow-none sm:max-w-none"
	>
		<Dialog.Title class="sr-only">Talking to the assistant</Dialog.Title>
		<Dialog.Description class="sr-only">
			Speak to ask about {workspace}. Press Escape to hang up.
		</Dialog.Description>

		<!-- The way out, in the corner, so nothing competes with the orb. -->
		<div class="flex w-full items-center justify-between px-4 py-4 sm:px-6">
			<p class="text-muted-foreground truncate text-xs font-medium tracking-wide uppercase">
				{workspace}
			</p>
			<Button
				variant="ghost"
				size="icon"
				class="text-muted-foreground hover:text-foreground size-9 rounded-full"
				aria-label="Hang up"
				onclick={onClose}
			>
				<XIcon class="size-5" />
			</Button>
		</div>

		<div class="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-4">
			<div class="breath" data-speaking={phase === 'speaking' ? '' : undefined}>
				<Orb size={240} {level} speed={SPEED[phase]} />
			</div>

			<div class="flex max-w-xl flex-col items-center gap-3 text-center">
				<p class="text-muted-foreground text-sm" aria-live="polite">{status}</p>

				<!-- The transcript, one turn deep: enough to check a name, not
				     enough to read instead of listening. -->
				{#if caption}
					<p
						class={[
							'text-lg leading-snug text-balance',
							turn?.role === 'user' ? 'text-muted-foreground' : 'text-foreground'
						]}
					>
						{caption}
					</p>
				{/if}

				{#if call?.failure}
					<div class="mt-2 flex w-full flex-wrap items-center justify-center gap-3">
						<FormAlert class="mb-0 flex-1 text-left" message={call.failure} />
						<Button variant="outline" size="sm" onclick={() => call?.retry()}>Try again</Button>
					</div>
				{/if}
			</div>
		</div>

		<!-- A call that has hung up has nothing to mute and nothing to end: the
		     one thing left to do with it is start another. -->
		<div class="flex w-full items-center justify-center gap-4 px-6 pt-4 pb-10">
			{#if call?.ended}
				<Button variant="secondary" class="h-12 rounded-full px-6" onclick={() => call?.retry()}>
					<PhoneIcon class="size-4" />
					Call again
				</Button>
			{:else}
				<Button
					variant="secondary"
					size="icon"
					class="size-14 rounded-full"
					aria-label={call?.muted ? 'Unmute' : 'Mute'}
					aria-pressed={call?.muted ?? false}
					disabled={!call}
					onclick={() => call?.toggleMute()}
				>
					{#if call?.muted}
						<MicOffIcon class="size-5" />
					{:else}
						<MicIcon class="size-5" />
					{/if}
				</Button>
				<Button
					variant="destructive"
					size="icon"
					class="size-14 rounded-full"
					aria-label="End call"
					onclick={onClose}
				>
					<PhoneIcon class="size-5 rotate-[135deg]" />
				</Button>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>

<style>
	/* A voice has a rhythm the level meter cannot see — the microphone is
	   hearing an echo-cancelled room while the assistant talks — so speaking
	   gets a slow breath of its own rather than a flat orb. */
	.breath[data-speaking] {
		animation: breathe 2.6s ease-in-out infinite;
	}

	@keyframes breathe {
		0%,
		100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.045);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.breath[data-speaking] {
			animation: none;
		}
	}
</style>
