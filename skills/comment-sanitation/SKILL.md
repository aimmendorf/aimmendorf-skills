---
name: comment-sanitation
description: Sweep a diff or file set for comment quality. Keep load-bearing comments, delete narration, prove the gate still passes.
disable-model-invocation: true
---

# Comment Sanitation

Every comment is either load-bearing or it goes. A comment is load-bearing
when deleting it loses information the code cannot carry: a constraint, a
why, a removal condition. Narration, restating the code, describing the
change that produced it, or arguing the change was correct, is never
load-bearing.

## Step 1: Scope

Establish the sweep set: the diff range or file list the user names. Default
when unnamed: every file changed on the current branch against its base.
Split the set into three classes:

- IMMUTABLE: applied database migrations, generated files, vendored code.
  Never edit these, comments included; record findings for the report
  instead.
- PINNED: files that some test reads as text. Find them by grepping test
  files for the target's path or for distinctive strings from it. Editable,
  but every pinned file's tests re-run in Step 3.
- FREE: everything else.

Done when: every file in the sweep set sits in exactly one class, listed.

## Step 2: Sweep

File by file, give every comment a verdict: KEEP, REWRITE, or DELETE.
Failing any rubric test is DELETE; load-bearing but badly said is REWRITE.
Apply REWRITE and DELETE immediately in FREE and PINNED files; in IMMUTABLE
files record the verdict only.

The first four tests are adapted from petekp/claude-code-setup@code-comments.

1. Why test: the comment explains why the code exists or why it works this
   way. Restating what the code does fails.
2. Obviousness: if the code already says it, the comment may not say it
   again. `user.isAdmin // checks if user is admin` fails.
3. Expiry: a workaround, version gate, or temporary path names its removal
   condition ("remove after Safari 14 support drops"). An expirable comment
   missing its condition gets the condition ADDED; it is load-bearing,
   just incomplete.
4. Constants: a comment references a constant by name and never restates
   its value; restated values drift. Unit glosses on bare literals
   (`1048576 // 1MB`) pass.
5. Review chatter: comments addressed to a reviewer fail on sight: where
   code was copied from, what it replaced, why the change was correct.
   Git history carries all of that.
6. House style: match the surrounding file's comment density and idiom, and
   honor the repo's bans (this user's standing ban: no em dashes in
   comments, prose, or UI copy). A codebase that documents constraints
   heavily sets a heavy bar; sanitation is not minimization.

Done when: every comment in every sweep-set file carries a verdict and
every FREE and PINNED verdict is applied.

## Step 3: Prove

Comments can be load-bearing for tests: rendered JSX text, snapshots,
source-scan tests that grep files. So:

- Re-run the repo's full gate (typecheck, lint, unit tests).
- Re-run the specific test behind every PINNED file that was touched.

Done when: the gate is green and every pinned test has re-run green.

## Step 4: Report

One line per edited file with kept/rewritten/deleted counts, then the
IMMUTABLE findings quoted with file:line for the user to judge, then the
gate results. Never commit; the user owns commits.
