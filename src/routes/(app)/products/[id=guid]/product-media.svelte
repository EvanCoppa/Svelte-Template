<script lang="ts">
	import ImageIcon from '@lucide/svelte/icons/image';
	import ImagePlusIcon from '@lucide/svelte/icons/image-plus';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import { toast } from 'svelte-sonner';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { invalidate } from '$app/navigation';
	import { BlurUpImage, Lightbox } from '$lib/components/enhanced/index.js';
	import * as Modal from '$lib/components/modal/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { productImageUploadSchema, removeProductImageSchema } from '$lib/schemas/products';

	/**
	 * The product's pictures: the storefront image (`products.image_url`, the
	 * one this page uploads and replaces) first and largest, then the gallery
	 * URLs `additional_images` carries, then the tile that adds one. One
	 * uploaded slot rather than `Detail.Images` (an asset's attachments): a
	 * storefront shows THE picture, and the gallery is the import's to fill.
	 * The record page's `?/uploadProductImage` and `?/removeProductImage`
	 * actions own the storage side.
	 */
	let {
		imageUrl,
		gallery,
		name,
		form: uploadForm,
		removeForm,
		canManage,
		queryKey
	}: {
		imageUrl: string | null;
		/** The extra storefront images, as URLs. */
		gallery: readonly string[];
		/** The product's name, for the pictures' alt text. */
		name: string;
		form: SuperValidated<Infer<typeof productImageUploadSchema>>;
		removeForm: SuperValidated<Infer<typeof removeProductImageSchema>>;
		canManage: boolean;
		/** The record's own query key, refreshed after every save. */
		queryKey: string;
	} = $props();

	let editorOpen = $state(false);
	let removing = $state(false);
	/** The picture open full-size, by its URL. */
	let viewing = $state<string | null>(null);

	const pictures = $derived([...(imageUrl ? [imageUrl] : []), ...gallery]);
	const empty = $derived(pictures.length === 0);

	const { errors, message, submitting, enhance, reset } = superForm(uploadForm, {
		id: 'product-image',
		validators: zod4Client(productImageUploadSchema),
		invalidateAll: false,
		resetForm: true,
		onUpdated({ form: result }) {
			if (!result.valid) return;
			editorOpen = false;
			toast.success('Image updated');
			invalidate(queryKey);
		}
	});

	const {
		message: removeMessage,
		submitting: deleting,
		enhance: removeEnhance
	} = superForm(removeForm, {
		id: 'remove-product-image',
		invalidateAll: false,
		onUpdated({ form: result }) {
			if (!result.valid) return;
			removing = false;
			toast.success('Image removed');
			invalidate(queryKey);
		}
	});

	function startAdding() {
		reset();
		editorOpen = true;
	}

	const tileId = (index: number) => `product-picture-${String(index)}`;
</script>

<Card.Root data-slot="product-media">
	<Card.Header>
		<Card.Title>Media</Card.Title>
		<Card.Description>What a storefront shows for this product.</Card.Description>
		{#if canManage}
			<Card.Action class="flex gap-2">
				{#if imageUrl}
					<Button variant="outline" size="sm" onclick={() => (removing = true)}>
						<Trash2Icon />
						Remove
					</Button>
				{/if}
				<Button variant="outline" size="sm" onclick={startAdding}>
					<UploadIcon />
					{imageUrl ? 'Replace' : 'Upload'}
				</Button>
			</Card.Action>
		{/if}
	</Card.Header>
	<Card.Content>
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
			{#each pictures as url, index (url)}
				{@const primary = index === 0 && url === imageUrl}
				<figure class="relative {primary ? 'col-span-2 row-span-2' : ''}">
					<button
						type="button"
						id={tileId(index)}
						class="bg-muted block aspect-square w-full cursor-zoom-in overflow-hidden rounded-lg border"
						onclick={() => (viewing = url)}
					>
						<BlurUpImage
							src={url}
							alt={primary ? `${name} product image` : `${name}, picture ${String(index + 1)}`}
							width={primary ? 800 : 400}
							height={primary ? 800 : 400}
							class="size-full object-cover"
						/>
					</button>
					{#if primary}
						<figcaption
							class="bg-background/90 text-muted-foreground absolute bottom-2 left-2 rounded-md px-1.5 py-0.5 text-[11px] font-medium"
						>
							Storefront
						</figcaption>
					{/if}
				</figure>
				{#if viewing === url}
					<Lightbox
						open={viewing === url}
						onClose={() => (viewing = null)}
						src={url}
						alt="{name} product image"
						origin={typeof document !== 'undefined' ? document.getElementById(tileId(index)) : null}
					/>
				{/if}
			{/each}

			{#if canManage && !imageUrl}
				<button
					type="button"
					class="text-muted-foreground hover:bg-accent/50 hover:text-foreground flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm transition-colors {empty
						? 'col-span-2 row-span-2'
						: ''}"
					onclick={startAdding}
				>
					<span class="bg-muted flex size-9 items-center justify-center rounded-full">
						<ImagePlusIcon class="size-4" />
					</span>
					Add image
				</button>
			{:else if empty}
				<div
					class="text-muted-foreground col-span-2 row-span-2 flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm"
				>
					<ImageIcon class="size-5" />
					No image yet
				</div>
			{/if}
		</div>
	</Card.Content>
</Card.Root>

<Modal.Root bind:open={editorOpen}>
	<Modal.Content>
		<form method="POST" action="?/uploadProductImage" enctype="multipart/form-data" use:enhance>
			<Modal.Card>
				<Modal.Header>
					<Modal.Title><ImageIcon /> {imageUrl ? 'Replace image' : 'Add image'}</Modal.Title>
					<Modal.Description>JPEG, PNG, WebP or GIF, up to 10MB.</Modal.Description>
				</Modal.Header>
				<Modal.Body>
					<FormAlert message={$message} class="mb-0" />
					<div class="grid gap-2">
						<Label for="product-image-file">Image</Label>
						<Input
							id="product-image-file"
							name="file"
							type="file"
							accept="image/jpeg,image/png,image/webp,image/gif"
							aria-invalid={$errors.file ? 'true' : undefined}
						/>
						{#if $errors.file}
							<p class="text-destructive text-sm">{$errors.file}</p>
						{/if}
					</div>
				</Modal.Body>
			</Modal.Card>
			<Modal.Footer>
				<Modal.Cancel>Cancel</Modal.Cancel>
				<Modal.Action type="submit" disabled={$submitting}>
					{$submitting ? 'Uploading…' : imageUrl ? 'Replace image' : 'Add image'}
				</Modal.Action>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>

<Modal.Root
	open={removing}
	onOpenChange={(open) => {
		if (!open) removing = false;
	}}
>
	<Modal.Content>
		<form method="POST" action="?/removeProductImage" use:removeEnhance>
			<Modal.Card>
				<Modal.Header>
					<Modal.Title><Trash2Icon /> Remove this image?</Modal.Title>
					<Modal.Description>This can't be undone.</Modal.Description>
				</Modal.Header>
				<Modal.Body>
					<FormAlert message={$removeMessage} class="mb-0" />
				</Modal.Body>
			</Modal.Card>
			<Modal.Footer>
				<Modal.Cancel>Cancel</Modal.Cancel>
				<Modal.Action type="submit" disabled={$deleting}>
					{$deleting ? 'Removing…' : 'Remove image'}
				</Modal.Action>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>
