# CLAUDE.md

## Orientation (read this first)

**63 tools: 26 offline, 37 live.** `AGENT_TOOLS.md` is the generated index and
`dist/tools.json` the machine-readable form — both derived from the server's own
`tools/list`, so neither can drift from what is registered.

- **Start an authoring task with `wb_playbook`**, not from memory. It returns
  preconditions, the ordered tool calls, the traps that fail *silently*, and the
  verification. `{"query":"catalogue"}` lists all 19.
- **`wb_knowledge`** for engine facts and API detail (48 subject-oriented docs).
- **The `wb_` prefix does NOT mean "needs Workbench."** `wb_knowledge` and
  `wb_playbook` are `wb_`-prefixed and fully offline.
- **Only 37 tools need the live bridge**, and those need Workbench running *and
  focused*. An unfocused editor reports itself as `play mode`; that is a lie, and
  chasing `wb_stop` on it wastes the session.

## Documentation is generated, never hand-edited

| Artifact | Generator | Drift guard |
|---|---|---|
| `data/kb/index.json` | `npm run kb:index` | `--check`, in the test suite |
| `data/kb/playbooks/index.json` | `npm run playbooks:index` | `--check`, in the test suite |
| `AGENT_TOOLS.md`, `dist/tools.json` | `npm run agent:index` | `--check`, in the test suite |

If you add a tool, a KB doc, or a playbook, **regenerate** — do not hand-edit the
index. `tests/tools/doc-integrity.test.ts` fails if the docs and the code
disagree, which is how the README came to advertise five tools that do not exist.

## Repo conventions

- **Editing docs or config?** This repo has **mixed line endings** and a
  whole-file rewrite normalises them all, turning a two-line change into a
  several-hundred-line diff. Use `scripts/docpatch.py` (byte-preserving,
  refuses ambiguous anchors) or copy the original bytes and patch surgically.
  `tests/tools/line-endings.test.ts` guards the known-mixed files.
- **Adding a playbook** means writing a markdown file in `data/kb/playbooks/`
  with YAML front-matter (`id`, `title`, `goal`, `humanStep`, `tools`,
  `triggers`, `seeAlso`) and regenerating the index. Triggers are the retrieval
  surface — an empty list makes the playbook unfindable.
- **Every claim in a playbook must be traceable** to a KB doc, a tool schema, or
  a recorded field observation. When something is not documented, write that it
  is not — do not fill the gap with a plausible answer.

## Agent skills

### Issue tracker

Issues live as GitHub issues; use the `gh` CLI for all operations. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
