import * as Dialog from '$lib/components/ui/dialog/index.js';
import Action from './upgrade-modal-action.svelte';
import Badge from './upgrade-modal-badge.svelte';
import Close from './upgrade-modal-close.svelte';
import Content from './upgrade-modal-content.svelte';
import Dismiss from './upgrade-modal-dismiss.svelte';
import Feature from './upgrade-modal-feature.svelte';
import FeatureDescription from './upgrade-modal-feature-description.svelte';
import FeatureTitle from './upgrade-modal-feature-title.svelte';
import Features from './upgrade-modal-features.svelte';
import Footer from './upgrade-modal-footer.svelte';
import Header from './upgrade-modal-header.svelte';
import Hero from './upgrade-modal-hero.svelte';
import Title from './upgrade-modal-title.svelte';

/**
 * The upgrade pitch as a dialog: `ui/dialog`'s mechanics (portal, overlay,
 * focus trap, Escape, motion) painted as a card with a primary-tinted
 * halftone hero on top, a title with the plan pill beside it, the list of
 * what the plan adds, and a footer pairing the full-width `Action` with a
 * quiet `Dismiss` — both `UntitledButton`s. Structural only: the page owns
 * the copy, the feature rows and what the action does. `UpgradePrompt`
 * (`src/lib/components/upgrade-prompt.svelte`) is the instance the (app)
 * layout mounts and `showUpgrade()` opens; `/components` → Overlays renders
 * the parts with demo content.
 */
const Root = Dialog.Root;
const Trigger = Dialog.Trigger;
const Description = Dialog.Description;

export {
	Root,
	Trigger,
	Content,
	Hero,
	Close,
	Header,
	Title,
	Badge,
	Description,
	Features,
	Feature,
	FeatureTitle,
	FeatureDescription,
	Footer,
	Action,
	Dismiss,
	//
	Root as UpgradeModal,
	Trigger as UpgradeModalTrigger,
	Content as UpgradeModalContent,
	Hero as UpgradeModalHero,
	Close as UpgradeModalClose,
	Header as UpgradeModalHeader,
	Title as UpgradeModalTitle,
	Badge as UpgradeModalBadge,
	Description as UpgradeModalDescription,
	Features as UpgradeModalFeatures,
	Feature as UpgradeModalFeature,
	FeatureTitle as UpgradeModalFeatureTitle,
	FeatureDescription as UpgradeModalFeatureDescription,
	Footer as UpgradeModalFooter,
	Action as UpgradeModalAction,
	Dismiss as UpgradeModalDismiss
};
