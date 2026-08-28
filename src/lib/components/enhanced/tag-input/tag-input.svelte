<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	import { cn } from '$lib/utils.js';
	import { motionFlip, motionTo, motionTransition } from '$lib/motion.js';

	/** A chip arriving, leaving, or sliding as its neighbours change. */
	const CHIP = { type: 'spring', stiffness: 700, damping: 46, mass: 0.5 } as const;
	/** The hint under the field handing over to the message. */
	const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;
	const STILL = { duration: 0 } as const;

	export type TagRejection = 'duplicate' | 'limit' | 'invalid';

	export interface TagInputProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
		/** The tags. Bindable — bind to it, or read every committed change from `onChange`. */
		value?: string[];
		/** Fires once per committed change, never per keystroke. */
		onChange?: (tags: string[]) => void;
		/** Hard ceiling. Reaching it shows the limit message and reveals a reserved-width counter. */
		max?: number;
		/** Characters that commit the draft. Enter always commits; newlines and tabs always split a paste. */
		separators?: string[];
		allowDuplicates?: boolean;
		/** Runs on the trimmed, whitespace-collapsed candidate before it is added. */
		validate?: (candidate: string, tags: string[]) => boolean;
		/** Rendered as a real label bound to the field. Without it the input falls back to aria-label. */
		label?: string;
		placeholder?: string;
		/** Persistent description. Rejection messages cross-fade over it in the same grid cell. */
		hint?: string;
	}

	const clean = (raw: string) => raw.trim().replace(/\s+/g, ' ');

	const splitter = (separators: string[]) =>
		new RegExp(`[${separators.map((s) => s.replace(/[\\\]^-]/g, '\\$&')).join('')}\\n\\r\\t]+`);

	let {
		class: className,
		value = $bindable([]),
		onChange,
		max,
		separators = [','],
		allowDuplicates = false,
		validate,
		label,
		placeholder = 'Add a tag',
		hint = 'Enter adds · Backspace removes',
		...restProps
	}: TagInputProps = $props();

	const uid = $props.id();
	const inputId = `${uid}-tag-input`;
	const hintId = `${uid}-tag-hint`;

	let field = $state<HTMLInputElement | null>(null);
	let draft = $state('');
	let armed = $state(-1);
	let rejection = $state<{ reason: TagRejection; tag: string; visible: boolean } | null>(null);
	let flashed = $state<string | null>(null);
	let announcement = $state('');

	let rejectTimer: ReturnType<typeof setTimeout> | null = null;
	let flashTimer: ReturnType<typeof setTimeout> | null = null;

	onDestroy(() => {
		if (rejectTimer) clearTimeout(rejectTimer);
		if (flashTimer) clearTimeout(flashTimer);
	});

	const tags = $derived(value);
	const armedIndex = $derived(armed >= tags.length ? -1 : armed);

	/** Repeated values still need stable keys, so the second "motion" is `motion#1`. */
	const rows = $derived.by(() => {
		// A null-prototype record rather than a Map: this is a throwaway tally
		// inside a pure computation, not reactive state, and a tag may legally be
		// named `__proto__`.
		const seen: Record<string, number> = Object.create(null);
		return tags.map((tag) => {
			const n = seen[tag] ?? 0;
			seen[tag] = n + 1;
			return { tag, key: n === 0 ? tag : `${tag}#${n}` };
		});
	});

	const message = $derived(
		!rejection
			? ''
			: rejection.reason === 'duplicate'
				? `${rejection.tag} is already in the list`
				: rejection.reason === 'limit'
					? `That is the limit of ${max} tags`
					: `${rejection.tag} is not allowed here`
	);

	const showMessage = $derived(rejection?.visible === true);

	function dismiss() {
		if (rejectTimer) clearTimeout(rejectTimer);
		rejectTimer = null;
		if (rejection?.visible) rejection = { ...rejection, visible: false };
	}

	function refuse(reason: TagRejection, tag: string) {
		if (rejectTimer) clearTimeout(rejectTimer);
		rejection = { reason, tag, visible: true };
		rejectTimer = setTimeout(() => {
			if (rejection) rejection = { ...rejection, visible: false };
		}, 2400);

		announcement =
			reason === 'duplicate'
				? `${tag} is already in the list.`
				: reason === 'limit'
					? `That is the limit of ${max} tags.`
					: `${tag} is not allowed here.`;

		if (reason !== 'duplicate') return;
		if (flashTimer) clearTimeout(flashTimer);
		flashed = tag;
		flashTimer = setTimeout(() => {
			flashed = null;
		}, 460);
	}

	function apply(next: string[]) {
		value = next;
		onChange?.(next);
	}

	function add(raws: string[]): boolean {
		const next = [...tags];
		let added = 0;
		let failure: { reason: TagRejection; tag: string } | null = null;

		for (const raw of raws) {
			const candidate = clean(raw);
			if (!candidate) continue;

			if (max !== undefined && next.length >= max) {
				failure = { reason: 'limit', tag: candidate };
				break;
			}

			if (!allowDuplicates) {
				const twin = next.find((t) => t.toLowerCase() === candidate.toLowerCase());
				if (twin) {
					failure = { reason: 'duplicate', tag: twin };
					continue;
				}
			}

			if (validate && !validate(candidate, next)) {
				failure = { reason: 'invalid', tag: candidate };
				continue;
			}

			next.push(candidate);
			added += 1;
		}

		if (added > 0) {
			apply(next);
			draft = '';
			armed = -1;
			dismiss();
			announcement = `${added === 1 ? next[next.length - 1] : `${added} tags`} added, ${next.length} total.`;
		}

		if (failure) refuse(failure.reason, failure.tag);
		return added > 0;
	}

	function removeAt(index: number) {
		if (index < 0 || index >= tags.length) return;
		const gone = tags[index];
		const next = tags.filter((_, i) => i !== index);
		apply(next);
		armed = -1;
		dismiss();
		announcement = `${gone} removed, ${next.length} left.`;
	}

	function arm(index: number) {
		armed = index;
		announcement = `${tags[index]} selected, press Backspace again to remove it.`;
	}

	function handleInput() {
		armed = -1;
		dismiss();
	}

	function handleKeyDown(event: KeyboardEvent & { currentTarget: HTMLInputElement }) {
		// A held candidate in an IME owns Enter until the composition closes.
		if (event.isComposing) return;

		if (event.key === 'Enter' || separators.includes(event.key)) {
			event.preventDefault();
			add([draft]);
			return;
		}

		if (event.key === 'Backspace' && draft === '') {
			event.preventDefault();
			if (event.repeat) return;
			if (armedIndex >= 0) removeAt(armedIndex);
			else if (tags.length > 0) arm(tags.length - 1);
			return;
		}

		if (event.key === 'Delete' && armedIndex >= 0) {
			event.preventDefault();
			if (event.repeat) return;
			removeAt(armedIndex);
			return;
		}

		if (event.key === 'ArrowLeft') {
			const start = event.currentTarget.selectionStart;
			const end = event.currentTarget.selectionEnd;
			if (start !== 0 || end !== 0 || tags.length === 0) return;
			event.preventDefault();
			arm(armedIndex < 0 ? tags.length - 1 : Math.max(0, armedIndex - 1));
			return;
		}

		if (event.key === 'ArrowRight' && armedIndex >= 0) {
			event.preventDefault();
			if (armedIndex >= tags.length - 1) armed = -1;
			else arm(armedIndex + 1);
			return;
		}

		// Escape only disarms, so a surrounding dialog still closes on the next press.
		if (event.key === 'Escape' && armedIndex >= 0) {
			event.preventDefault();
			armed = -1;
		}
	}

	function handlePaste(event: ClipboardEvent) {
		const text = event.clipboardData?.getData('text') ?? '';
		const pattern = splitter(separators);
		if (!pattern.test(text)) return;
		event.preventDefault();
		add(text.split(pattern));
	}

	function handleShellPointerDown(event: PointerEvent & { currentTarget: HTMLUListElement }) {
		if (event.target !== event.currentTarget) return;
		event.preventDefault();
		field?.focus();
	}
