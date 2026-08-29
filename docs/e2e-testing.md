# End-to-end regression testing

Vitest covers server logic — actions, load functions, the auth helpers — with Supabase
stubbed. Playwright covers what only a real browser can tell you: that the built app
boots, hydrates, navigates, and enforces its auth contract through the redirect chain,
the adapter and the CSP.

The suite is built to be run **automatically and often**, by CI and by an agent working
in the repo, so two properties matter more than breadth:

1. **It works on a fresh clone with no credentials.** The signed-out tier needs nothing
   but the repo.
2. **It extends itself.** The route list is read from `src/routes`, so a new page under
   `(app)` is swept the moment it exists — there is no list to remember to update.

## Layout

```
e2e/
  auth.setup.ts           # mints one session per run, saves the cookies
  support/
    fixtures.ts           # the house `test` — console-error guard
    routes.ts             # route discovery + the guard's public/protected split
    session.ts            # credentials, magic-link minting, storage-state path
  guest/                  # tier 1 — no backend, no secrets
    auth-guard.spec.ts    # the broad sweep: every route, signed out
    login.spec.ts         # one area, in detail
    security-headers.spec.ts
  app/                    # tier 2 — signed in, needs a Supabase project
    route-sweep.spec.ts   # the broad sweep: every route, signed in
    navigation.spec.ts    # one area, in detail
    settings.spec.ts      # one area, in detail
  visual/                 # opt-in pixel baselines
```

**Broad and shallow, then narrow and deep.** The two `*-sweep` specs visit every page and
assert only what must be true of any page: HTTP 200, a title, an `<h1>`, the app shell,
no request that 4xx-ed, and nothing on the console. They are the regression net. Anything
that needs a second click belongs in an area spec beside them — one file per area, named
for the area, not for the page.

## The two tiers

|         | `guest`                                                           | `app`                                     |
| ------- | ----------------------------------------------------------------- | ----------------------------------------- |
| Needs   | nothing                                                           | a Supabase project                        |
| Runs on | every push, every PR, forks included                              | pushes and PRs with repository secrets    |
| Covers  | the auth guard over every route, the login form, security headers | every page rendered, navigation, settings |

`playwright.config.ts` declares the `app` and `setup` projects **only when credentials are
present**, so `npm run e2e` on a fresh clone runs the signed-out tier and passes rather
than failing on missing configuration. A one-line warning says what was skipped.

### Enabling the signed-in tier

Locally, in `.env` (a `.env` already set up for `DEV_AUTO_LOGIN` needs only the first two —
`DEV_AUTO_LOGIN_EMAIL` is accepted as the account):

```bash
SUPABASE_SERVICE_ROLE_KEY=...   # server-only, never prefixed PUBLIC_
E2E_USER_EMAIL=e2e@example.com
```

In CI, as repository secrets: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `E2E_USER_EMAIL`. Missing any of them skips the job with a
notice instead of failing it.

**Point it at a project you are willing to have written to.** The suite signs the account
in and updates its `profiles` row. Use a dedicated Supabase project, or at least a
dedicated account; the account is created on first run if it does not exist.

### How signing in works

`e2e/auth.setup.ts` mints a single-use magic link with the service-role key and redeems it
by navigating to the app's own `/auth/confirm`, then saves the resulting cookies to
`e2e/.auth/user.json` (gitignored) for the `app` project to reuse. This is the same
mechanism as `DEV_AUTO_LOGIN` (`src/lib/server/dev-auto-login.ts`), with the same
consequences: no password is stored anywhere, no test credential is committed, and the
session under test is a genuine `@supabase/ssr` session rather than a fixture.

It is deliberately **not** `DEV_AUTO_LOGIN` itself — that flag signs in every request,
which would make the signed-out tier untestable in the same server.

## Running it

```bash
npm run e2e              # everything the current configuration allows
npm run e2e:guest        # tier 1 only
npm run e2e:app          # tier 2 only (signs in first)
npm run e2e:ui           # the Playwright UI, for writing specs
npm run e2e:report       # open the report from the last run
```

