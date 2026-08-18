---
name: comment-sanitation
description: Batch comment audit of a scoped file set with precedent-based auto-verdicts (keep/rewrite/delete/line-by-line) and a human review queue for dead code, contradictions, and low-confidence calls. Manual exhibit-by-exhibit mode on request.
disable-model-invocation: true
---

# Comment Sanitation

Courtroom, two speeds. The user is the JUDGE; the agent is the CLERK. In
BATCH mode (default) the clerk applies settled precedent itself and brings
the judge only the contested docket. In MANUAL mode (judge says "manual",
or rules it per file) every comment is one exhibit, one message, one
ruling, exactly as v1 worked. The judge may overturn ANY applied verdict
by name at any time; the docket records every verdict either way.

Every comment is either load-bearing or it goes. A comment is load-bearing
when deleting it loses information the code cannot carry: a constraint, a
why, a removal condition. Narration, restating the code, describing the
change that produced it, or arguing the change was correct, is never
load-bearing. The six tests below are the doctrine; the precedent tables
are their case law. When a comment matches no precedent, it is FLAGGED,
never guessed at.

The clerk is a SCRIBE, never an author. A scribe deletes, retenses, and
re-punctuates the words already on the page; a scribe does not compose.
An edit needing a clause the original never contained is authorship, and
authorship is verdict 5, however well a precedent seems to fit. Measured
facts (counts, measurements, incident numbers) are EVIDENCE: kept
verbatim, deleted whole, or flagged; never rounded, generalized, or
turned hypothetical.

Precedent is construed narrowly: a judge ruling authorizes that instance,
not a class, unless the judge says "class". The tables below are the only
standing classes.

## Verdicts

1. KEEP - untouched.
2. REWRITE - SUBTRACTIVE only. Permitted operations, exhaustively:
   delete words or sentences; retense a verb (was/did -> is/would); swap
   banned punctuation; drop a label or citation; substitute a stable name
   for a restated value or line number. Anything else is authorship:
   verdict 5.
3. DELETE - the comment (never code, in batch mode) is removed.
4. LINE-BY-LINE REWRITE - a summary JSDoc over a mock queue-builder or
   fixture becomes per-line trailing labels at each slot/field.
5. FLAG FOR HUMAN REVIEW - queued for the judge, sub-typed:
   a. redundant / unused / dead code suspicion
   b. code and comment contradict, or the comment is nonsense
   c. low confidence - no precedent fits
   d. the edit would require composed language, or touches EVIDENCE
   e. a test-file header whose purpose statement would change, a
      characterization baseline, or a lint-suppression justification:
      always queued, never re-aimed or trimmed unilaterally

Flags are the CHEAP path. An empty flag queue is the claim that needs
defending, not the applied counts.

## Step 1: Docket

If `comment-docket.md` exists at the target repo root, resume from its
position marker. Otherwise:

- Ask the judge for the sweep set if not already named. Never assume a
  default scope.
- Count comment BLOCKS per file up front (line-start block starts plus
  trailing inline comments) and put real denominators in the docket.
  Never publish an estimated total; a moving target reads as dishonesty.
- Split the set into three classes:
  - IMMUTABLE: applied database migrations, generated files, vendored
    code. Never edited; verdicts recorded only.
  - PINNED: files some test reads as text. Find them by grepping tests
    for readFileSync/readdirSync and path literals. Note whether the
    pinning test strips comments (a `code()` helper) before matching -
    most do, but each pinned file's tests re-run after its edits anyway.
  - FREE: everything else.
- Write `comment-docket.md`: scope, classes, ordered walk with block
  counts, position marker. Gitignore it.

## Step 2: Batch pass (per file)

Work ONE file at a time, in walk order.

1. Read the whole file. Classify every comment block against the
   precedent tables. Anything unmatched or doubtful becomes a FLAG.
2. VERIFY before trusting either the comment or the doubt:
   - Dead-code suspicion: grep for callers, check test coverage, and
     where cheap and read-only, check live data (a guard for rows that
     cannot exist is dead). Present evidence, not vibes.
   - Contradiction suspicion: check the generated types, the schema, or
     the module the comment points at before claiming the comment lies.
3. Apply verdicts 1-4 immediately (edit FREE and PINNED; record-only for
   IMMUTABLE). Batch mode NEVER deletes or edits code on its own - code
   changes (dead branches, dead mocks, dead actions) are always FLAG (a),
   applied only after the judge rules.
4. Re-run the file's pinning tests, and the file's own suite when the
   file IS a test.
5. Present ONE per-file report message:
   - counts: kept / rewritten / deleted / line-by-lined
   - every REWRITE and DELETE listed one-line with its anchor, so the
     judge can overturn by name
   - the FLAG queue, each item with: the comment quoted, the code block
     it annotates, the evidence gathered, and a proposed resolution
   - test results
6. The judge rules on flags (and any overturns), the clerk applies, the
   docket updates, next file.

The judge can interleave: `manual` switches the next file to
exhibit-by-exhibit; `batch` switches back; `park` ends the session
(update docket, run Step 3, report per Step 4).

## The six tests (doctrine)

Tests 1-4 adapted from petekp/claude-code-setup@code-comments.

1. Why test: explains why the code exists or works this way. Restating
   what it does fails.
2. Obviousness: if the code already says it, the comment may not.
3. Expiry: a workaround or temporary path names its removal condition.
   An expirable comment missing its condition gets the condition ADDED.
4. Constants: reference constants by name, never restate values. Unit
   glosses on bare literals pass.
