<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ImageIcon from '@lucide/svelte/icons/image';
	import PaletteIcon from '@lucide/svelte/icons/palette';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import SlidersHorizontalIcon from '@lucide/svelte/icons/sliders-horizontal';
	import TypeIcon from '@lucide/svelte/icons/type';
	import { SegmentedControl } from '$lib/components/enhanced/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import type { ComboboxOption } from '$lib/components/ui/combobox/combobox.js';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Slider } from '$lib/components/ui/slider/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { BINDINGS } from '$lib/slides/bindings';
	import { templateFor } from '$lib/slides/registry';
	import type { StyleControl } from '$lib/slides/styles';
	import type { SlideContent, SlideInstance } from '$lib/slides/types';
	import ImageSlotControl from './image-slot.svelte';

	/**
	 * The right pane: everything the author can set on the selected slide,
	 * rendered from the template's registry entry — text slots (drawn by the
	 * `kind` each one declares), colours, typography, images. No template has
	 * a section of its own.
	 */
	let {
		slide,
		onchange
	}: { slide: SlideInstance | null; onchange: (id: string, content: SlideContent) => void } =
		$props();

	const template = $derived(slide ? templateFor(slide.templateId) : null);

	const NONE = '';
	const bindingOptions: ComboboxOption[] = [
		{ value: NONE, label: 'Typed here' },
		...BINDINGS.map((binding) => ({ value: binding.path, label: binding.label }))
	];

	/** A record without one key — how a binding or a style override is cleared. */
	function without<T>(record: Record<string, T>, key: string): Record<string, T> {
		return Object.fromEntries(Object.entries(record).filter(([entry]) => entry !== key));
	}

	function patch(part: Partial<SlideContent>) {
		if (slide) onchange(slide.id, { ...slide.content, ...part });
	}

	function setText(key: string, value: string) {
		if (slide) patch({ text: { ...slide.content.text, [key]: value } });
	}

	function setBinding(key: string, path: string) {
		if (!slide) return;
		const rest = without(slide.content.variables, key);
		patch({ variables: path === NONE ? rest : { ...rest, [key]: { sourceField: path } } });
	}

	function setColor(key: string, value: string) {
		if (slide) patch({ colors: { ...slide.content.colors, [key]: value } });
	}

	function setImage(key: string, url: string) {
		if (slide) patch({ images: { ...slide.content.images, [key]: url } });
	}

	/** Blank resets: the key is dropped so the template's own CSS fallback returns. */
	function setStyle(key: string, value: string) {
		if (!slide) return;
		const rest = without(slide.content.styles, key);
		patch({ styles: value === '' ? rest : { ...rest, [key]: value } });
	}

	function styleValue(control: StyleControl): string {
		return slide?.content.styles[control.key] ?? '';
	}

	function sliderValue(control: StyleControl): number {
		const raw = Number(styleValue(control));
		return styleValue(control) !== '' && Number.isFinite(raw) ? raw : (control.default ?? 1);
	}

	/** A choice control with "Default" first, so an unset value has a segment to sit on. */
	function choices(control: StyleControl) {
		return [{ value: NONE, label: 'Default' }, ...(control.options ?? [])];
	}

	const activeStyles = $derived(
		template?.styleControls.filter((control) => styleValue(control) !== '').length ?? 0
	);

	let textOpen = $state(true);
	let colorsOpen = $state(true);
	let stylesOpen = $state(true);
	let imagesOpen = $state(true);
</script>

