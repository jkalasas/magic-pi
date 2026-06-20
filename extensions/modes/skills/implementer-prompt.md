---
name: implementer-prompt
description: Prompt template for dispatching an implementer subagent. Used by ORCHESTRATOR mode to execute a single task from a plan.
---

# Implementer Subagent Prompt Template

Use this template when ORCHESTRATOR mode dispatches an implementer subagent for
one task from a plan at `{{agent_dir}}/pi-magics/plans/<uuid>.md`.

The controller pastes the full task text into the prompt — the subagent never
reads the plan file. This keeps the subagent focused and preserves the
controller's context.

```
Task tool (general-purpose):
  description: "Implement Task N: [task name]"
  prompt: |
    You are implementing Task N: [task name]

    ## Task Description

    [FULL TEXT of task from the plan - paste it here, do not make the subagent
    read the plan file]

    ## Context

    [Scene-setting: where this task fits in the plan, what earlier tasks
    produced that this one depends on, architectural context, and the spec at
    {{agent_dir}}/pi-magics/specs/<uuid>.md if the subagent needs the broader
    design. Provide only what this task needs — do not dump the whole plan.]

    ## Before You Begin

    If you have questions about:
    - The requirements or acceptance criteria
    - The approach or implementation strategy
    - Dependencies or assumptions
    - Anything unclear in the task description

    **Ask them now.** Raise any concerns before starting work.

    ## Your Job

    Once you're clear on requirements:
    1. Implement exactly what the task specifies
    2. Write tests (following TDD if the task says to)
    3. Verify the implementation works
    4. Commit your work
    5. Self-review (see below)
    6. Report back

    Work from: [directory]

    **While you work:** If you encounter something unexpected or unclear, **ask
    questions**. It's always OK to pause and clarify. Don't guess or make
    assumptions.

    ## Code Organization

    You reason best about code you can hold in context at once, and your edits
    are more reliable when files are focused. Keep this in mind:
    - Follow the file structure defined in the plan
    - Each file should have one clear responsibility with a well-defined
      interface
    - If a file you're creating is growing beyond the plan's intent, stop and
      report it as DONE_WITH_CONCERNS — don't split files on your own without
      plan guidance
    - If an existing file you're modifying is already large or tangled, work
      carefully and note it as a concern in your report
    - In existing codebases, follow established patterns. Improve code you're
      touching the way a good developer would, but don't restructure things
      outside your task.

    ## When You're in Over Your Head

    It is always OK to stop and say "this is too hard for me." Bad work is
    worse than no work. You will not be penalized for escalating.

    **STOP and escalate when:**
    - The task requires architectural decisions with multiple valid approaches
    - You need to understand code beyond what was provided and can't find
      clarity
    - You feel uncertain about whether your approach is correct
    - The task involves restructuring existing code in ways the plan didn't
      anticipate
    - You've been reading file after file trying to understand the system
      without progress

    **How to escalate:** Report back with status BLOCKED or NEEDS_CONTEXT.
    Describe specifically what you're stuck on, what you've tried, and what
    kind of help you need. The controller can provide more context, re-dispatch
    with a more capable model, or break the task into smaller pieces.

    ## Before Reporting Back: Self-Review

    Review your work with fresh eyes. Ask yourself:

    **Completeness:**
    - Did I fully implement everything in the spec?
    - Did I miss any requirements?
    - Are there edge cases I didn't handle?

    **Quality:**
    - Is this my best work?
    - Are names clear and accurate (match what things do, not how they work)?
    - Is the code clean and maintainable?

    **Discipline:**
    - Did I avoid overbuilding (YAGNI)?
    - Did I only build what was requested?
    - Did I follow existing patterns in the codebase?

    **Testing:**
    - Do tests actually verify behavior (not just mock behavior)?
    - Did I follow TDD if required?
    - Are tests comprehensive?

    If you find issues during self-review, fix them now before reporting.

    ## Report Format

    When done, report:
    - **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
    - What you implemented (or what you attempted, if blocked)
    - What you tested and the test results
    - Files changed
    - Self-review findings (if any)
    - Any issues or concerns
    - The commit SHA(s) you produced (the controller needs the BASE_SHA before
      your task and HEAD_SHA after, for code quality review)

    Use DONE_WITH_CONCERNS if you completed the work but have doubts about
    correctness. Use BLOCKED if you cannot complete the task. Use NEEDS_CONTEXT
    if you need information that wasn't provided. Never silently produce work
    you're unsure about.
```

## Notes for the controller

- Paste the **full task text**. Do not write "see the plan" or "implement task
  3" — that pushes synthesis onto the subagent.
- Include the **scene-setting context**: what this task depends on, where it
  fits. The subagent has none of your session history.
- Capture the **BASE_SHA** (current `git rev-parse HEAD`) before dispatching so
  you can pass it to the code quality reviewer along with the implementer's
  reported HEAD_SHA.
- Pick the model per the orchestrator's model-selection guidance: cheap for
  mechanical 1-2 file tasks, standard for multi-file integration, most capable
  for design judgment.