Playwright builds the app and serves it with `vite preview` — the production build, not
the dev server, because that is what Vercel runs and the only way the security headers
and CSP under test match what a visitor gets. `reuseExistingServer` is on outside CI, so
a preview server already listening on 4173 is reused.

To run against something already deployed instead — a Vercel preview, staging — set
`E2E_BASE_URL` and Playwright skips the build entirely:

```bash
E2E_BASE_URL=https://my-app-git-branch.vercel.app npm run e2e:guest
```

That is what `.github/workflows/e2e-deployment.yml` does on every successful deployment.

## The console guard

Every test fails if the page logged an error or threw, via the `consoleErrors` fixture in
`e2e/support/fixtures.ts`. This is the highest-value assertion in the suite: it catches
effects that throw, double hydration, CSP violations and dead attributes that no visible
assertion would notice. It found the invalid `pattern` on the login page's email input the
first time it ran.

Failures loading a **third-party** asset are ignored — the `/components` avatar demo pulls
an image from github.com and someone else's outage is not this app regressing. Everything
from the app's own origin counts. Do not add exceptions to that list: fix the error.

## Where validation surfaces

Worth knowing before writing a form spec: superforms projects the zod schema onto the
inputs as HTML constraints (`required`, `pattern`, `minlength`, `maxlength`), so a
single-field violation is refused by the **browser** and never reaches superforms'
client validators — there is no inline error text to assert on, only an invalid input
and a form that did not submit. Only what HTML cannot express — a cross-field refinement
like "these two passwords must match" — renders as an inline superforms message. The
specs assert whichever is actually true for the field; both are real coverage.

## Writing a spec

- Import `test` and `expect` from `../support/fixtures`, never from `@playwright/test`
  directly, or the spec silently loses the console guard.
- Locate by **role and accessible name** (`getByRole`, `getByLabel`, `getByText`). Reach
  for a CSS selector only where the DOM offers no semantics — `[data-slot="sidebar"]` for
  the app shell, `#reset-form input[name="email"]` for a deliberately hidden field — and
  say why in a comment. Never assert on a Tailwind class.
- Assert **user-visible behaviour**. Never read the database mid-test to check a write
  landed; reload the page and look at it.
- Keep specs independent: each gets a fresh context from the saved storage state, so no
  spec may depend on another having run, and none may leave the account unusable. That is
  why the settings spec exercises the password form only through its failure paths — an
  actually-changed password would break every later run.
- Server-side edge cases stay in Vitest. If Supabase has to be stubbed to test it, it is
  not an E2E test.

## Visual regression

Opt-in, because pixel baselines are platform-specific and a mismatched one produces
nothing but font-rendering noise. `playwright.config.ts` declares the `visual` project
only once `e2e/visual/__screenshots__/` exists.

```bash
npm run e2e:visual:update   # create/refresh baselines, then commit them
npm run e2e:visual          # check against them
```

Baselines must be generated on the platform CI runs on, or every diff is an artefact.
The reliable way is the Playwright image CI uses:

```bash
docker run --rm --network host -v "$PWD:/work" -w /work \
  mcr.microsoft.com/playwright:v1.62.1-noble npm run e2e:visual:update
```

Once `e2e/visual/__screenshots__/` is committed, the `e2e-app` job runs the visual project
automatically. Until then that step is skipped.

## CI

`.github/workflows/ci.yml` adds two jobs to the existing four:

- **`e2e (signed out)`** — always runs, no secrets, forks included.
- **`e2e (signed in)`** — gated on the `supabase-secrets` job, which exists only because
  `secrets` cannot be read from a job-level `if`. Skipped with a notice when unset.

Both cache `~/.cache/ms-playwright` on the Playwright version and upload
`playwright-report/` as an artifact — traces are captured on the first retry, so a CI-only
failure is reproducible locally with `npx playwright show-trace`.

`.github/workflows/e2e-deployment.yml` runs the signed-out tier against each successful
deployment. Note that Vercel's deployment protection returns 401 to anonymous callers;
either disable it for previews or the sweep never gets past the first request.
