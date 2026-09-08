import type { WithChild } from 'bits-ui';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/** The first letter up, the rest as given: a lower-case noun as a label or a pill. */
export function capitalize(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
/**
 * The `{ props }` payload a delegated `child` snippet receives — bits-ui's own
 * public contract for the attributes the snippet spreads onto its element.
 */
export type ChildSnippetProps = Parameters<NonNullable<WithChild['child']>>[0];
