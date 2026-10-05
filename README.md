# skills

Personal agent-skills repository (aimmendorf). One skill per directory under
`skills/`, in the open agent-skills layout (`skills/<name>/SKILL.md`), so the
repo works with `npx skills add <owner>/skills@<name>` if it is ever pushed
to GitHub.

## Layout

```
skills/
  comment-sanitation/
    SKILL.md
  impact/
    SKILL.md
    scripts/   # node, no dependencies
    tests/     # node --test skills/impact/tests/impact.test.mjs
```

## Installing a skill locally

Symlink the skill directory into `~/.claude/skills/` so Claude Code picks it
up while this repo stays the single source of truth:

```bash
ln -sfn ~/dev/aimmendorf-skills/skills/<name> ~/.claude/skills/<name>
```

Edit here, never in `~/.claude/skills/` (those are links).

## Authoring conventions

Skills follow the `/writing-great-skills` principles:

- Default to `disable-model-invocation: true` (user-invoked, zero context
  load); pay for a model-facing description only when the agent or another
  skill must reach it autonomously.
- Every step ends on a checkable, exhaustive completion criterion.
- Hunt for a leading word; prune no-ops sentence by sentence.
- Disclose reference to sibling files only when a branch needs it.