{#snippet header(Icon: typeof TypeIcon, tint: string, title: string, badge: string)}
	<Collapsible.Trigger
		class="group flex w-full items-center justify-between rounded-lg px-2 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-gray-900"
	>
		<div class="flex items-center gap-2">
			<div class="flex size-6 items-center justify-center rounded-md {tint}">
				<Icon class="size-3.5" />
			</div>
			<span class="text-[13px] font-medium text-gray-900 dark:text-gray-100">{title}</span>
			{#if badge}
				<span class="text-[11px] font-normal text-gray-400 dark:text-gray-500">{badge}</span>
			{/if}
		</div>
		<ChevronDownIcon
			class="size-4 text-gray-400 transition-transform duration-200 group-data-[state=open]:rotate-180"
		/>
	</Collapsible.Trigger>
{/snippet}

<div class="h-full min-h-0 overflow-y-auto overscroll-y-contain bg-white pb-36 dark:bg-gray-950">
	{#if !slide || !template}
		<div class="flex h-full flex-col items-center justify-center p-6 text-center">
			<div class="flex size-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
				<TypeIcon class="size-5 text-gray-400" />
			</div>
			<p class="mt-3 text-sm font-medium text-gray-500 dark:text-gray-400">No slide selected</p>
			<p class="mt-1 text-xs text-gray-400 dark:text-gray-500">Select a slide to start editing</p>
		</div>
	{:else}
		<div class="space-y-1 p-3">
			<Collapsible.Root bind:open={textOpen}>
				{@render header(
					TypeIcon,
					'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300',
					'Text content',
					String(template.text.length)
				)}
				<Collapsible.Content>
					<div class="space-y-3 px-1 pt-1 pb-2">
						{#each template.text as field (field.key)}
							{@const bound = slide.content.variables[field.key]?.sourceField ?? NONE}
							{#if field.kind === 'toggle'}
								<div class="flex items-center justify-between gap-3 px-1">
									<label
										for="text-{slide.id}-{field.key}"
										class="text-[12px] leading-none font-medium text-gray-600 dark:text-gray-300"
									>
										{field.label}
									</label>
									<Switch
										id="text-{slide.id}-{field.key}"
										checked={(slide.content.text[field.key] ?? field.default) === 'true'}
										onCheckedChange={(checked) => setText(field.key, checked ? 'true' : 'false')}
									/>
								</div>
							{:else}
								<div class="space-y-1.5">
									<label
										for="text-{slide.id}-{field.key}"
										class="text-[12px] leading-none font-medium text-gray-600 dark:text-gray-300"
									>
										{field.label}
									</label>
									{#if field.kind === 'multiline'}
										<Textarea
											id="text-{slide.id}-{field.key}"
											value={slide.content.text[field.key] ?? ''}
											class="min-h-20 text-[13px] leading-relaxed"
											placeholder={field.default || 'Enter text…'}
											onchange={(event) => setText(field.key, event.currentTarget.value)}
										/>
									{:else if field.kind === 'number'}
										<Input
											id="text-{slide.id}-{field.key}"
											type="number"
											value={slide.content.text[field.key] ?? ''}
											class="h-8 text-[13px]"
											placeholder={field.default || '0'}
											onchange={(event) => setText(field.key, event.currentTarget.value)}
										/>
									{:else}
										<Input
											id="text-{slide.id}-{field.key}"
											value={slide.content.text[field.key] ?? ''}
											class="h-8 text-[13px]"
											placeholder={field.default || 'Enter text…'}
											onchange={(event) => setText(field.key, event.currentTarget.value)}
										/>
										<Combobox
											id="bind-{slide.id}-{field.key}"
											options={bindingOptions}
											value={bound}
											onchange={(path) => setBinding(field.key, path)}
											placeholder="Typed here"
										/>
									{/if}
								</div>
							{/if}
						{/each}
					</div>
				</Collapsible.Content>
			</Collapsible.Root>

			<Collapsible.Root bind:open={colorsOpen}>
				{@render header(
					PaletteIcon,
					'bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-300',
					'Colors',
					String(template.colors.length)
				)}
				<Collapsible.Content>
					<div class="space-y-2.5 px-1 pt-1 pb-2">
						{#each template.colors as color (color.key)}
							<div class="flex items-center justify-between gap-3 px-1">
								<label
									for="color-{slide.id}-{color.key}"
									class="text-[12px] leading-none font-medium text-gray-600 dark:text-gray-300"
								>
									{color.label}
								</label>
								<Input
									id="color-{slide.id}-{color.key}"
									type="color"
									class="h-8 w-14 cursor-pointer p-1"
									value={slide.content.colors[color.key] || color.default}
									oninput={(event) => setColor(color.key, event.currentTarget.value)}
								/>
							</div>
						{/each}
					</div>
				</Collapsible.Content>
			</Collapsible.Root>

			{#if template.styleControls.length > 0}
				<Collapsible.Root bind:open={stylesOpen}>
					{@render header(
						SlidersHorizontalIcon,
						'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300',
						'Typography & layout',
						activeStyles > 0 ? `${String(activeStyles)} set` : ''
					)}
					<Collapsible.Content>
						<div class="space-y-3.5 px-1 pt-1 pb-2">
							{#each template.styleControls as control (control.key)}
								{@const value = styleValue(control)}
								<div class="space-y-2">
									<div class="flex items-center justify-between gap-2">
										<span
											class="text-[12px] leading-none font-medium text-gray-600 dark:text-gray-300"
										>
											{control.label}
										</span>
										<div class="flex items-center gap-1.5">
											{#if control.type === 'scale'}
												<span
													class="text-[11px] font-medium tabular-nums {value
														? 'text-blue-600 dark:text-blue-400'
														: 'text-gray-400'}"
												>
													{value && control.format
														? control.format(sliderValue(control))
														: 'Default'}
												</span>
											{/if}
											{#if value}
												<Button
													variant="ghost"
													size="icon"
													class="size-4 text-gray-300 hover:text-blue-500"
													aria-label="Reset to template default"
													onclick={() => setStyle(control.key, '')}
												>
													<RotateCcwIcon class="size-3" />
												</Button>
											{/if}
										</div>
									</div>
									{#if control.type === 'scale'}
										<Slider
											type="single"
											min={control.min}
											max={control.max}
											step={control.step}
											value={sliderValue(control)}
											onValueChange={(next) => setStyle(control.key, String(next))}
											class="w-full"
										/>
									{:else}
										<SegmentedControl
											label={control.label}
											options={choices(control)}
											{value}
											onValueChange={(next) => setStyle(control.key, next)}
											class="w-full"
										/>
									{/if}
									{#if control.hint}
										<p class="text-[10px] text-gray-400 dark:text-gray-500">{control.hint}</p>
									{/if}
								</div>
							{/each}
						</div>
					</Collapsible.Content>
				</Collapsible.Root>
			{/if}

			{#if template.images.length > 0}
				<Collapsible.Root bind:open={imagesOpen}>
					{@render header(
						ImageIcon,
						'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300',
						'Images',
						String(template.images.length)
					)}
					<Collapsible.Content>
						<div class="space-y-3 px-1 pt-1 pb-2">
							{#each template.images as imageSlot (imageSlot.key)}
								<ImageSlotControl
									slot={imageSlot}
									value={slide.content.images[imageSlot.key] ?? ''}
									inputId="img-{slide.id}-{imageSlot.key}"
									onchange={(url) => setImage(imageSlot.key, url)}
								/>
							{/each}
						</div>
					</Collapsible.Content>
				</Collapsible.Root>
			{/if}
		</div>
	{/if}
</div>
