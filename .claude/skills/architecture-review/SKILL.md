---
name: architecture-review
description: Use this skill when proposing new features, creating new files or modules, refactoring, or when the user asks about architecture decisions. Ensures changes align with the project's existing architecture and patterns.
---
# Architecture Review Skill
Before making structural changes to the project, review them against existing patterns.
## When to Use This Skill
- When creating new files, modules, or directories
- When proposing a new feature implementation
- When refactoring or moving code between files
- When introducing a new dependency or library
- When the user asks "where should this go?" or "how should I structure this?"
## Review Process
1. **Check existing patterns** — How is similar functionality already structured in this project? Follow the same pattern.
2. **Check file placement** — Does the new file go in the right directory based on the project's conventions?
3. **Check naming** — Does the file/function/component name match existing conventions?
4. **Check dependencies** — Does this create circular dependencies? Does it introduce unnecessary coupling?
5. **Check separation of concerns** — Is business logic mixed with UI? Is data access mixed with business logic?
## Rules
- Follow existing patterns unless there's a strong reason not to
- If you think the existing pattern is wrong, flag it but still follow it — suggest improvements separately
- New dependencies need justification: what problem does it solve, is there a lighter alternative, is it maintained?
- Prefer composition over inheritance
- Keep modules focused — if a file does too many things, suggest splitting it
## What to Flag
- Files placed in the wrong directory
- Naming that breaks project conventions
- Circular or unnecessary dependencies
- God objects or god files that do too much
- Tight coupling between unrelated modules
