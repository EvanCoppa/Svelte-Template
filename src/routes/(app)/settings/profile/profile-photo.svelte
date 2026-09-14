<script lang="ts">
	import CameraIcon from '@lucide/svelte/icons/camera';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import UserRoundIcon from '@lucide/svelte/icons/user-round';
	import { toast } from 'svelte-sonner';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { invalidate } from '$app/navigation';
	import * as Modal from '$lib/components/modal/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import type { AvatarTone } from '$lib/components/ui/avatar/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { QUERY } from '$lib/queries';
	import { cn } from '$lib/utils.js';
	import {
		avatarInitialsSchema,
		avatarUploadSchema,
		avatarUrlSchema,
		MAX_AVATAR_BYTES
	} from './schema';

	/**
	 * The profile photo, and the modal that changes it. Four ways in — upload a
	 * file, pick a generated one, use your Gravatar, keep your initials — and
	 * three form actions behind them, because a file, a URL and a colour are
	 * three different posts (see +page.server.ts). The page owns the forms its
	 * load built and hands them here.
	 */
	let {
		userId,
		avatarUrl,
		tone,
		initials,
		name,
		gravatarUrl,
		uploadForm,
		urlForm,
		initialsForm
	}: {
		/** Seeds the fallback colour when no tone has been chosen. */
		userId: string;
		avatarUrl: string | null;
		/** The colour they chose, or null while it is still derived from the id. */
		tone: AvatarTone | null;
		initials: string;
		name: string;
		/** The reader's Gravatar, or null when that email has none. */
		gravatarUrl: string | null;
		uploadForm: SuperValidated<Infer<typeof avatarUploadSchema>>;
		urlForm: SuperValidated<Infer<typeof avatarUrlSchema>>;
		initialsForm: SuperValidated<Infer<typeof avatarInitialsSchema>>;
	} = $props();

	let open = $state(false);

	/** Every door closes the modal, toasts and refreshes the one key. */
	function saved(what: string) {
		open = false;
		toast.success(what);
		invalidate(QUERY.profile);
	}

	const {
		errors: uploadErrors,
		message: uploadMessage,
		submitting: uploading,
		enhance: uploadEnhance,
		reset: resetUpload
	} = superForm(uploadForm, {
		id: 'avatar-upload',
		validators: zod4Client(avatarUploadSchema),
		invalidateAll: false,
		resetForm: true,
		onUpdated: ({ form }) => form.valid && saved('Profile photo updated')
	});

	const {
		form: url,
		message: urlMessage,
		submitting: savingUrl,
		enhance: urlEnhance
	} = superForm(urlForm, {
		id: 'avatar-url',
		validators: zod4Client(avatarUrlSchema),
		invalidateAll: false,
		resetForm: false,
		onUpdated: ({ form }) => form.valid && saved('Profile photo updated')
	});

	const {
		form: chosen,
		message: initialsMessage,
		submitting: savingInitials,
		enhance: initialsEnhance
	} = superForm(initialsForm, {
		id: 'avatar-initials',
		validators: zod4Client(avatarInitialsSchema),
		invalidateAll: false,
		resetForm: false,
		onUpdated: ({ form }) => form.valid && saved('Avatar updated')
	});

	/**
	 * Two tabs save a URL — a generated avatar and a Gravatar — and they are
	 * one post, so they share one form: the hidden one below, filled from
	 * script and submitted with `requestSubmit()`. That is the road a mutation
	 * born in a gesture takes here (CLAUDE.md, "Server actions vs API
	 * endpoints"), and it is what keeps the store the client validator reads
	 * in step with what is actually being saved.
	 */
	let urlFormEl = $state<HTMLFormElement | null>(null);

	function saveUrl(next: string) {
		$url.url = next;
		urlFormEl?.requestSubmit();
	}

	// DiceBear renders a deterministic avatar per seed, so a fresh set of seeds
	// is a fresh set of faces — no request needed to know what to draw.
	const DICEBEAR_STYLES = ['thumbs', 'shapes', 'bottts', 'identicon'] as const;
	let style = $state<(typeof DICEBEAR_STYLES)[number]>('thumbs');
	let seeds = $state(newSeeds());
	let picked = $state<string | null>(null);

	function newSeeds(): string[] {
		return Array.from({ length: 12 }, () => crypto.randomUUID().slice(0, 8));
	}

	function dicebear(seed: string): string {
		return `https://api.dicebear.com/9.x/${style}/svg?seed=${seed}`;
	}

	// Clearing the pick when the style or the seeds change keeps "Use this
	// avatar" honest: it always saves the swatch that is currently ringed.
	function chooseStyle(next: (typeof DICEBEAR_STYLES)[number]) {
		style = next;
		picked = null;
	}

	function shuffle() {
		seeds = newSeeds();
		picked = null;
	}

	function openPicker() {
		resetUpload();
		picked = null;
		if (tone) $chosen.tint = tone;
		open = true;
	}

	const megabytes = MAX_AVATAR_BYTES / (1024 * 1024);
	const swatchRing =
		'rounded-lg border-2 p-1 transition-colors focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none';
