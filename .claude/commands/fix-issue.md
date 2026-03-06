---
allowed-tools: Read, Write, Bash(git:*), Bash(gh:*)
description: Fix a GitHub issue by number
---
## Task
Fix GitHub issue #$ARGUMENTS
## Procedure
1. First, fetch the issue details: !`gh issue view $ARGUMENTS`
2. Read the issue title, description, labels, and any comments
3. Analyze the codebase to understand the relevant code
4. Before writing any code, present me with:
   - Your understanding of the problem
   - Your proposed approach
   - Which files you plan to change
5. Wait for my approval before making changes
6. Implement the fix
7. Run any existing tests to make sure nothing is broken
8. Create a concise summary of what you changed and why
Do NOT create a PR or commit automatically — I will use /commit for that.
