import * as Dialog from '$lib/components/ui/dialog/index.js';
import Action from './modal-action.svelte';
import Body from './modal-body.svelte';
import Cancel from './modal-cancel.svelte';
import Content from './modal-content.svelte';
import Footer from './modal-footer.svelte';
import Header from './modal-header.svelte';
import Title from './modal-title.svelte';

/**
 * The standard modal: `ui/dialog`'s mechanics (portal, overlay, focus trap,
 * Escape, motion) under a title bar with its close button, a body, and a footer
 * that pairs `Cancel` (`esc`) with the primary action (`↵`), both rendered as
 * `UntitledButton`s. The page still owns everything inside — title text, form,
 * fields and handlers arrive as children of the parts, and a form wraps
 * `Modal.Body` + `Modal.Footer` so `Modal.Action type="submit"` posts it.
 */
const Root = Dialog.Root;
const Trigger = Dialog.Trigger;
const Description = Dialog.Description;

export {
	Root,
	Trigger,
	Content,
	Header,
	Title,
	Description,
	Body,
	Footer,
	Cancel,
	Action,
	//
	Root as Modal,
	Trigger as ModalTrigger,
	Content as ModalContent,
	Header as ModalHeader,
	Title as ModalTitle,
	Description as ModalDescription,
	Body as ModalBody,
	Footer as ModalFooter,
	Cancel as ModalCancel,
	Action as ModalAction
};
