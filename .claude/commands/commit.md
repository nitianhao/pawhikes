---
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git commit:*), Bash(git diff:*)
description: Create a smart git commit with context-aware message
---
## Context
- Current status: !`git status`
- Current diff: !`git diff HEAD`
- Current branch: !`git branch --show-current`
Based on the changes above:
1. Identify what was changed and why
2. Write a clear, conventional commit message (type: description format)
3. Stage the relevant files and commit
If the changes span multiple concerns, suggest splitting into multiple commits. Ask me before committing.
