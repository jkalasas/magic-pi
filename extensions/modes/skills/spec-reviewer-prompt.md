---
name: spec-reviewer-prompt
description: Prompt template for dispatching a spec compliance reviewer subagent. Used by ORCHESTRATOR mode after an implementer reports DONE.
---

# Spec Compliance Reviewer Prompt Template

Use this template when ORCHESTRATOR mode dispatches a spec compliance reviewer
subagent after an implementer reports DONE (or DONE_WITH_CONCERNS that were
addressed).

**Purpose:** Verify the implementer built what was requested — nothing more,
nothing less. This runs **before** the code quality review.

The controller pastes the full task text into the prompt — the reviewer does
not read the plan file.

```
Task tool (general-purpose):
  description: "Review spec compliance for Task N"
  prompt: |
    You are reviewing whether an implementation matches its specification.

    ## What Was Requested

    [FULL TEXT of the task requirements, pasted from the plan]

    ## What the Implementer Claims They Built

    [From the implementer's report: what they say they implemented, files
    changed, tests run and results, commit SHAs]

    ## CRITICAL: Do Not Trust the Report

    The implementer finished suspiciously quickly. Their report may be
    incomplete, inaccurate, or optimistic. You MUST verify everything
    independently.

    **DO NOT:**
    - Take their word for what they implemented
    - Trust their claims about completeness
    - Accept their interpretation of requirements

    **DO:**
    - Read the actual code they wrote (use `git diff <base>..<head>` and read
      the files)
    - Compare the actual implementation to the requirements line by line
    - Check for missing pieces they claimed to implement
    - Look for extra features they didn't mention

    ## Your Job

    Read the implementation code and verify:

    **Missing requirements:**
    - Did they implement everything that was requested?
    - Are there requirements they skipped or missed?
    - Did they claim something works but didn't actually implement it?

    **Extra / unneeded work:**
    - Did they build things that weren't requested?
    - Did they over-engineer or add unnecessary features?
    - Did they add "nice to haves" that weren't in the spec?

    **Misunderstandings:**
    - Did they interpret requirements differently than intended?
    - Did they solve the wrong problem?
    - Did they implement the right feature the wrong way?

    **Verify by reading code, not by trusting the report.**

    Report:
    - ✅ Spec compliant (if everything matches after code inspection), or
    - ❌ Issues found: list specifically what's missing or extra, with
      file:line references, and say which requirement each issue maps to.
```

## Notes for the controller

- This review is about **spec compliance**, not code quality. Do not let the
  reviewer wander into naming/style territory — that is the next stage.
- If the reviewer finds issues, dispatch the **same implementer subagent**
  (resume it, or re-dispatch with the fix instructions) to address them, then
  re-run this review. Loop until ✅.
- Only proceed to the code quality reviewer once spec compliance is ✅.
