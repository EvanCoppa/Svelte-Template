# Vendored skill provenance

Every skill in this directory is third-party content, copied in rather than
installed, so it version-controls with the repo and works on a fresh clone.
Each is verbatim from upstream unless noted, which keeps a re-sync a clean diff.

| Skill | Upstream | Commit | License |
| --- | --- | --- | --- |
| `transitions-dev` | [Jakubantalik/transitions.dev](https://github.com/Jakubantalik/transitions.dev) `skills/` | `a0570ed` | not stated upstream |
| `transitions-polish` | same | `a0570ed` | not stated upstream |
| `svelte-core-bestpractices` | [sveltejs/ai-tools](https://github.com/sveltejs/ai-tools) `tools/skills/` | `7e98403` | MIT |
| `svelte-code-writer` | same | `7e98403` | MIT |
| `tailwind-best-practices` | [evilmartians/agent-skills](https://github.com/evilmartians/agent-skills) | see `LICENSE` | MIT |
| `tailwind-4-docs` | [Lombiq/Tailwind-Agent-Skills](https://github.com/Lombiq/Tailwind-Agent-Skills) | see `LICENSE.md` | BSD-3-Clause |
| `svelte-runes` | [spences10/svelte-skills-kit](https://github.com/spences10/svelte-skills-kit) | `2a9d883` | **none stated** |
| `svelte-template-directives` | same | `2a9d883` | **none stated** |
| `sveltekit-structure` | same | `2a9d883` | **none stated** |
| `sveltekit-data-flow` | same | `2a9d883` | **none stated** |

## Notes

**`spences10/svelte-skills-kit` publishes no license file.** It ships as an
installable Claude Code plugin, so distribution is clearly intended, but absent
a stated license the default is all-rights-reserved. Those four skills are
vendored here on that understanding; if that is not acceptable, drop the
directories and install the upstream plugin instead, which leaves nothing
third-party committed to this repo.

**`tailwind-4-docs` ships no docs snapshot.** Upstream
`tailwindlabs/tailwindcss.com` is source-available but not open-source, so the
snapshot must be initialized per checkout:

```
python .claude/skills/tailwind-4-docs/scripts/sync_tailwind_docs.py --accept-docs-license
```

Until then the skill is instructed to stop and ask rather than answer, falling
back to `references/gotchas.md` and its engineering playbook. `.gitignore`
excludes the snapshot paths so a synced copy is never committed here. Its
SKILL.md is the one non-verbatim file: the documented init path was
repo-root-relative and needed the `.claude/` prefix to resolve from here.

## Re-syncing

Clone the upstream repo, copy the skill directory over the one here, and
re-check the notes above. Only `tailwind-4-docs/SKILL.md` carries a local edit.
