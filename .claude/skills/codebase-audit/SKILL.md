---
name: codebase-audit
description: Use when the user wants a holistic, project-wide review of a codebase to surface bugs, security gaps, performance issues, architectural inconsistencies, dead code, and tech debt — e.g. "프로젝트 전체 리뷰해줘", "코드베이스 점검해줘", "기술 부채 찾아줘", "리팩토링할 부분 있는지 봐줘", "시니어 개발자 입장에서 봐줘", "전반적으로 문제 없는지 확인해줘". This is a whole-repo health check, not a diff review (use code-review for that) or a security-only deep dive (use security-review for that). Reports findings with severity + category and concrete file:line evidence, and explicitly says "no issues" where true instead of manufacturing busywork.
---

# Codebase Audit

## Overview

Act as a senior engineer doing a project-wide health check. The goal is to surface
genuinely significant problems and refactoring candidates — not to demonstrate
thoroughness by listing something for every file. A senior reviewer who finds
nothing wrong in a module says so in one line and moves on; they don't invent a
nitpick to justify the time spent. That restraint is the hardest and most
important part of this skill — apply it throughout, especially in step 5.

## Workflow

### 1. Orient on the project's own rules

Before judging anything, read what the project says about itself:
- `CLAUDE.md`, `AGENTS.md`, `README`, `docs/` (roadmaps, PRDs, ADRs)
- `package.json` / `pyproject.toml` / etc. for stack and scripts
- Any "known issues" / "TODO" / "Phase N pending" notes

Findings are judged against the project's *own* stated conventions and
priorities, not generic best-practice checklists. Two consequences:
- A pattern that looks unusual but matches a documented convention is not a
  finding.
- An issue the project already knows about and has scheduled (e.g. "RLS is
  temporary dev-only until Phase 4") is not a *new* discovery — at most
  mention it briefly as still-open, don't present it as something you found.

### 2. Map the codebase

Get a directory overview and identify:
- Entry points and core domains/modules
- The data layer / API or RPC boundary
- Where tests live (if any)
- Generated, vendored, or build output directories — exclude these from
  "the whole codebase"; reviewing `node_modules`, `dist`, `.next`, lockfiles,
  etc. wastes effort and produces noise.

If the user's request already narrows scope (a directory, a feature area),
respect that instead of going wider.

### 3. Pick a review strategy for the size

- **Small/medium codebase** (fits in a few read passes): review module by
  module directly.
- **Large codebase with several independent domains**: split by domain and
  dispatch `Explore` or `general-purpose` subagents in parallel (see
  `superpowers:dispatching-parallel-agents`). Give each agent: the area to
  scan, the categories below, the project's own conventions from step 1, and
  the instruction to return only findings with `file:line` evidence and a
  one-line "why it matters" — no stylistic nitpicks.

### 4. Categories to look through (a lens, not a checklist to fill)

- **Correctness / bugs** — logic errors, race conditions, off-by-ones, error
  paths that silently swallow failures
- **Security** — injection, auth/authorization gaps, secrets in code,
  unvalidated input at trust boundaries
- **Performance** — N+1 queries, unnecessary re-fetches/re-renders, obviously
  wrong-complexity algorithms on hot paths
- **Architecture / consistency** — code that violates the patterns the
  project itself documents or has established elsewhere
- **Maintainability / tech debt** — duplication, dead code, unclear
  ownership, abstractions that no longer earn their keep
- **Testing / reliability** — missing coverage on critical paths, tests that
  don't actually verify behavior

Not every category will have findings in every project. That's expected and
fine — see step 5.

### 5. The "don't force it" filter

For every candidate finding, ask: *would a senior engineer actually raise this
in a real review, or am I filling a quota?*

**Drop:**
- Pure style/taste differences with no functional impact
- Rewording working code without a concrete benefit
- Hypothetical edge cases the system's actual constraints rule out
- Anything already tracked as known/planned in the project's own docs (step 1)

**Keep:**
- Concrete evidence of a bug, vulnerability, real maintenance cost, or a
  violation of the project's *own* stated conventions
- Anything you'd be uncomfortable shipping if you were the one signing off

If a whole category comes back clean for the reviewed scope, say so in one
line (e.g. "Performance: no notable issues found") so the user knows it was
checked — but don't pad it with marginal items just to have something to show.

### 6. Classify and prioritize

- **Severity:**
  - `Critical` — urgent: data loss, security exposure, broken core flow
  - `Major` — real problem, not on fire: should be planned soon
  - `Minor` — worth doing, low urgency
- **Category:** one of the six from step 4
- Each finding needs: `path/to/file:line`, what's wrong, the concrete
  consequence (why it matters), and a high-level direction for fixing it —
  not a full implementation, unless the user asks for that afterward.

### 7. Report format

Present this directly in conversation (match the language the user is
communicating in):

```
## Summary
[1-3 sentences: overall health, the 1-2 things that matter most]

## Critical
- `path/to/file.ts:42` — what's wrong — why it matters — suggested direction

## Major
- ...

## Minor
- ...

## Reviewed, no issues
- [area]: brief note on why it's fine
```

Omit a severity section entirely if it's empty rather than writing "none
found" under it — but keep "Reviewed, no issues" for areas you did look at
and found healthy, so the user knows the audit covered them.

If there are zero Critical/Major findings, say that plainly. Don't promote
Minor items to fill the gap.

### 8. Close out

This skill is analysis only — don't modify code as part of it. After
presenting the report, offer to dig into specific findings or draft a fix
plan for the prioritized items, and wait for the user's direction.
