<script lang="ts">
	import SvelteMarkdown, {
		buildUnsupportedHTML,
		excludeRenderersOnly
	} from '@humanspeak/svelte-markdown';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * A `text` part of an assistant message, rendered as markdown. Model output
	 * is untrusted, so it is rendered to components rather than HTML: raw HTML
	 * in the text comes out as escaped text, never as markup, and links keep
	 * the renderer's protocol allowlist. Images are dropped — the CSP admits no
	 * origin a model could name, so they would render broken anyway.
	 */
	let {
		ref = $bindable(null),
		class: className,
		text,
		streamId,
		streaming = false,
		...restProps
	}: Omit<WithElementRef<HTMLAttributes<HTMLDivElement>>, 'children'> & {
		text: string;
		/**
		 * Identifies the part being written, so the parser starts afresh on a
		 * new one instead of treating it as the last one having changed.
		 */
		streamId?: string;
		/** Whether words are still arriving — what puts the caret at the end. */
		streaming?: boolean;
	} = $props();

	const RENDERERS = { ...excludeRenderersOnly(['image']), html: buildUnsupportedHTML() };
	// Two messages with the same heading text would otherwise share an id.
	const OPTIONS = { headerIds: false };
</script>

<div
	bind:this={ref}
	data-slot="assistant-markdown"
	data-streaming={streaming ? '' : undefined}
	class={cn(
		'text-sm leading-relaxed wrap-break-word',
		'[&_p]:my-2 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
		'[&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5',
		'[&_a]:underline [&_a]:underline-offset-2 [&_strong]:font-semibold',
		'[&_code]:bg-muted [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]',
		'[&_pre]:bg-muted [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0',
		'[&_th]:border-border [&_td]:border-border [&_table]:my-2 [&_table]:w-full [&_table]:text-left [&_td]:border-b [&_td]:py-1 [&_td]:pr-3 [&_th]:border-b [&_th]:pr-3 [&_th]:pb-1 [&_th]:font-medium',
		'[&_blockquote]:border-border [&_blockquote]:text-muted-foreground [&_blockquote]:border-l-2 [&_blockquote]:pl-3',
		className
	)}
	{...restProps}
>
	<!--
		`streaming` is the renderer's incremental parser, and it is not optional
		here: left off (its default), every token re-hashes and re-parses the
		whole message — the cache never hits, because the source grows with each
		delta — and the cost of an answer is quadratic in its length. On it, the
		parser reuses the tokens it already has and diffs the rest in place. It
		stays on for a stored thread too: a message rendered once costs one parse
		either way, and flipping the mode as a turn ends would tear the parser
		down at the exact moment the last word lands.
	-->
	<SvelteMarkdown streaming {streamId} source={text} renderers={RENDERERS} options={OPTIONS} />
</div>

<style>
	/*
	 * The caret that follows the words in.
	 *
	 * It is a `::after` on whatever block the renderer produced last, rather
	 * than an element of our own after the output, because the renderer emits
	 * block elements — a sibling would drop onto its own line instead of
	 * sitting at the end of the sentence. This way it follows the text and
	 * wraps with it.
	 *
	 * It does not blink. A blinking caret says "waiting for you"; a solid one
	 * says the machine is writing, which is what is actually happening — and it
	 * simply goes when the answer is done.
	 *
	 * `1.05em` against `text-bottom` keeps it shorter than the line box, so it
	 * can never grow the line height as it appears and disappears.
	 */
	[data-streaming] :global(> *:last-child::after) {
		content: '';
		display: inline-block;
		width: 2px;
		height: 1.05em;
		margin-left: 1.5px;
		translate: 0 -0.5px;
		border-radius: 1px;
		background: var(--foreground);
		vertical-align: text-bottom;
	}
</style>
