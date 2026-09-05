import Root from './upgrade-card.svelte';
import Action from './upgrade-card-action.svelte';
import Badge from './upgrade-card-badge.svelte';
import Close from './upgrade-card-close.svelte';
import Description from './upgrade-card-description.svelte';
import Dismiss from './upgrade-card-dismiss.svelte';
import Feature from './upgrade-card-feature.svelte';
import FeatureDescription from './upgrade-card-feature-description.svelte';
import FeatureTitle from './upgrade-card-feature-title.svelte';
import Features from './upgrade-card-features.svelte';
import Footer from './upgrade-card-footer.svelte';
import Header from './upgrade-card-header.svelte';
import Hero from './upgrade-card-hero.svelte';
import Title from './upgrade-card-title.svelte';

/**
 * The upgrade pitch: a `ui/card` with a primary-tinted halftone hero on top,
 * a title with a plan pill beside it, the list of what the plan adds, and a
 * footer pairing the full-width `Action` with a quiet `Dismiss` — both
 * `UntitledButton`s. Structural only (the `ui/card` tier): the page owns the
 * copy, the feature rows and where the buttons go. `/upgrade` is the
 * reference; `/components` → Cards renders it with demo content.
 */
export {
	Root,
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
	Root as UpgradeCard,
	Hero as UpgradeCardHero,
	Close as UpgradeCardClose,
	Header as UpgradeCardHeader,
	Title as UpgradeCardTitle,
	Badge as UpgradeCardBadge,
	Description as UpgradeCardDescription,
	Features as UpgradeCardFeatures,
	Feature as UpgradeCardFeature,
	FeatureTitle as UpgradeCardFeatureTitle,
	FeatureDescription as UpgradeCardFeatureDescription,
	Footer as UpgradeCardFooter,
	Action as UpgradeCardAction,
	Dismiss as UpgradeCardDismiss
};
