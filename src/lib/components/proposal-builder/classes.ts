/**
 * The proposal builder's look, as Yes Smile drew it — quoted class for class
 * so the two forms read as one — with the template's dark-mode pair beside
 * each literal grey. The blue focus ring is a call-site override of the
 * primitives' neutral one, defined once here rather than repeated per input.
 */

/** A field's caption: "Name:", "Presenter:". */
export const builderLabel =
	'text-gray-700 dark:text-foreground font-semibold text-base leading-normal';

/**
 * An input, a textarea or a picker trigger. It sets no display utility on
 * purpose: `Input`, `Textarea` and the `Combobox` trigger are all `flex`, and
 * a `block` here won that merge and stacked the combobox's chevron onto its
 * own line. Width comes from `w-full`.
 */
export const builderInput =
	'mt-1 w-full h-auto border border-gray-300 dark:border-input rounded-md bg-white dark:bg-card px-3 py-2 text-base md:text-base focus:outline-none focus-visible:border-blue-500/70 focus-visible:ring-blue-500/65 focus-visible:ring-[1.5px]';

/** Added to `builderInput` while the field carries an error. */
export const builderInputInvalid = 'border-red-500 ring-1 ring-red-500';

/** The error line under a field. */
export const builderError = 'text-red-500 text-sm mt-1 font-normal';

/** A section caption inside an option: "Quick Select:", "Items:". */
export const builderCaption = 'text-gray-600 dark:text-muted-foreground font-medium';
