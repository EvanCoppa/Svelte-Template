import Option from './proposal-builder-option.svelte';
import PersonPicker from './proposal-builder-person-picker.svelte';
import SaveBar from './proposal-builder-save-bar.svelte';
import Units from './proposal-builder-units.svelte';

/**
 * The parts of the proposal builder (`/proposals/new`) — Yes Smile's
 * treatment plan form in the template's primitives. The page owns the form
 * document and every list the parts pick from; each part binds the slice it
 * edits and takes the rest as visible props, the compound rule. `classes.ts`
 * is the form's look, quoted once.
 */
export * from './classes.js';

export {
	Option,
	PersonPicker,
	SaveBar,
	Units,
	//
	Option as ProposalBuilderOption,
	PersonPicker as ProposalBuilderPersonPicker,
	SaveBar as ProposalBuilderSaveBar,
	Units as ProposalBuilderUnits
};
