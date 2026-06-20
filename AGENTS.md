# Global Agent Instructions

## Code comments

Write very minimal code comments, or none at all.

- Prefer self-documenting code: clear names, small functions, obvious structure.
- Only add a comment when something is genuinely non-obvious and cannot be made clear by renaming or restructuring.
- Never write comments that restate what the code already says.
- Do not leave commented-out code behind.

## Functions

Each function should do exactly one thing.

- If a function's body contains more than one distinct responsibility, break it into multiple functions.
- If you find yourself writing a function that does X and Y, split it into `doX` and `doY` and have a small orchestrator call both.
- One function = one purpose. Compose with calls, not with stacked logic.
