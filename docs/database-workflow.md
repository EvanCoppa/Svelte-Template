# Shipping schema changes: CI, deploys, and preview branches

Local development is covered in the README (`npm run db:start`, `db:reset`, `db:env`) and
the schema rules are in CLAUDE.md. This file is about what happens **after** you commit a
migration: how CI checks it, how it reaches production, and when it is worth paying for a
cloud preview branch.

Schema changes travel one way: **a SQL migration in `supabase/migrations/` → the local
stack → CI → production.** Nothing enters production that did not start as a committed
migration.

## What CI checks

The `database` job in [`ci.yml`](../.github/workflows/ci.yml) runs on every PR and costs
nothing — it never touches a cloud project:

| Step                     | Catches                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `npx supabase db start`  | a migration that only applies against today's production schema; anything that fails from an empty database |
| `npm run db:lint`        | schema-level typing errors                                                                                  |
| `npm run db:types:check` | a schema change that landed without regenerating `database.types.ts`                                        |

The last one is why the Supabase CLI is pinned in `devDependencies` rather than invoked as
a floating `npx supabase@latest`: generated output changes between CLI versions, so an
unpinned CLI would fail this check on version drift instead of on real drift. Always use
`npx supabase`, which resolves to the pinned binary.

`db:types:check` writes the corrected file before failing, so a failed CI run leaves
`git diff` showing exactly what was missed.

## Deploying to production

Merging to `main` with changes under `supabase/migrations/` runs
[`db-deploy.yml`](../.github/workflows/db-deploy.yml): link the production project, print
the pending migrations, apply them.

**CI is the only sanctioned path.** `supabase db push` from a laptop applies a migration
whose file may not be committed, and from then on the remote migration history and the
repo disagree with nothing to detect it.

The job runs in the `production` GitHub environment, so adding required reviewers there
gates every production schema change behind a human. A `concurrency` group keeps two
deploys from interleaving on one migration history.

## Preview branches (the expensive path)

A Supabase preview branch is a **real, separately billed Postgres project**. The economics
are the whole reason this repo does not use Supabase's automatic branching:

- **$0.01344/hour** on the default Micro compute — about **$0.32/day**, **$9.70/month** if
  it never gets deleted.
- **Compute Credits do not apply** to branch compute. The $10/month credit that absorbs
  your main project's compute does nothing here.
- **Branches are excluded from the org spend cap.** There is no ceiling that stops them.

Automatic branching creates one of these for _every_ PR. That is real money for something
the free `database` job already covers. So a cloud branch is opt-in, for when you need what
a local Postgres cannot give you — a real project URL for a preview deploy, hosted Auth,
Storage, Realtime.

### Using one

Add the **`db:preview`** label to a PR. [`db-preview.yml`](../.github/workflows/db-preview.yml)
creates a branch named after the git branch, waits for the migrations to actually pass (so a
broken migration fails the check rather than going green early), and comments on the PR with
the branch's project ref.

Credentials stay out of the comment on purpose — they are one click away in the dashboard
for anyone who already has project access.

### How it gets deleted

Three independent things, because the expensive failure mode is a branch nobody remembers:

1. **Remove the `db:preview` label** → deleted immediately.
2. **Close or merge the PR** → deleted immediately.
3. **[The reaper](../.github/workflows/db-preview-reaper.yml)**, every three hours, deletes
   any ephemeral branch older than 24 hours, or whose PR has closed, or whose PR has dropped
   the label. Persistent branches are never touched.

The reaper is the one that matters. The first two only fire if the event fires and the
workflow succeeds; the reaper catches everything else, including branches created by hand in
the dashboard. Adjust its window with the `SUPABASE_PREVIEW_MAX_HOURS` repo variable, or run
it from the Actions tab with **Report what would be deleted** ticked to see what it would do.

Worst case exposure is one forgotten branch for 24 hours: about **$0.32**.

## One-time setup

The template ships the workflows, not the credentials.

**1. GitHub secrets** (Settings → Secrets and variables → Actions):

| Secret                  | Where to get it                                             |
| ----------------------- | ----------------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN` | <https://supabase.com/dashboard/account/tokens>             |
| `SUPABASE_PROJECT_ID`   | production project ref (the `<ref>` in `<ref>.supabase.co`) |
| `SUPABASE_DB_PASSWORD`  | production database password                                |

**2. The `db:preview` label** — create it on the repo, otherwise nobody can opt a PR in.

**3. The Supabase GitHub integration** (Project Settings → Integrations → GitHub).
Required for preview branches: it is what lets Supabase read `supabase/migrations/` at the
PR's commit. Set **Working directory** to `.`. Then, and this matters:

- **Automatic branching: OFF.** On, it creates a billed branch per PR and makes
  `db-preview.yml` pointless.
- **Deploy to production: OFF.** On, it races `db-deploy.yml` on the same migration
  history. Two mechanisms writing one history is worse than none.

**4. If the project already has the schema** — applied by hand in the SQL editor, or seeded
through the API — the remote migration history will not line up with the filenames in
`supabase/migrations/`, and the first CI deploy will try to re-apply everything. Reconcile
it once:

```bash
npx supabase link --project-ref <ref>
npx supabase migration list --linked                      # compare both sides
npx supabase migration repair --status applied <version>  # per already-applied file
```

`<version>` is the migration filename's leading timestamp (`20260828000000` for the profiles
migration). Afterwards `npx supabase db push --dry-run` should report nothing pending.

**5. Branch protection** — require the `database` check on `main` so a migration that fails
to apply cannot merge.

**6. Optional: `production` environment reviewers** (Settings → Environments) to require
approval before any migration reaches production.