</script>

<div {...restProps} data-slot="tag-input" class={cn('w-full', className)}>
	{#if label}
		<label for={inputId} class="text-foreground mb-1.5 block text-[12.5px] font-medium">
			{label}
		</label>
	{/if}

	<ul
		onpointerdown={handleShellPointerDown}
		class="border-border bg-muted/60 focus-within:border-ring focus-within:bg-card relative flex max-h-[116px] min-h-10 list-none flex-wrap items-center gap-1.5 overflow-y-auto overscroll-contain rounded-[10px] border-2 p-[4px] shadow-[inset_0_1px_2px_rgba(28,25,23,0.07)] transition-[background-color,border-color,box-shadow] duration-150 focus-within:shadow-none dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)]"
	>
		{#each rows as row, index (row.key)}
			{@const lit = armedIndex === index || flashed === row.tag}
			<li
				animate:motionFlip={{ transition: CHIP }}
				in:motionTransition={{
					keyframes: { opacity: [0, 1], scale: [0.9, 1] },
					transition: CHIP,
					reduced: { keyframes: { opacity: 1 }, transition: STILL }
				}}
				out:motionTransition={{
					keyframes: { opacity: 0, scale: 0.9 },
					transition: CHIP,
					reduced: { keyframes: { opacity: 0 }, transition: STILL }
				}}
				class={cn(
					'flex h-6 max-w-full shrink-0 items-center gap-1 rounded-[6px] border pr-1.5 pl-2 text-[12.5px] transition-[background-color,border-color,box-shadow,color] duration-150 select-none',
					lit
						? 'border-foreground bg-foreground text-background shadow-[0_1px_2px_rgba(28,25,23,0.18)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.4)]'
						: 'border-border bg-card text-foreground shadow-[inset_0_1.5px_0_rgba(255,255,255,0.95),inset_0_-1px_0_rgba(28,25,23,0.06),0_1px_2px_rgba(28,25,23,0.08)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_1px_2px_rgba(0,0,0,0.4)]'
				)}
			>
				<span class="truncate">{row.tag}</span>
				<button
					type="button"
					tabindex={-1}
					aria-label={`Remove ${row.tag}`}
					onmousedown={(event) => event.preventDefault()}
					onclick={() => {
						removeAt(index);
						field?.focus();
					}}
					class={cn(
						'-mr-0.5 grid size-[14px] shrink-0 place-items-center rounded-[5px] transition-colors duration-150',
						lit
							? 'text-background/70 hover:text-background'
							: 'text-muted-foreground hover:text-foreground'
					)}
				>
					<svg
						viewBox="0 0 10 10"
						aria-hidden="true"
						class="size-[9px]"
						fill="none"
						stroke="currentColor"
						stroke-width="1.6"
						stroke-linecap="round"
					>
						<path d="M2.6 2.6 7.4 7.4M7.4 2.6 2.6 7.4" />
					</svg>
				</button>
			</li>
		{/each}

		<li class="relative flex h-6 flex-1">
			<!-- The draft's own width, measured invisibly, is what the field grows into. -->
			<span
				aria-hidden="true"
				class="pointer-events-none invisible max-w-56 overflow-hidden px-1 text-[12.5px] whitespace-pre"
			>
				{draft || placeholder}
			</span>
			<input
				bind:this={field}
				id={inputId}
				type="text"
				bind:value={draft}
				aria-describedby={hintId}
				aria-label={label ? undefined : 'Tags'}
				{placeholder}
				autocomplete="off"
				autocapitalize="off"
				autocorrect="off"
				spellcheck="false"
				enterkeyhint="done"
				oninput={handleInput}
				onkeydown={handleKeyDown}
				onpaste={handlePaste}
				onblur={() => (armed = -1)}
				class="text-foreground placeholder:text-muted-foreground absolute inset-0 h-full w-full bg-transparent px-1 text-[12.5px] outline-none"
			/>
		</li>
	</ul>

	<div class="mt-1.5 flex items-baseline justify-between gap-3">
		<div class="grid min-w-0 flex-1">
			<p
				id={hintId}
				class={cn('text-muted-foreground col-start-1 row-start-1 truncate text-[11.5px]')}
				{@attach motionTo(() => ({
					keyframes: { opacity: showMessage ? 0 : 1 },
					transition: CROSSFADE
				}))}
			>
				{hint}
			</p>
			<p
				aria-hidden="true"
				class={cn('text-foreground col-start-1 row-start-1 truncate text-[11.5px]')}
				{@attach motionTo(() => ({
					keyframes: { opacity: showMessage ? 1 : 0 },
					transition: CROSSFADE
				}))}
			>
				{message}
			</p>
		</div>

		{#if max !== undefined}
			<p class="text-muted-foreground shrink-0 text-[11.5px] tabular-nums">
				<span class="inline-grid justify-items-end">
					<span aria-hidden="true" class="invisible col-start-1 row-start-1">{max}</span>
					<span class="col-start-1 row-start-1">{tags.length}</span>
				</span>
				<span> / {max}</span>
			</p>
		{/if}
	</div>

	<span role="status" aria-live="polite" aria-atomic="true" class="sr-only">{announcement}</span>
</div>
