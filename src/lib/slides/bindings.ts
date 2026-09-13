import type { Presentation } from './types';

/**
 * The dot paths a text slot may be bound to (`content.variables[key].sourceField`).
 * A fixed list rather than a generic traversal: the builder offers these in
 * a picker, and a path that is not here resolves to nothing, so the authored
 * text stands. Yes Smile's `patient.name` / `doctor.name` / `visit.date` /
 * `visit.id` / `practice.name` are `client.name` / `responsible.name` /
 * `proposal.date` / `proposal.id` / `org.name` here.
 */
export const BINDINGS = [
	{ path: 'proposal.title', label: 'Proposal title' },
	{ path: 'proposal.date', label: 'Proposal date' },
	{ path: 'proposal.id', label: 'Proposal id' },
	{ path: 'client.name', label: 'Client name' },
	{ path: 'presenter.name', label: 'Presenter name' },
	{ path: 'responsible.name', label: 'Responsible name' },
	{ path: 'org.name', label: 'Organization name' }
] as const;

export type BindingPath = (typeof BINDINGS)[number]['path'];

/** The live value for a path, or null when the presentation has none. */
export function bindingValue(presentation: Presentation, path: string): string | null {
	switch (path) {
		case 'proposal.title':
			return presentation.proposal.title;
		case 'proposal.date':
			return presentation.proposal.date;
		case 'proposal.id':
			return presentation.proposal.id;
		case 'client.name':
			return presentation.client?.name ?? null;
		case 'presenter.name':
			return presentation.presenter?.name ?? null;
		case 'responsible.name':
			return presentation.responsible?.name ?? null;
		case 'org.name':
			return presentation.org.name;
		default:
			return null;
	}
}
