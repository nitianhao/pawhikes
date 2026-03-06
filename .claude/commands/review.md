---
allowed-tools: Read, Bash(git diff:*), Bash(git log:*)
description: Review code changes for bugs, security issues, and quality
---
Review the current uncommitted changes in this project.
## Context
- Current diff: !`git diff`
- Staged diff: !`git diff --cached`
## Review Checklist
For each changed file, evaluate:
1. **Bugs** — Logic errors, off-by-one, null/undefined risks, race conditions
2. **Security** — Injection risks, exposed secrets, auth gaps, unsafe inputs
3. **Performance** — Unnecessary loops, missing indexes, memory leaks, N+1 queries
4. **Tests** — Are new code paths covered? Are edge cases tested?
5. **Readability** — Naming clarity, function length, comments where needed
## Output Format
For each issue found, show:
- File and line number
- Severity (CRITICAL / WARNING / SUGGESTION)
- What the problem is
- How to fix it
If everything looks good, say so. Don't invent issues that aren't there.
