<script lang="ts">
	import ImageIcon from '@lucide/svelte/icons/image';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { toast } from 'svelte-sonner';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { invalidate } from '$app/navigation';
	import { BlurUpImage, Lightbox } from '$lib/components/enhanced/index.js';
	import * as Modal from '$lib/components/modal/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { EntityImageWithUrl } from '$lib/server/crm/entity-images';
	import { imageUploadSchema, removeImageSchema } from '$lib/schemas/entity-images';

	/**
	 * A record's pictures, and the one form that adds them. The page owns the
	 * rows and the forms its load built; this part draws the card, opens the
	 * modal on "Add photo", and posts to the record page's `?/uploadImage` /
	 * `?/removeImage` — the same shape as `Detail.Addresses`, one field
	 * (`file`) standing in for the address form's street/city/etc.
	 */
	let {
		images,
		form: uploadForm,
		removeForm,
		canManage,
		noun,
		queryKey
	}: {
		images: EntityImageWithUrl[];
		form: SuperValidated<Infer<typeof imageUploadSchema>>;
		removeForm: SuperValidated<Infer<typeof removeImageSchema>>;
		canManage: boolean;
		/** What the record is called — "this asset". */
		noun: string;
		/** The record's own query key, refreshed after every save. */
		queryKey: string;
	} = $props();

	let editorOpen = $state(false);
	let removingId = $state<string | null>(null);
	const removing = $derived(images.find((image) => image.id === removingId) ?? null);
	let viewingId = $state<string | null>(null);

	const { form, errors, message, constraints, submitting, enhance, reset } = superForm(uploadForm, {
		id: 'entity-image',
		validators: zod4Client(imageUploadSchema),
		invalidateAll: false,
		resetForm: true,
		onUpdated({ form: result }) {
			if (!result.valid) return;
			editorOpen = false;
			toast.success('Photo added');
			invalidate(queryKey);
		}
	});

	const {
		message: removeMessage,
		submitting: deleting,
		enhance: removeEnhance
	} = superForm(removeForm, {
		id: 'remove-entity-image',
		invalidateAll: false,
		onUpdated({ form: result }) {
			if (!result.valid) return;
			removingId = null;
			toast.success('Photo removed');
			invalidate(queryKey);
		}
	});

	function startAdding() {
		reset();
		editorOpen = true;
	}
</script>

<Card.Root data-slot="detail-images">
	<Card.Header>
		<Card.Title>Photos</Card.Title>
		{#if canManage}
			<Card.Action>
				<Button variant="outline" size="sm" onclick={startAdding}>
					<PlusIcon />
					Add photo
				</Button>
			</Card.Action>
		{/if}
	</Card.Header>
	<Card.Content>
		{#if images.length > 0}
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
				{#each images as image (image.id)}
					{@const alt = image.caption ?? `Photo of this ${noun}`}
					<figure class="group relative">
						<button
							type="button"
							id={`entity-image-${image.id}`}
							class="block w-full cursor-zoom-in overflow-hidden rounded-lg"
							onclick={() => (viewingId = image.id)}
						>
							<BlurUpImage src={image.url} {alt} width={400} height={400} />
						</button>
						{#if canManage}
							<Button
								variant="outline"
								size="icon"
								class="absolute top-1.5 right-1.5 size-7 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
								title="Remove photo"
								onclick={() => (removingId = image.id)}
							>
								<Trash2Icon class="size-3.5" />
								<span class="sr-only">Remove photo</span>
							</Button>
						{/if}
						{#if image.caption}
							<figcaption class="text-muted-foreground mt-1 truncate text-xs">
								{image.caption}
							</figcaption>
						{/if}
					</figure>
					{#if viewingId === image.id}
						<Lightbox
							open={viewingId === image.id}
							onClose={() => (viewingId = null)}
							src={image.url}
							{alt}
							caption={image.caption ?? undefined}
							origin={typeof document !== 'undefined'
								? document.getElementById(`entity-image-${image.id}`)
								: null}
						/>
					{/if}
				{/each}
			</div>
		{:else}
			<Empty.Root class="p-6">
				<Empty.Header>
					<Empty.Title class="text-base">No photos yet</Empty.Title>
					<Empty.Description>
						Pictures of this {noun} — a walkthrough shot, a nameplate, before and after.
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Card.Content>
</Card.Root>

<Modal.Root bind:open={editorOpen}>
	<Modal.Content>
		<form method="POST" action="?/uploadImage" enctype="multipart/form-data" use:enhance>
			<Modal.Card>
				<Modal.Header>
					<Modal.Title><ImageIcon /> Add photo</Modal.Title>
					<Modal.Description>JPEG, PNG, WebP or GIF, up to 10MB.</Modal.Description>
				</Modal.Header>
				<Modal.Body>
					<FormAlert message={$message} class="mb-0" />
					<div class="grid gap-4">
						<div class="grid gap-2">
							<Label for="entity-image-file">Photo</Label>
							<Input
								id="entity-image-file"
								name="file"
								type="file"
								accept="image/jpeg,image/png,image/webp,image/gif"
								aria-invalid={$errors.file ? 'true' : undefined}
							/>
							{#if $errors.file}
								<p class="text-destructive text-sm">{$errors.file}</p>
							{/if}
						</div>
						<div class="grid gap-2">
							<Label for="entity-image-caption">Caption</Label>
							<Input
								id="entity-image-caption"
								name="caption"
								placeholder="Front entrance"
								aria-invalid={$errors.caption ? 'true' : undefined}
								bind:value={$form.caption}
								{...$constraints.caption}
							/>
							{#if $errors.caption}
								<p class="text-destructive text-sm">{$errors.caption}</p>
							{/if}
						</div>
					</div>
				</Modal.Body>
			</Modal.Card>
			<Modal.Footer>
				<Modal.Cancel>Cancel</Modal.Cancel>
				<Modal.Action type="submit" disabled={$submitting}>
					{$submitting ? 'Uploading…' : 'Add photo'}
				</Modal.Action>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>

<Modal.Root
	open={removing !== null}
	onOpenChange={(open) => {
		if (!open) removingId = null;
	}}
>
	<Modal.Content>
		{#if removing}
			<form method="POST" action="?/removeImage" use:removeEnhance>
				<input type="hidden" name="id" value={removing.id} />
				<Modal.Card>
					<Modal.Header>
						<Modal.Title><Trash2Icon /> Remove this photo?</Modal.Title>
						<Modal.Description>This can't be undone.</Modal.Description>
					</Modal.Header>
					<Modal.Body>
						<FormAlert message={$removeMessage} class="mb-0" />
					</Modal.Body>
				</Modal.Card>
				<Modal.Footer>
					<Modal.Cancel>Cancel</Modal.Cancel>
					<Modal.Action type="submit" disabled={$deleting}>
						{$deleting ? 'Removing…' : 'Remove photo'}
					</Modal.Action>
				</Modal.Footer>
			</form>
		{/if}
	</Modal.Content>
</Modal.Root>
