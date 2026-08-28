---
name: sveltekit-superforms
description: How every form in this project is built — sveltekit-superforms + zod v4 over SvelteKit form actions. MUST be used whenever creating or editing a form, a form action, a validation schema, or anything that posts data. Covers superValidate/superForm, the zod4 adapters, schema placement, error/toast conventions, multiple forms per page, nested data, proxies, and testing actions.
---

# Forms with sveltekit-superforms + zod

Every form in this project uses [sveltekit-superforms](https://superforms.rocks/) v2 with
**zod v4** schemas on top of the repo's standard form-action pattern. Never parse
`request.formData()` by hand, never hand-roll validation, and never add a second form
library or adapter. Progressive enhancement is the point: every form must still work
without JavaScript.

Existing reference implementations (read one before writing a new form):

- `src/routes/login/` — two forms on one page, form `message`, redirect on success
- `src/routes/reset-password/` — shared schema, sensitive-field blanking
- `src/routes/(app)/settings/` — prefilled form, toast on success, two superForms

## Where schemas live

- **Colocate** a `schema.ts` next to the route that owns the form
  (`src/routes/<route>/schema.ts`), exporting each schema as a named `z.object(...)`.
- **Promote** a schema to `src/lib/schemas/` only when more than one route uses it
  (e.g. `src/lib/schemas/password.ts` is shared by /reset-password and settings).
- Schemas are imported by both server and client, so they must stay importable from
  the browser: no `$lib/server` imports, no secrets, no Node-only APIs.
  (`TextEncoder` is fine — it exists in both runtimes.)

## Server pattern (`+page.server.ts`)

Import from **`sveltekit-superforms/server`** in server files (the root export drags in
`SuperDebug.svelte`, which breaks vitest's node environment), and the adapter from
`sveltekit-superforms/adapters`:

```typescript
import { fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { thingSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Empty form: superValidate(zod4(schema))
	// Prefilled form: pass partial data and suppress load-time errors.
	const form = await superValidate({ name: existing.name }, zod4(thingSchema), {
		errors: false
	});
	return { form };
};

export const actions: Actions = {
	save: async ({ request, locals: { supabase } }) => {
		const form = await superValidate(request, zod4(thingSchema));
		if (!form.valid) return fail(400, { form });

		const { error } = await supabase.from('things').update(form.data).eq('id', id);
		if (error) return message(form, error.message, { status: 400 });

		return { form }; // or throw redirect(303, ...) on success
	}
};
```

Rules:

- Validation failure → `fail(400, { form })`. Per-field messages come from the schema.
- Server-side failure (Supabase error, bad credentials) → `message(form, text, { status: 400 })`
  — it renders as the form-level banner.
- Success → `return { form }` (stay on page) or `throw redirect(303, ...)`.
- **Never echo secrets back.** superforms returns `form.data` to the browser on every
  failure, so blank sensitive fields before any return:
  ```typescript
  const password = form.data.password;
  form.data.password = '';
  form.data.confirm_password = '';
  if (!form.valid) return fail(400, { form });
  ```
- Auth failure messages stay vague (user-enumeration defense) — see the auth contract
  in CLAUDE.md. Zod messages are user-facing copy: write real sentences.

## Client pattern (`+page.svelte`)

```svelte
<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { thingSchema } from './schema';

	let { data } = $props();

	const { form, errors, message, constraints, submitting, enhance } = superForm(data.form, {
		validators: zod4Client(thingSchema)
	});
</script>

{#if $message}
	<p class="border-destructive/30 bg-destructive/10 text-destructive ...">{$message}</p>
{/if}

<form method="POST" action="?/save" class="grid gap-4" use:enhance>
	<div class="grid gap-2">
		<Label for="name">Name</Label>
		<Input
			id="name"
			name="name"
			aria-invalid={$errors.name ? 'true' : undefined}
			bind:value={$form.name}
			{...$constraints.name}
		/>
		{#if $errors.name}
			<p class="text-destructive text-sm">{$errors.name}</p>
		{/if}
	</div>
	<Button type="submit" disabled={$submitting}>Save</Button>
</form>
```

Rules:

- `use:enhance` comes from `superForm`, not `$app/forms` (plain schema-less actions
  like `/logout` keep kit's `enhance`).
- Every input gets `name`, `bind:value={$form.x}`, `{...$constraints.x}` (mirrors the
  schema as HTML validation attributes for the no-JS path), an inline `$errors.x`
  paragraph, and `aria-invalid` when errored.
- `$submitting` disables the submit button. `delayed` / `timeout` stores exist for
  slow submissions.
- Feedback follows the house convention: validation errors render **inline**
  (`$errors.x` next to the field, `$message` as the banner); successes **toast** —
  `onUpdated({ form }) { if (form.valid) toast.success('Saved'); }`.
- A prefilled edit form usually wants `resetForm: false` (default is to reset after a
  successful non-redirect result).
- Debugging: `import SuperDebug from 'sveltekit-superforms';` and `<SuperDebug data={$form} />`.

## Multiple forms on one page

- **Different schemas** (the usual case): nothing extra — superforms derives distinct
  ids and each `superForm` picks its own result out of `ActionData`.
- **Same schema twice on one page**: give each an explicit id —
  `superValidate(zod4(schema), { id: 'a' })` and `superForm(data.a, { id: 'a' })`.
- A form whose inputs mirror another form's store (see the hidden reset form on
  /login) must skip client `validators` — its own store never sees the typed value,
  so client validation would misfire; the server validates instead.

## Nested data, arrays, files

- HTML form posts are flat. For nested objects/arrays set `dataType: 'json'` in
  `superForm` options — this **requires JS** (`use:enhance`); keep schemas flat when
  the no-JS path matters.
- Proxies convert between form data and input formats:
  `dateProxy(form, 'publishedAt', { format: 'datetime-local' })`,
  `intProxy` / `numberProxy` for numeric inputs, `fileProxy` for uploads
  (`<input type="file" bind:files={$avatar} />`).
- File uploads: validate with `z.instanceof(File)` (or `z.file()` in zod v4) and use
  superforms' `fail`/`message`/`withFiles` so file objects are stripped before
  serialization.

## zod v4 notes

- Adapters are `zod4` (server) / `zod4Client` (client) — `zod` / `zodClient` are for
  zod v3 and must not be used here.
- Normalize inside the schema: `z.string().trim().toLowerCase().email('...')` — checks
  run in order, so trim/lowercase happen before the email test.
- `.refine` / `.default` / `.pipe` are supported; constraints (`required`, `minlength`,
  `maxlength`, `min`, `max`, `pattern`) are generated from the JSON schema, but custom
  `.refine` logic only runs at validation time, not as an HTML constraint.
- Cross-field checks go on the object with a `path`:
  ```typescript
  z.object({ password: ..., confirm_password: z.string() }).refine(
  	(d) => d.password === d.confirm_password,
  	{ error: 'Passwords do not match.', path: ['confirm_password'] }
  );
  ```

## Testing actions

Unit-test `+page.server.ts` actions directly (see `src/routes/login/page.server.test.ts`).
Two things matter:

- `superValidate` checks `data instanceof Request` — build a **real** `Request` with a
  `FormData` body; a duck-typed `{ formData: ... }` mock is silently treated as plain
  data and the test will lie to you.

  ```typescript
  const body = new FormData();
  body.set('email', 'user@example.com');
  const request = new Request('https://app.test/route', { method: 'POST', body });
  ```

- Assert on the superforms result shape: failures are
  `{ status: 400, data: { form: { valid, errors, message, data } } }`, successes are
  `{ form }`. Extend the assertions to cover blanked sensitive fields.

## Reference

- Docs: <https://superforms.rocks/> (concepts, API, FAQ — read the live docs, the API
  moves)
- Upstream agent notes: <https://github.com/ciscoheat/sveltekit-superforms/blob/main/AGENTS.md>
- Package exports: `sveltekit-superforms` (client + `superForm`),
  `sveltekit-superforms/server` (server-only: `superValidate`, `message`, `setError`,
  `actionResult`), `sveltekit-superforms/adapters` (`zod4`, `zod4Client`)
