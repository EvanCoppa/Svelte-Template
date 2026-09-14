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
		...restProps
	}: Omit<WithElementRef<HTMLAttributes<HTMLDivElement>>, 'children'> & {
		text: string;
	} = $props();

	const RENDERERS = { ...excludeRenderersOnly(['image']), html: buildUnsupportedHTML() };
	// Two messages with the same heading text would otherwise share an id.
	const OPTIONS = { headerIds: false };
</script>

<div
	bind:this={ref}
	data-slot="assistant-markdown"
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
	<SvelteMarkdown source={text} renderers={RENDERERS} options={OPTIONS} />
</div>
