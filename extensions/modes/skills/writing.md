---
name: writing
description: Write a detailed, bite-sized implementation plan from an approved spec. Used by BRAINSTORM mode after the spec is approved.
---

# Writing Implementation Plans

This is the writing skill bundled with the `modes` extension (`extensions/modes/skills/`).
It is invoked by BRAINSTORM mode after the design spec is approved.

## Overview

Write a comprehensive implementation plan assuming the engineer has zero context
for our codebase and questionable taste. Document everything they need to know:
which files to touch for each task, the code, testing, docs they might need to
check, how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI.
TDD. Frequent commits.

Assume the implementer is a skilled developer who knows almost nothing about our
toolset or problem domain, and doesn't know good test design very well.

**Announce at start:** "I'm using the writing skill to create the implementation plan."

## Inputs

- **Spec:** `{{agent_dir}}/pi-magics/specs/<uuid>.md` (the approved design from
  BRAINSTORM mode's design phase — read it first).
- **Save plan to:** `{{agent_dir}}/pi-magics/plans/<uuid>.md` (same UUID as the
  spec, so spec and plan are linked).

> `{{agent_dir}}` is substituted by the modes extension at injection time. If
> you are reading this file directly (not via the mode), replace it with the
> value of `getAgentDir()` / your `PI_CODING_AGENT_DIR`.

## Scope Check

If the spec covers multiple independent subsystems, it should have been broken
into sub-project specs during brainstorming. If it wasn't, suggest splitting
this into separate plans — one per subsystem. Each plan should produce working,
testable software on its own. Go back to the user before writing a mega-plan.

## File Structure

Before defining tasks, map out which files will be created or modified and what
each one is responsible for. This is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces. Each file
  should have one clear responsibility.
- You reason best about code you can hold in context at once, and your edits are
  more reliable when files are focused. Prefer smaller, focused files over large
  ones that do too much.
- Files that change together should live together. Split by responsibility, not
  by technical layer.
- In existing codebases, follow established patterns. If the codebase uses large
  files, don't unilaterally restructure — but if a file you're modifying has
  grown unwieldy, including a split in the plan is reasonable.

This structure informs the task decomposition. Each task should produce
self-contained changes that make sense independently.

## Bite-Sized Task Granularity

**Each step is one action (2-5 minutes):**

- "Write the failing test" — step
- "Run it to make sure it fails" — step
- "Implement the minimal code to make the test pass" — step
- "Run the tests and make sure they pass" — step
- "Commit" — step

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** Implement this plan task-by-task. Steps use checkbox
> (`- [ ]`) syntax for tracking. In BUILD mode, work through tasks in order. In
> ORCHESTRATOR mode, dispatch a subagent per task and review between tasks.

**Spec:** {{agent_dir}}/pi-magics/specs/<uuid>.md

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

---
```

## Task Structure

````markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

- [ ] **Step 1: Write the failing test**

```python
def test_specific_behavior():
    result = function(input)
    assert result == expected
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL with "function not defined"

- [ ] **Step 3: Write minimal implementation**

```python
def function(input):
    return expected
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add layer clear helper"
```
````

## Commit Hygiene

Commit steps must be meaningful and well-formed:

- **Only commit after a real change.** Never add a commit step unless an earlier
  step in the same task actually edited, created, or deleted files. A task that
  only runs tests, reads files, or verifies output does not get a commit step.
  If the net change is zero, skip the commit.
- **Semantic, one-line commit messages.** Follow Conventional Commits style
  (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `chore:`, `perf:`). The
  message is a single line — no body, no description, no footer.
- **One commit per logical change.** Don't batch unrelated changes into one
  commit, and don't split one logical change across multiple commits.

Good:

```bash
git commit -m "feat: add layer clear helper"
```

Bad (useless commit, nothing was edited this task):

```bash
git commit -m "chore: verify tests pass"
```

Bad (multi-line description):

```bash
git commit -m "feat: add helper

This adds a helper to clear layers because we need it
for the rendering pass."
```

## No Placeholders

Every step must contain the actual content an engineer needs. These are **plan
failures** — never write them:

- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Write tests for the above" (without actual test code)
- "Similar to Task N" (repeat the code — the engineer may read tasks out of order)
- Steps that describe what to do without showing how (code blocks required for
  code steps)
- References to types, functions, or methods not defined in any task

## Remember

- Exact file paths always
- Complete code in every step — if a step changes code, show the code
- Exact commands with expected output
- DRY, YAGNI, TDD, frequent commits
- Commit only after a real change; semantic one-line messages only

## Self-Review

After writing the complete plan, look at it with fresh eyes and check it against
the spec. This is a checklist you run yourself — not a subagent dispatch.

**1. Spec coverage:** Skim each section/requirement in the spec. Can you point
to a task that implements it? List any gaps.

**2. Placeholder scan:** Search your plan for red flags — any of the patterns
from the "No Placeholders" section above. Fix them.

**3. Type consistency:** Do the types, method signatures, and property names you
used in later tasks match what you defined in earlier tasks? A function called
`clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

If you find issues, fix them inline. No need to re-review — just fix and move on.
If you find a spec requirement with no task, add the task.

## Plan Reviewer (optional)

After the self-review, you may dispatch a plan-reviewer subagent for an
independent check. Do this when the plan is large or high-stakes.

**Task tool (general-purpose):**
- description: "Review plan document"
- prompt:

```
You are a plan document reviewer. Verify this plan is complete and ready for
implementation.

Plan to review: {{agent_dir}}/pi-magics/plans/<uuid>.md
Spec for reference: {{agent_dir}}/pi-magics/specs/<uuid>.md

Check: completeness (TODOs, placeholders, missing steps), spec alignment (plan
covers spec requirements, no major scope creep), task decomposition (clear
boundaries, actionable steps), buildability (could an engineer follow this
without getting stuck?).

Only flag issues that would cause real problems during implementation — an
implementer building the wrong thing or getting stuck. Minor wording and
stylistic preferences are not issues. Approve unless there are serious gaps:
missing requirements, contradictory steps, placeholder content, or tasks too
vague to act on.

Output:
## Plan Review
Status: Approved | Issues Found
Issues (if any): [Task X, Step Y]: [issue] - [why it matters]
Recommendations (advisory, do not block): [suggestions]
```

Address any blocking issues inline, then save the final plan.

## Handoff

After the plan is saved and reviewed, return control to BRAINSTORM mode's flow:
the mode will ask the user to review the plan, then tell them to switch to BUILD
mode (press Tab or `/mode build`) or ORCHESTRATOR mode (`/mode orchestrator`)
to implement.
