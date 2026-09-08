import Actions from './note-actions.svelte';
import Card from './note-card.svelte';
import Editor from './note-editor.svelte';
import Palette from './note-palette.svelte';

/**
 * One note, wherever it is shown:
 *
 *   <Note.Card color={note.color}>
 *     <Note.Editor {note} onsave={(patch) => noteCommands.save(note.id, patch)} />
 *     <Note.Actions>
 *       <Note.Palette value={note.color} onpick={…} />
 *     </Note.Actions>
 *   </Note.Card>
 *
 * Structural parts the surface composes: the dock's expanded note, a card on
 * `/notes` and a record's notes all build from these, which is what makes a
 * note look and behave the same in all three. The page owns the data and the
 * handlers; the only behaviour inside is the editor's autosave, which is the
 * one thing every surface must do identically.
 */
export {
	Card,
	Editor,
	Palette,
	Actions,
	//
	Card as NoteCard,
	Editor as NoteEditor,
	Palette as NotePalette,
	Actions as NoteActions
};
