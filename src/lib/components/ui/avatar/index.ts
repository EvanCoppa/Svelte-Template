import Root from './avatar.svelte';
import Image from './avatar-image.svelte';
import Fallback from './avatar-fallback.svelte';

export { avatarTint } from './avatar-tint.js';

export {
	Root,
	Image,
	Fallback,
	//
	Root as Avatar,
	Image as AvatarImage,
	Fallback as AvatarFallback
};
