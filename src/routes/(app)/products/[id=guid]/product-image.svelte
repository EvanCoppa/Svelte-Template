<script lang="ts">
	import ImageIcon from '@lucide/svelte/icons/image';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { toast } from 'svelte-sonner';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { invalidate } from '$app/navigation';
	import { BlurUpImage } from '$lib/components/enhanced/index.js';
	import * as Modal from '$lib/components/modal/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { productImageUploadSchema, removeProductImageSchema } from '$lib/schemas/products';

	/**
	 * The product's storefront picture — one field (`products.image_url`), not
	 * a gallery, so this is its own small card rather than `Detail.Images`
	 * (a multi-photo attachment for an asset or a property). Uploading
	 * replaces whatever was there; the record page's `?/uploadProductImage`
	 * and `?/removeProductImage` actions own the storage side.
	 */
	let {
		imageUrl,
		name,
		form: uploadForm,
		removeForm,
		canManage,
		queryKey
	}: {
		imageUrl: string | null;
		/** The product's name, for the picture's alt text. */
		name: string;
		form: SuperValidated<Infer<typeof productImageUploadSchema>>;
		removeForm: SuperValidated<Infer<typeof removeProductImageSchema>>;
		canManage: boolean;
		/** The record's own query key, refreshed after every save. */
		queryKey: string;
	} = $props();

	let editorOpen = $state(false);
	let removing = $state(false);

	const { form, errors, message, submitting, enhance, reset } = superForm(uploadForm, {
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
</script>

<Card.Root data-slot="product-image">
	<Card.Header>
		<Card.Title>Image</Card.Title>
		{#if canManage}
			<Card.Action class="flex gap-2">
				{#if imageUrl}
					<Button variant="outline" size="sm" onclick={() => (removing = true)}>
						<Trash2Icon />
						Remove
					</Button>
				{/if}
				<Button variant="outline" size="sm" onclick={startAdding}>
					<ImageIcon />
					{imageUrl ? 'Replace image' : 'Add image'}
				</Button>
			</Card.Action>
		{/if}
	</Card.Header>
	<Card.Content>
		{#if imageUrl}
			<div class="max-w-[12rem] overflow-hidden rounded-lg border">
				<BlurUpImage src={imageUrl} alt="{name} product image" width={480} height={480} />
			</div>
		{:else}
			<Empty.Root class="p-6">
				<Empty.Header>
					<Empty.Title class="text-base">No image yet</Empty.Title>
					<Empty.Description>The picture a storefront shows for this product.</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
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
