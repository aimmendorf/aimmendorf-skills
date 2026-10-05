---
name: impact
description: Before changing a symbol, file, database object, column or test id, list everything that depends on it across code, schema, workflows, tests, config and docs. Read-only.
disable-model-invocation: true
---

# Impact

Answer one question before an edit: if this changes, what else moves? Works
in any git repo and any language; precise adapters switch on only where the
repo has that layer. Read-only: it reports, it never edits or recommends.

## Run

```bash
node ~/.claude/skills/impact/scripts/run.mjs <target> [--root <repo>] [--all]
```

`<target>` is one of:

| Target | Example |
|---|---|
| Symbol | `bookRenewalCall`, `PrefixCache`, `NewStoreResolver` |
| File | `src/lib/content/resource-files.ts`, `kev/serve.py` |
| Database object | `participant_qualifications`, `admin_set_qualification` |
| Column | `profiles.birth_year` |
| Test id | `renewal-call-slot` |

`--root` defaults to the git top-level of the current directory. Each section
shows 25 files; `--all` shows everything.

Done when the script has exited and its report is relayed (step 2).

## What it reads

Files come from `git ls-files -co --exclude-standard`, so each repo's own
`.gitignore` decides what is build output. `.env*` files are never read
(`.env.example` is). Files over 1 MB and minified bundles are skipped.

| Layer | Switches on when | How it matches |
|---|---|---|
| Text | always | whole-word, any language; config and docs separately |
| TypeScript | `tsconfig.json`/`jsconfig.json` + the repo's own `typescript` | language service `findReferences` (type-aware, follows re-exports, path aliases); for files, every importer |
| SQL | a folder of versioned `.sql` files (`00111_`, `20240101_`, `V3__`, prisma stamps) | replays the chain: only the latest definition of each function, view, policy, trigger, index or cron job counts; dropped objects disappear |
| One hop | SQL finds a function or view that uses the target | that object's callers, workflows and code, labelled `via <object>` |
| Workflows | any JSON shaped like a workflow export (`nodes[].type`) | node parameters naming the target |
| Test ids | a component renders the id (`data-testid`, `data-test`, `data-cy`, `data-qa`, `testID`) | renderers + every test that selects it |

Tests are recognized by common conventions (`*.test.*`, `*.spec.*`,
`*_test.go`, `test_*.py`, `*_spec.rb`, `tests/`, `__tests__/`, `e2e/`,
`cypress/`, `playwright/`) and tagged `[test]` / `[e2e]`.

## Steps

1. Run the script with the user's target. If the target is ambiguous (a name
   that is also a file, a column without its table), ask which one before
   running.
2. Relay the report as the script printed it, then add only:
   - the closing line verbatim (`Tests touching it: N` or
     `NO TEST COVERS THIS`, or `Nothing references …`);
   - which adapters ran, when a layer the user expects did not (no tsconfig,
     no versioned migrations, no workflow exports).

   Do not rank findings, propose changes or start editing. The user decides
   what to do with the list.

## Limits

- Text matches are unverified: a shared name (`status`, `serve`) collides.
  Only the TypeScript and SQL layers are exact.
- Dynamic references are invisible: computed property names, string-built
  SQL, `data-testid={id}` passed through props (template prefixes like
  `` `row-${k}` `` are reported as `row-*`).
- Workflow exports in the repo can lag the live instance.
- SQL parsing targets Postgres-style DDL; other dialects fall back to text.