5. Review chatter: comments addressed to a reviewer fail on sight:
   where code was copied from, what it replaced, why the change was
   correct. Git history carries all of that.
6. Anti-slop: match the file's comment density and idiom; honor repo
   bans (this judge's standing ban: no em dashes in comments, prose, or
   UI copy). Overcommenting is slop; thinning a constraint-heavy
   codebase to look clean is slop too.

## Precedent tables (case law)

### DELETE on sight
- Narration of the adjacent statement ("Fetch template", "Check slug
  uniqueness", "Build placeholder map", "Create sections...").
- Prose restating an assertion or an it()/describe title.
- In-file duplicate of a fact the file's own header/JSDoc already pins.
- Change-relative one-liners with nothing left to anchor ("as before",
  "no longer", "now that X").
- Provenance-only notes: where code came from ("merged from MGP",
  "inlined from X", "harness idiom from Y"), unless a real constraint is
  buried inside - then REWRITE to the constraint alone.

### REWRITE on sight (constraints kept, defects out)
- Em dashes -> colon / semicolon / period. Check your OWN rewrites too.
- Review citations ("eng review YYYY-MM-DD, finding N", "review army",
  "adversarial review", "QA <date>", "user ruling <date>", "audit
  <date>"): drop the citation, keep the constraint.
- Plan/report labels (T1..T99, D-4, D-C, D-G, #NN, 00027-style ids,
  P2.2, v3.2, section signs): drop, or resolve to a real in-repo target
  (a doc, a test file, TODOS.md) when the pointer does work. When a
  describe title carries the label, rename the title to the descriptive
  name and carry it through the file.
- Fix narration ("used to X, now Y", "before this existed", "the bug
  this fixes was...", incident dates, "for weeks", quoted console
  errors): retense into a standing rule using only the original's words.
  Keep the failure MODE, drop the story. If no rearrangement of the
  original words yields the rule, FLAG (d). Negative pins are the
  exception: "removed on purpose" style facts survive, because without
  them the missing feature reads as a bug and gets re-added.
- Version/line pins ("library 1.62 wants chromium-1234", "schema.sql:209")
  -> the stable name (constraint name, constant, file).
- Restated constant values -> the constant's name.
- TODO comments -> a self-contained TODOS.md entry (status, what, shape
  of the fix, where), comment shrinks to constraint + "Tracked in
  TODOS.md." This applies to TODO-shaped notes without the keyword too:
  "HUMAN DECISION OPEN", "residual tracked as <label>", deferred-fix
  paragraphs.
- Repeated boilerplate across sibling files (the same 2-line
  explanation pasted N times): keep ONE canonical copy in the file that
  explains it best; every other site becomes a one-line pointer to it.

### LINE-BY-LINE on sight
- A one-line JSDoc summarizing a chain-mock queue-builder's slot order
  -> per-line trailing labels on each push, param semantics folded into
  the relevant line's label.
- A JSDoc describing which fields of a big fixture literal matter -> a
  trailing label on each load-bearing line at its exact depth.

### KEEP on sight
- Position-map label sets in chain-mock tests (slot -> query), including
  the trailing "falls through to the chain default" note.
- Magic-value glosses: why THIS hex/number (contrast math, boundary
  values, format examples like `landing-pages/<id>/<file>`).
- Mock-to-reality bridges: what the mocked value means in production
  ("the real limiter returns allowed:false when its RPC is missing").
- Partial-mock rationale: importOriginal keeps X real because X is the
  behavior under test.
- Threat models and gate rationales at enforcement sites.
- Scope-of-guarantee blocks (what is gated, what is deliberately NOT,
  and why); relocate them onto the function they describe if stranded.
- Ordering constraints (MUST run before/after X, gate-before-try,
  error-before-data).
- Fail-open/fail-closed policy statements with their reason.
- Cross-file couplings and keep-in-step pointers.
- Expiry comments WITH their removal condition.
- Anti-tighten / anti-fix pins ("deliberately lenient", "accepted
  drift", "must stay blocking or the case above proves nothing").
- @ts-expect-error trailing prose explaining what the suppression pins.

### FLAG on sight (never auto-resolve)
- The comment says "no callers today" / guards a state that may not
  exist / references retired systems: verify, then flag with evidence.
  Removal of the code is the judge's call even when proof is total.
- The comment contradicts code, schema, or another file's corrected
  claim (propagate corrections: a claim fixed in one file is wrong in
  its siblings too - search for them).
- The stated semantic looks wrong ("legacy behavior" for what is
  actually a live third state; "handled below" with nothing below).
- Anything where two precedents collide or none fits.

## Step 3: Prove

Tests prove the code; the FIDELITY AUDIT proves the words.

- FIDELITY AUDIT, before every batch report: reread the batch's own diff
  hunk by hunk. Every comment hunk whose ADDED lines carry substantive
  words absent from its REMOVED lines is a flag, listed in the report.
  This is a string property, not a judgment call. Completion criterion:
  every such hunk accounted for; "no flags" may be written only beside
  "fidelity audit ran: N hunks with new words, all listed."
- After each PINNED file: re-run its pinning tests.
- After any file that IS a test: run it.
- After any judge-approved code removal: typecheck + the affected
  suites, results in the report.
- At park or docket end: the repo's full gate (typecheck, lint, unit
  tests). Investigate lint noise before reporting it - stale worktrees
  and generated trees can pollute counts; report gate status for the
  SWEPT tree explicitly.

## Step 4: Report

Per park/completion: one line per edited file with counts, the FLAG
rulings made, IMMUTABLE findings quoted for paper rulings, gate results,
and the docket position for the next session. Never commit; the judge
owns commits.