</script>

<div class="flex items-center gap-5">
	<div class="relative">
		<Avatar.Root class="size-24">
			{#if avatarUrl}
				<Avatar.Image src={avatarUrl} alt={name} class="object-cover" />
			{/if}
			<Avatar.Fallback class={cn('text-2xl font-semibold', Avatar.avatarTint(userId, tone))}>
				{initials}
			</Avatar.Fallback>
		</Avatar.Root>
		<Button
			variant="outline"
			size="icon"
			class="absolute -right-1 -bottom-1 size-8 rounded-full"
			onclick={openPicker}
		>
			<CameraIcon class="size-4" />
			<span class="sr-only">Change profile photo</span>
		</Button>
	</div>
	<div class="grid gap-1">
		<p class="font-medium">{name}</p>
		<Button variant="link" class="h-auto w-fit p-0" onclick={openPicker}>Change photo</Button>
	</div>
</div>

<Modal.Root bind:open>
	<Modal.Content>
		<Modal.Card>
			<Modal.Header>
				<Modal.Title><CameraIcon /> Change profile photo</Modal.Title>
				<Modal.Description>
					Upload one, generate one, use your Gravatar, or go by your initials.
				</Modal.Description>
			</Modal.Header>
			<Modal.Body>
				<Tabs.Root value="upload">
					<Tabs.List>
						<Tabs.Trigger value="upload">Upload</Tabs.Trigger>
						<Tabs.Trigger value="generated">Generated</Tabs.Trigger>
						<Tabs.Trigger value="gravatar">Gravatar</Tabs.Trigger>
						<Tabs.Trigger value="initials">Initials</Tabs.Trigger>
					</Tabs.List>

					<Tabs.Content value="upload" class="pt-4">
						<form
							method="POST"
							action="?/uploadAvatar"
							enctype="multipart/form-data"
							class="grid gap-3"
							use:uploadEnhance
						>
							<FormAlert message={$uploadMessage} class="mb-0" />
							<div class="grid gap-2">
								<Label for="avatar-file">Photo</Label>
								<Input
									id="avatar-file"
									name="file"
									type="file"
									accept="image/jpeg,image/png,image/webp,image/gif"
									aria-invalid={$uploadErrors.file ? 'true' : undefined}
								/>
								<p class="text-muted-foreground text-sm">
									JPEG, PNG, WebP or GIF, up to {megabytes}MB.
								</p>
								{#if $uploadErrors.file}
									<p class="text-destructive text-sm">{$uploadErrors.file}</p>
								{/if}
							</div>
							<Button type="submit" class="w-fit" disabled={$uploading}>
								{$uploading ? 'Uploading…' : 'Upload photo'}
							</Button>
						</form>
					</Tabs.Content>

					<Tabs.Content value="generated" class="pt-4">
						<div class="grid gap-3">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<div class="flex flex-wrap gap-1">
									{#each DICEBEAR_STYLES as option (option)}
										<Button
											variant={style === option ? 'secondary' : 'ghost'}
											size="sm"
											onclick={() => chooseStyle(option)}
										>
											{option}
										</Button>
									{/each}
								</div>
								<Button variant="ghost" size="sm" onclick={shuffle}>
									<RefreshCwIcon class="size-3.5" />
									Shuffle
								</Button>
							</div>

							<FormAlert message={$urlMessage} class="mb-0" />
							<div class="grid grid-cols-4 gap-2 sm:grid-cols-6">
								{#each seeds as seed (seed)}
									{@const src = dicebear(seed)}
									<button
										type="button"
										class={cn(
											swatchRing,
											picked === src ? 'border-primary' : 'hover:border-border border-transparent'
										)}
										aria-pressed={picked === src}
										onclick={() => (picked = picked === src ? null : src)}
									>
										<img {src} alt="Generated avatar" class="aspect-square w-full rounded-md" />
									</button>
								{/each}
							</div>
							<Button
								class="w-fit"
								disabled={$savingUrl || picked === null}
								onclick={() => picked && saveUrl(picked)}
							>
								{$savingUrl ? 'Saving…' : 'Use this avatar'}
							</Button>
						</div>
					</Tabs.Content>

					<Tabs.Content value="gravatar" class="pt-4">
						{#if gravatarUrl}
							<div class="grid justify-items-center gap-3">
								<FormAlert message={$urlMessage} class="mb-0" />
								<img src={gravatarUrl} alt="Your Gravatar" class="size-24 rounded-full" />
								<p class="text-muted-foreground text-sm">
									We found a Gravatar for your email address.
								</p>
								<Button disabled={$savingUrl} onclick={() => saveUrl(gravatarUrl)}>
									{$savingUrl ? 'Saving…' : 'Use my Gravatar'}
								</Button>
							</div>
						{:else}
							<div class="grid justify-items-center gap-3 text-center">
								<div
									class="bg-muted text-muted-foreground grid size-24 place-items-center rounded-full"
								>
									<UserRoundIcon class="size-8" />
								</div>
								<p class="text-muted-foreground text-sm">
									No Gravatar is set up for your email address.
								</p>
								<Button
									variant="outline"
									href="https://gravatar.com"
									target="_blank"
									rel="noopener noreferrer"
								>
									Create one at gravatar.com
								</Button>
							</div>
						{/if}
					</Tabs.Content>

					<Tabs.Content value="initials" class="pt-4">
						<form method="POST" action="?/useInitials" class="grid gap-3" use:initialsEnhance>
							<FormAlert message={$initialsMessage} class="mb-0" />
							<p class="text-muted-foreground text-sm">
								Drop the photo and go by your initials. Pick the colour behind them.
							</p>
							<input type="hidden" name="tint" bind:value={$chosen.tint} />
							<div class="grid grid-cols-5 gap-2 sm:grid-cols-9">
								{#each Avatar.AVATAR_TONES as swatch (swatch)}
									<button
										type="button"
										class={cn(
											swatchRing,
											$chosen.tint === swatch
												? 'border-primary'
												: 'hover:border-border border-transparent'
										)}
										aria-pressed={$chosen.tint === swatch}
										aria-label="Use {swatch}"
										onclick={() => ($chosen.tint = swatch)}
									>
										<span
											class={cn(
												'grid aspect-square w-full place-items-center rounded-full text-sm font-semibold',
												Avatar.avatarTint(userId, swatch)
											)}
										>
											{initials}
										</span>
									</button>
								{/each}
							</div>
							<Button type="submit" class="w-fit" disabled={$savingInitials}>
								{$savingInitials ? 'Saving…' : 'Use my initials'}
							</Button>
						</form>
					</Tabs.Content>
				</Tabs.Root>

				<!-- The one post behind "Use this avatar" and "Use my Gravatar":
				     outside the tabs, so it is mounted whichever is on screen. -->
				<form
					bind:this={urlFormEl}
					method="POST"
					action="?/useAvatarUrl"
					class="hidden"
					use:urlEnhance
				>
					<input type="hidden" name="url" bind:value={$url.url} />
				</form>
			</Modal.Body>
		</Modal.Card>
		<Modal.Footer>
			<Modal.Cancel>Close</Modal.Cancel>
		</Modal.Footer>
	</Modal.Content>
</Modal.Root>
