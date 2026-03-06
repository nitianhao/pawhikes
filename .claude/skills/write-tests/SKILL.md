---
name: write-tests
description: Use this skill whenever writing new code, modifying existing code, or when the user asks for tests. Ensures all code changes have proper test coverage.
---
# Test Writing Skill
When writing or modifying code, always consider test coverage.
## When to Use This Skill
- After writing or modifying any function or component
- When the user asks for tests
- When reviewing code that lacks test coverage
## Test Writing Rules
1. Place test files alongside source files using the project's existing test naming convention
2. Cover the happy path first, then edge cases
3. Test error handling and boundary conditions
4. Use descriptive test names that explain the expected behavior
5. Keep tests independent — no test should depend on another
6. Mock external dependencies (APIs, databases, file system)
7. Aim for meaningful coverage, not 100% — test behavior, not implementation details
## Test Structure
Each test should follow:
- **Arrange** — Set up the test data and conditions
- **Act** — Execute the function or action being tested
- **Assert** — Verify the expected outcome
## What NOT to Do
- Don't test private implementation details
- Don't write tests that just mirror the code
- Don't leave hardcoded values without explanation
- Don't skip error case testing
