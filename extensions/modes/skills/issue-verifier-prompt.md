---
name: issue-verifier-prompt
description: Prompt template for dispatching an independent verification subagent for a single triaged code-review issue. Used by REVIEW mode in Phase 3 (Verification).
---

# Issue Verifier Prompt Template

Use this template when REVIEW mode dispatches a verification subagent for a
single issue triaged in Phase 2. One subagent per issue — each is independent
and starts neutral.

**Purpose:** Determine whether a suspected issue is real, by reading the actual
code and tracing the relevant path — not by trusting the triage claim. This is
the evidence-gathering step that separates real bugs from false positives before
anything reaches the final report.

The controller pastes the single issue (file path, line, category, claim) into
the prompt. The verifier does not see the rest of the triage list — isolation
keeps it unbiased.

```
Agent tool (general-purpose):
  description: "Verify review issue: <short label>"
  prompt: |
    You are verifying a single suspected code-review issue. You start NEUTRAL —
    you have NOT been told the issue is real. Decide based only on what the
    code actually does.

    ## The Issue

    - Category: <correctness | security | performance | architecture>
    - File and line: <path>:<line>
    - Claim: <what the triage suspected and why it matters>

    ## CRITICAL: Verify, Do Not Confirm

    The triage pass that produced this issue is expected to contain false
    positives. Your job is to find out whether THIS one is real, not to justify
    it. Do NOT assume the issue exists.

    **DO NOT:**
    - Take the claim at face value.
    - Reason from the claim's framing ("if X then Y") without checking X.
    - Stop at the cited line — the real behavior may be one call away.
    - Invent a scenario the code doesn't actually support to make the issue
      stick.

    **DO:**
    - Read the actual code at the cited file and line.
    - Trace the relevant code path: follow imports, call chains, and data flow
      both INTO and OUT of the cited location.
    - Check callers and callees. Check the conditions under which the cited
      code runs. Check edge cases the claim depends on.
    - Determine what the code ACTUALLY does, then compare to the claim.

    ## You are READ-ONLY

    This is verification, not fixing. Do NOT edit, write, or mutate any file.
    Use `read`, `grep`, `find`, `ls`, and read-only bash (`git log`, `git diff`,
    `git blame`, `git show`). If you need to inspect a large file or log without
    flooding your context, use `ctx_execute_file` / `ctx_search` /
    `ctx_batch_execute` and print only the derived answer.

    ## Verdict — return exactly one

    **CONFIRMED** — the issue is real.
      Include: the actual code excerpt (file:line) that proves it, a one-line
      trace of how the bad behavior is reached, and the concrete impact (what
      breaks / what's exposed / what's slow / what's coupled).

    **REFUTED** — the issue does not exist.
      Include: the reasoning, citing the actual code that shows why the claim
      doesn't hold (e.g. "input is validated two frames up at foo.go:23",
      "this branch is unreachable because guard at bar.go:9 returns early").

    **UNDETERMINED** — cannot confirm or deny without more context.
      Include: exactly what context is missing and what you would need to
      decide. Do not use UNDETERMINED as a soft REFUTED — only when you
      genuinely cannot reach evidence either way.

    ## Format

    Verdict: <CONFIRMED | REFUTED | UNDETERMINED>
    Evidence: <code excerpt + trace, or reasoning with file:line refs>
    Impact: <if CONFIRMED: what goes wrong. Otherwise: n/a>
```

## Notes for the controller (REVIEW mode)

- Dispatch **one verifier per issue**. Issues are independent — batch multiple
  `Agent` calls in a single message so they run concurrently. This is the one
  place parallel subagents are safe in REVIEW mode: each is read-only and they
  don't share working-tree state.
- Use `subagent_type: "general-purpose"` — not `Explore`. Verification needs to
  read whole files and trace call chains thoroughly; Explore reads excerpts and
  is explicitly unsuited for "code review, cross-file consistency checks, or
  open-ended analysis." The verifier's prompt enforces read-only discipline by
  instruction (it must not edit/write), which is the same belt-and-suspenders
  approach the other read-only modes use.
- The verifier must NOT see the full triage list — paste only its one issue.
  Seeing other issues biases the verdict.
- Trust but verify the verifier: if a CONFIRMED verdict reads as plausible but
  thin, re-read the cited code yourself before promoting it to the final report.
  If a REFUTED verdict surprises you, spot-check its reasoning. The final
  report's credibility rests on your aggregation, not on any single subagent's
  word.
- If many issues cluster in one file or call path, you may also read that code
  yourself once and cross-check several verifiers against your own reading —
  cheaper than re-dispatching.
