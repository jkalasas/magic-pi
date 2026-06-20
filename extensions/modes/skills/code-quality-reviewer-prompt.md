---
name: code-quality-reviewer-prompt
description: Prompt template for dispatching a code quality reviewer subagent. Used by ORCHESTRATOR mode after spec compliance review passes.
---

# Code Quality Reviewer Prompt Template

Use this template when ORCHESTRATOR mode dispatches a code quality reviewer
subagent. **Only dispatch after spec compliance review passes (✅).**

**Purpose:** Verify the implementation is well-built — clean, tested, and
maintainable. This is the second stage of the two-stage review.

The controller passes the commit range so the reviewer sees exactly what this
task changed, not the whole codebase.

```
Task tool (general-purpose):
  description: "Review code quality for Task N"
  prompt: |
    You are reviewing the code quality of a single task's implementation.

    ## Task

    DESCRIPTION: [one-line task summary, from the implementer's report]
    REQUIREMENTS: [full task text from the plan, or "Task N from
      {{agent_dir}}/pi-magics/plans/<uuid>.md" if the reviewer needs to look
      up context — but prefer pasting the task text]
    BASE_SHA: [commit SHA before this task]
    HEAD_SHA: [commit SHA after this task]

    ## What to Review

    Review only the changes in this commit range: `git diff <BASE_SHA>..<HEAD_SHA>`.
    Do not flag pre-existing issues in untouched code. Focus on what this task
    contributed.

    ## Code Quality Checklist

    **Structure & responsibility:**
    - Does each file have one clear responsibility with a well-defined
      interface?
    - Are units decomposed so they can be understood and tested independently?
    - Does the implementation follow the file structure from the plan?
    - Did this change create new files that are already large, or significantly
      grow existing files? (Focus on what this change contributed, not
      pre-existing file sizes.)

    **Correctness & clarity:**
    - Are names clear and accurate — do they describe what things do, not how
      they work?
    - Is the control flow readable? Any cleverness that obscures intent?
    - Are edge cases handled where the spec requires, and not over-handled
      where it doesn't (YAGNI)?

    **Testing:**
    - Do tests verify real behavior, not just mock interactions?
    - Are tests comprehensive for the behavior this task adds?
    - If the task specified TDD, were tests written first?

    **Discipline:**
    - Did the implementer only build what was requested (no scope creep)?
    - Does it follow existing patterns in the codebase?
    - Are commits well-formed (semantic, one-line messages, one logical change
      per commit)?

    ## Report Format

    Return:
    - **Strengths:** what was done well
    - **Issues:** grouped by severity
      - **Critical:** must fix before proceeding (correctness bugs, broken
        tests, security, data loss)
      - **Important:** should fix (maintainability, missing test coverage for
        spec-required behavior, unclear naming)
      - **Minor:** nice to fix (style, minor clarity) — advisory, do not block
    - **Assessment:** Approved | Needs changes

    Only block on Critical and Important issues. Minor issues are advisory.
```

## Notes for the controller

- Pass the **BASE_SHA** you captured before dispatching the implementer and the
  **HEAD_SHA** the implementer reported. If the implementer made multiple
  commits, HEAD_SHA is the last one.
- If the reviewer returns Critical or Important issues, dispatch the **same
  implementer subagent** to fix them, then re-run this review. Loop until
  Approved.
- Do not re-run spec compliance at this stage — it already passed. Only
  re-review code quality after fixes.
- When the reviewer approves, mark the task complete in the todo list and move
  to the next task.
