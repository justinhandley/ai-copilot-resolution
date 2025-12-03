# Usage Examples

## Basic Workflow

### 1. Review Copilot Comments on a PR

```bash
cd /path/to/your/project
copilot-review 172
```

This will:
- Check prerequisites (git repo, gh CLI, PR exists)
- Fetch all Copilot comments from PR #172
- Generate a review prompt file: `.copilot-review-172.md`
- Wait for you to review and address comments

### 2. Review the Generated Prompt

Open the generated file:

```bash
cat .copilot-review-172.md
```

You'll see something like:

```markdown
# GitHub Copilot Comment Review

You are reviewing GitHub Copilot comments on Pull Request #172.

## Comments to Review (5 total):

---

### Comment 98765
**Author:** github-actions[bot]
**File:** src/api/users.js
**Line:** 45

**Code Context:**
...

**Comment:**
Consider adding error handling for the database query.
```

### 3. Use Claude Code to Address Comments

Within Claude Code, you can systematically review each comment:

```
For Comment 98765:
✅ Action: Add error handling

I'll add try-catch around the database query and proper error logging.
```

Then make the code changes as needed.

### 4. Continue with Next Steps

After addressing comments, you can:
- Commit the changes
- Reply to comments (manually or via future automation)
- Mark comments as resolved

## Advanced Workflows

### Auto-Resolve After Addressing

```bash
copilot-review 172 --auto-resolve
```

This will automatically mark comments as resolved after you address them (future feature).

### Verbose Logging

```bash
copilot-review 172 --verbose
```

Get detailed logs of what the tool is doing:

```
[2024-01-15T10:30:00.000Z] [INFO] 🔍 Checking prerequisites...
[2024-01-15T10:30:01.000Z] [INFO] ✅ Prerequisites check passed
[2024-01-15T10:30:01.500Z] [INFO] 📥 Fetching GitHub Copilot comments from PR...
[2024-01-15T10:30:02.000Z] [INFO] 📊 Found 5 Copilot comments
```

### Sequential Tool Usage

Combine with other tools for comprehensive PR review:

```bash
# 1. Fix SonarQube issues
sonar-fix 172

# 2. Address Copilot comments
copilot-review 172

# 3. Final code review
# (future: pr-review 172)
```

## Example Scenarios

### Scenario 1: Security Comment

**Copilot Comment:**
> This endpoint doesn't validate user permissions. Consider adding authorization checks.

**Claude Review:**
```
✅ Action: Valid security concern

Adding authorization middleware to check user permissions before allowing access to this endpoint.

Changes:
- Added requireAuth middleware
- Added permission check for 'user:read' scope
- Return 403 if unauthorized
```

### Scenario 2: Disagreement

**Copilot Comment:**
> Consider using async/await instead of promises for better readability.

**Claude Review:**
```
❌ Disagree: Already using async/await pattern

The code already uses async/await throughout this module. The .then() call here is intentional for a specific error handling pattern that needs to continue execution even if this particular operation fails.

No changes needed.
```

### Scenario 3: Already Addressed

**Copilot Comment:**
> Add input validation for email format.

**Claude Review:**
```
ℹ️ Already Addressed: Validation exists

Email validation is already implemented via the Joi schema on line 12, which includes format validation, required checks, and max length constraints.

No changes needed.
```

## Tips & Best Practices

### 1. Review in Batches

If you have many comments, review them in logical batches:
- Group by file
- Group by type (security, performance, style)
- Prioritize critical comments first

### 2. Document Your Reasoning

When disagreeing with a comment or marking as already addressed:
- Explain clearly why
- Reference code lines or patterns
- This helps future reviewers understand the decision

### 3. Commit Incrementally

After addressing comments in each file or module:
```bash
git add src/api/users.js
git commit -m "fix: add error handling per Copilot review"
```

### 4. Use with CI/CD

Add to your pre-merge checklist:
```bash
#!/bin/bash
# pre-merge-check.sh

PR_NUMBER=$1

echo "Running pre-merge checks for PR #${PR_NUMBER}"

# Run SonarQube fixes
sonar-fix ${PR_NUMBER}

# Review Copilot comments
copilot-review ${PR_NUMBER}

echo "Pre-merge checks complete"
```

## Troubleshooting Examples

### No Comments Found

```bash
$ copilot-review 172

🤖 Copilot Comment Review for PR #172

🔍 Checking prerequisites...
✅ Prerequisites check passed
📥 Fetching GitHub Copilot comments from PR...
📊 Found 0 Copilot comments

✅ No Copilot comments found to review!
```

**Reason:** Either:
- Copilot hasn't reviewed the PR yet
- All comments are already resolved
- Comments are from a different bot username

### PR Not Found

```bash
$ copilot-review 999

❌ Error: Could not access PR #999: PR not found
```

**Solution:**
- Verify the PR number exists: `gh pr list`
- Check you're in the correct repository

### File Not Found

If a comment references a file that doesn't exist locally:

```
Error reading file src/deleted-file.js: ENOENT: no such file or directory
```

**Reason:** The file was deleted or moved since the comment was made.

**Solution:** The tool will skip file context but still show the comment for review.

## Integration Examples

### GitHub Actions

```yaml
name: Copilot Review
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  copilot-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install -g ai-copilot-resolution
      - run: copilot-review ${{ github.event.pull_request.number }}
```

### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Get current PR number
PR=$(gh pr view --json number -q .number 2>/dev/null)

if [ -n "$PR" ]; then
  echo "Checking Copilot comments for PR #${PR}..."
  copilot-review ${PR}
fi
```

### VS Code Task

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Review Copilot Comments",
      "type": "shell",
      "command": "copilot-review ${input:prNumber}",
      "problemMatcher": []
    }
  ],
  "inputs": [
    {
      "id": "prNumber",
      "type": "promptString",
      "description": "Enter PR number"
    }
  ]
}
```
