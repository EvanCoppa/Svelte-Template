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

export { CopyButton, type CopyButtonProps, type CopyStatus } from './copy-button/index.js';
export { FloatingLabelInput, type FloatingLabelInputProps } from './floating-label/index.js';
export {
	InlineValidation,
	type InlineValidationProps,
	type ValidationStatus,
	type Validator
} from './inline-validation/index.js';
export {
	LoadingButton,
	type AsyncActionStatus,
	type LoadingButtonProps
} from './loading-button/index.js';
export { OtpInput, type OtpInputProps, type OtpMode, type OtpStatus } from './otp-input/index.js';
export {
	PasswordStrength,
	defaultPasswordLabels,
	defaultPasswordRules,
	type EvaluatedRule,
	type PasswordRule,
	type PasswordStrengthProps
} from './password-strength/index.js';
export {
	SegmentedControl,
	type SegmentedControlProps,
	type SegmentedOption
} from './segmented-control/index.js';
export { TagInput, type TagInputProps, type TagRejection } from './tag-input/index.js';
