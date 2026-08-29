<script lang="ts" module>
	export type PasswordRule = {
		id: string;
		label: string;
		test: (value: string) => boolean;
	};

	export type EvaluatedRule = PasswordRule & { met: boolean };

	const COMMON =
		/^(?:password|passw0rd|qwerty|letmein|welcome|admin|iloveyou|monkey|dragon|abc123|111111|123123|123456)/i;
	const RUN = /(.)\1{3,}/;
	const RUN_UP = /(?:0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|defg|qwer|wert|erty|asdf)/i;
	const SYMBOL = /[!-/:-@[-`{-~]/;

	export const defaultPasswordRules: readonly PasswordRule[] = [
		{ id: 'length', label: '12 characters or more', test: (v) => v.length >= 12 },
		{
			id: 'case',
			label: 'Upper and lower case',
			test: (v) => /[a-z]/.test(v) && /[A-Z]/.test(v)
		},
		{ id: 'digit', label: 'A number', test: (v) => /\d/.test(v) },
		{ id: 'symbol', label: 'A symbol', test: (v) => SYMBOL.test(v) }
	];

	export const defaultPasswordLabels: readonly string[] = [
		'Empty',
		'Weak',
		'Fair',
		'Good',
		'Strong'
	];

	type Tone = { bar: string; text: string };

	const TONES = {
		none: { bar: 'bg-muted-foreground/50', text: 'text-muted-foreground' },
		danger: { bar: 'bg-red-500', text: 'text-red-600 dark:text-red-400' },
		caution: { bar: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
		safe: { bar: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' }
	} satisfies Record<'none' | 'danger' | 'caution' | 'safe', Tone>;

	function toneFor(score: number, max: number): Tone {
		if (score === 0) return TONES.none;
		const ratio = score / max;
		if (ratio <= 0.34) return TONES.danger;
		if (ratio <= 0.67) return TONES.caution;
		return TONES.safe;
	}
</script>

<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { motionTo } from '$lib/motion.js';

	/** A bar filling, and a rule's tick landing. */
	const CELL = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;
	/** Labels and fills trading places as the score moves. */
	const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;

	export interface PasswordStrengthProps extends Omit<
		HTMLAttributes<HTMLDivElement>,
		'class' | 'children'
	> {
		value: string;
		rules?: readonly PasswordRule[];
		labels?: readonly string[];
		announceDelay?: number;
		showRules?: boolean;
		class?: string;
	}

	let {
		class: className,
		value,
		rules = defaultPasswordRules,
		labels = defaultPasswordLabels,
		announceDelay = 700,
		showRules = true,
		...restProps
	}: PasswordStrengthProps = $props();

	const evaluated = $derived(rules.map((rule) => ({ ...rule, met: rule.test(value) })));
	const passed = $derived(evaluated.reduce((n, r) => n + (r.met ? 1 : 0), 0));
	// Common passwords, four-character repeats and keyboard walks are capped at
	// one segment no matter how many rules they satisfy.
	const guessable = $derived(
		value.length > 0 && (COMMON.test(value) || RUN.test(value) || RUN_UP.test(value))
	);
	const max = $derived(rules.length);
	const score = $derived(
		value.length === 0 ? 0 : guessable ? 1 : Math.min(max, Math.max(1, passed))
	);
	const label = $derived(labels[Math.min(score, labels.length - 1)] ?? '');
	const tone = $derived(toneFor(score, max));

	const announcement = $derived.by(() => {
		if (value.length === 0) return '';
		const unmet = evaluated.filter((r) => !r.met);
		return [
			`Password strength ${label.toLowerCase()}.`,
			guessable ? 'This is a commonly guessed pattern.' : '',
			unmet.length === 0
				? 'All requirements met.'
				: `Still needed: ${unmet.map((r) => r.label.toLowerCase()).join(', ')}.`
		]
			.filter(Boolean)
			.join(' ');
	});

	// A screen reader hears the verdict once, after typing stops, instead of a
	// new announcement per keystroke.
	let settled = $state('');
	let announceTimer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		if (announcement === '') {
			settled = '';
			return;
		}
		const next = announcement;
		announceTimer = setTimeout(
			() => {
				settled = next;
			},
			Math.max(0, announceDelay)
		);
		return () => clearTimeout(announceTimer);
	});

	onDestroy(() => {
		if (announceTimer) clearTimeout(announceTimer);
	});
</script>

<div data-slot="password-strength" class={cn('w-full', className)} {...restProps}>
	<div
		role="meter"
		aria-label="Password strength"
		aria-valuemin={0}
		aria-valuemax={max}
		aria-valuenow={score}
		aria-valuetext={label}
		class="grid gap-1.5"
		style:grid-template-columns={`repeat(${max}, minmax(0, 1fr))`}
	>
		{#each evaluated as rule, i (rule.id)}
			<div class="bg-foreground/10 relative h-1.5 overflow-hidden rounded-[2px]">
				<span
					class={cn('absolute inset-0 rounded-[2px] transition-colors duration-200', tone.bar)}
					style:transform-origin="left"
					style:will-change="transform"
					{@attach motionTo(() => ({
						keyframes: { scaleX: i < score ? 1 : 0 },
						// Filling bars stagger; emptying ones all go at once, so a
						// weakened password reads as one correction rather than a wave.
						transition: { ...CELL, delay: i < score ? i * 0.03 : 0 }
					}))}
				></span>
			</div>
		{/each}
	</div>

	<div class="mt-2 flex h-5 items-center justify-between gap-3">
		<span class="inline-grid text-[12.5px] leading-5 font-medium">
			{#each labels as text, i (text)}
				<span
					aria-hidden="true"
					class={cn('col-start-1 row-start-1 whitespace-nowrap', tone.text)}
					{@attach motionTo(() => ({
						keyframes: { opacity: i === Math.min(score, labels.length - 1) ? 1 : 0 },
						transition: CROSSFADE
					}))}
				>
					{text}
				</span>
			{/each}
		</span>

		<span
			aria-hidden="true"
			class="text-[11.5px] leading-5 whitespace-nowrap text-amber-600 dark:text-amber-400"
			{@attach motionTo(() => ({
				keyframes: { opacity: guessable ? 1 : 0 },
				transition: CROSSFADE
			}))}
		>
			Commonly guessed
		</span>
	</div>

	{#if showRules}
		<ul class="mt-3 grid gap-1.5">
			{#each evaluated as rule (rule.id)}
				<li class="flex items-center gap-2">
					<span
						class="border-border text-card relative grid size-[14px] shrink-0 place-items-center rounded-[4px] border"
					>
						<span
							class="absolute inset-0 rounded-[3px] bg-emerald-500"
							{@attach motionTo(() => ({
								keyframes: { opacity: rule.met ? 1 : 0 },
								transition: CROSSFADE
							}))}
						></span>
						<svg
							viewBox="0 0 12 12"
							fill="none"
							aria-hidden="true"
							class="relative size-[9px]"
							{@attach motionTo(() => ({
								keyframes: { opacity: rule.met ? 1 : 0, scale: rule.met ? 1 : 0.6 },
								transition: CELL
							}))}
						>
							<path
								d="M2 6.2 4.7 8.9 10 3.3"
								stroke="currentColor"
								stroke-width="1.9"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</span>
					<span
						class={cn(
							'text-[12.5px] leading-5 transition-colors duration-200',
							rule.met ? 'text-foreground' : 'text-muted-foreground'
						)}
					>
						{rule.label}
					</span>
					<span class="sr-only">{rule.met ? 'met' : 'not met'}</span>
				</li>
			{/each}
		</ul>
	{/if}

	<p aria-live="polite" class="sr-only">{settled}</p>
</div>
