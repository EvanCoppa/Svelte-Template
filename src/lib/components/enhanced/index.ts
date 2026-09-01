/*
 * Enhanced primitives — richer, motion-aware controls ported from Solid Core's
 * `interior` collection.
 *
 * These sit alongside the shadcn-svelte primitives in `src/lib/components/ui/`,
 * they do not replace them. Reach for `ui/` first; reach here when the job needs
 * something `ui/` has no answer for — a one-time-code field, a tag field, a
 * password meter, a button that owns its own pending state.
 *
 * Every one of them paints from the theme tokens in `src/app.css`, so they
 * follow the light/dark toggle in `src/lib/theme.svelte.ts` with no extra
 * wiring, and every animation is routed through `$lib/motion.js` so a
 * `prefers-reduced-motion` request is honoured in one place.
 */

export { Accordion, type AccordionProps, type AccordionType } from './accordion/index.js';
export type { AccordionItem } from './accordion/index.js';
export { BlurUpImage, type BlurUpImageProps, type BlurUpStatus } from './blur-up-image/index.js';
export {
	CollapsibleBanner,
	type CollapsibleBannerProps,
	type BannerState
} from './collapsible-banner/index.js';
export {
	ContextMenu,
	type ContextMenuProps,
	type ContextMenuItem,
	type ContextMenuAction,
	type ContextMenuSeparator,
	type ContextMenuPlacement
} from './context-menu/index.js';
export { CopyButton, type CopyButtonProps, type CopyStatus } from './copy-button/index.js';
export {
	ExpandingSearch,
	type ExpandingSearchAlign,
	type ExpandingSearchProps
} from './expanding-search/index.js';
export { FilterGrid, type FilterGridProps, type FilterDefinition } from './filter-grid/index.js';
export { FloatingLabelInput, type FloatingLabelInputProps } from './floating-label/index.js';
export { HideOnScroll, type HideOnScrollProps } from './hide-on-scroll/index.js';
export { HoldToConfirm, type HoldToConfirmProps, type HoldPhase } from './hold-to-confirm/index.js';
export {
	IconMorph,
	iconMorphPresets,
	type IconMorphMode,
	type IconMorphPreset,
	type IconMorphProps,
	type IconMorphSemantics,
	type IconMorphSlot,
	type IconMorphState
} from './icon-morph/index.js';
export {
	InlineValidation,
	type InlineValidationProps,
	type ValidationStatus,
	type Validator
} from './inline-validation/index.js';
export { Lightbox, type LightboxProps } from './lightbox/index.js';
export { LikeBurst, type LikeBurstProps, type LikeCommit } from './like-burst/index.js';
export {
	LiveActivity,
	type LiveActivityProps,
	type Activity,
	type ActivityAction,
	type ActivityPhase
} from './live-activity/index.js';
export {
	LoadMore,
	type LoadMoreProps,
	type LoadMoreStatus,
	type LoadMoreLabels
} from './load-more/index.js';
export {
	LoadingButton,
	type AsyncActionStatus,
	type LoadingButtonProps
} from './loading-button/index.js';
export {
	LogoMarquee,
	type LogoMarqueeProps,
	type LogoMarqueeItem,
	type MarqueeDirection
} from './logo-marquee/index.js';
export {
	LongPressButton,
	type LongPressButtonProps,
	type LongPressPhase
} from './long-press/index.js';
export {
	NewItemsPill,
	type NewItemsPillProps,
	type NewItemsAnchor
} from './new-items-pill/index.js';
export { OtpInput, type OtpInputProps, type OtpMode, type OtpStatus } from './otp-input/index.js';
export { Pagination, type PaginationProps, type PaginationItem } from './pagination/index.js';
export {
	PasswordStrength,
	defaultPasswordLabels,
	defaultPasswordRules,
	type EvaluatedRule,
	type PasswordRule,
	type PasswordStrengthProps
} from './password-strength/index.js';
export { PollResults, type PollResultsProps, type PollOption } from './poll-results/index.js';
export {
	PresenceAvatars,
	type PresenceAvatarsProps,
	type PresencePerson
} from './presence-avatars/index.js';
export { PressDepth, type PressDepthProps, type PressOrigin } from './press-depth/index.js';
export { ProgressBar, type ProgressBarProps } from './progress-bar/index.js';
export { ReadingProgress, type ReadingProgressProps } from './reading-progress/index.js';
export { ReorderList, type ReorderListProps } from './reorder-list/index.js';
export { Ripple, type RippleProps, type RippleSpec } from './ripple/index.js';
export { ScrollSpy, type ScrollSpyProps, type ScrollSpySection } from './scroll-spy/index.js';
export {
	SegmentedControl,
	type SegmentedControlProps,
	type SegmentedOption
} from './segmented-control/index.js';
export { ShowMore, type ShowMoreProps } from './show-more/index.js';
export { SkeletonSwap, type SkeletonSwapProps } from './skeleton-swap/index.js';
export {
	SliderDetents,
	type SliderDetentsProps,
	type SliderDetent
} from './slider-detents/index.js';
export { SnapCarousel, type SnapCarouselProps } from './snap-carousel/index.js';
export {
	SortableTable,
	type SortableTableProps,
	type SortableColumn,
	type SortState,
	type SortDirection
} from './sortable-table/index.js';
export { StickyHeader, type StickyHeaderProps } from './sticky-header/index.js';
export {
	StreamingText,
	type StreamingTextProps,
	type StreamingTextStatus
} from './streaming-text/index.js';
export {
	SwipeDeck,
	type SwipeDeckProps,
	type SwipeChoice,
	type SwipeIntent,
	type SwipeDeckFlow
} from './swipe-deck/index.js';
export { TagInput, type TagInputProps, type TagRejection } from './tag-input/index.js';
export {
	TaskSteps,
	type TaskStepsProps,
	type TaskStep,
	type TaskStepStatus
} from './task-steps/index.js';
export { TextReveal, type TextRevealProps, type TextRevealSplit } from './text-reveal/index.js';
export {
	TooltipGroup,
	Tooltip,
	type TooltipGroupProps,
	type TooltipProps,
	type TooltipSide,
	type TooltipTiming
} from './tooltip-group/index.js';
export { TreeView, type TreeViewProps, type TreeNode, type TreeRow } from './tree-view/index.js';
export { TypingIndicator, type TypingIndicatorProps } from './typing-indicator/index.js';
export { ValueFlash, type ValueFlashProps, type FlashDirection } from './value-flash/index.js';
export {
	WizardSteps,
	type WizardStepsProps,
	type WizardStep,
	type WizardDirection
} from './wizard-steps/index.js';
