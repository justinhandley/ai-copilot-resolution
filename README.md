# AI Copilot Resolution

Automated GitHub Copilot comment review and resolution tool powered by Claude Code.

## Overview

This tool helps you efficiently review and resolve GitHub Copilot comments on pull requests by:

1. **Fetching** all GitHub Copilot comments from a PR
2. **Analyzing** each comment to determine if it's valid and actionable
3. **Providing** Claude with context to make informed decisions
4. **Addressing** comments by either fixing code, disagreeing with reasoning, or explaining why no change is needed
5. **Replying** to comments with actions taken or reasoning
6. **Resolving** comments automatically when appropriate

## Prerequisites

- Node.js >= 14.0.0
- [GitHub CLI (gh)](https://cli.github.com/) installed and authenticated
- Git repository with pull requests
- Claude Code (for AI-powered review)

## Installation

```bash
npm install -g ai-copilot-resolution
```

Or install locally in your project:

```bash
npm install --save-dev ai-copilot-resolution
```

## Setup for Claude Code

After installation, run the setup command to install the slash command:

```bash
copilot-setup
```

This automatically copies the slash command file to `~/.claude/commands/` so you can use `/copilot-review` in Claude Code.

## Usage

### As a Claude Code Slash Command (Recommended)

Once setup is complete, use the slash command in Claude Code:

```
/copilot-review 172
```

The tool will:
1. Fetch all GitHub Copilot comments from PR #172
2. Present each comment one-by-one with code context
3. Wait for Claude to analyze and take action
4. Claude creates a response file (e.g., `.copilot-response-123.txt`) with the decision
5. Automatically reply to each comment with Claude's reasoning
6. Mark comments as resolved
7. Commit and push any code changes made

### As a Standalone Command

You can also run it directly from the command line:

```bash
# Review Copilot comments on PR #172
copilot-review 172

# Show detailed logging
copilot-review 172 --verbose

# Skip auto-resolving comments
copilot-review 172 --skip-resolve
```

### Command Options

| Option | Description |
|--------|-------------|
| `<pr-number>` | The pull request number to review (required) |
| `--skip-resolve` | Don't automatically mark comments as resolved |
| `--verbose` | Show detailed logging output |
| `-h, --help` | Show help message |

## How It Works

### 1. Comment Detection

The tool fetches all review comments from the PR and identifies GitHub Copilot comments by looking for:
- Comments from `github-actions[bot]` user
- Comments from `copilot` user
- Comments containing "Copilot" in the body

### 2. Interactive Processing Loop

For each comment, the tool:
- Retrieves the file path and line number
- Extracts code context (±10 lines around the comment)
- Presents a structured prompt to Claude with:
  - Comment details
  - Code context
  - Three action options: Fix, Disagree, or Already Addressed

### 3. Claude Analysis & Action

Claude (you) will:
- Analyze the comment for validity
- Make code changes if the comment is valid
- Provide reasoning for disagreeing if not valid
- Explain why no change is needed if already addressed

### 4. Automated Response & Resolution

After each comment is processed, the tool:
- Replies to the comment thread with your reasoning
- Marks the comment as resolved (adds a 👍 reaction)
- Commits and pushes any code changes made
- Moves to the next comment

### 5. Progress Tracking

The tool:
- Shows progress (e.g., "Comment 3/7")
- Saves status to a JSON file for resumability
- Logs all actions for debugging
- Provides a final summary when complete

## Workflow Integration

This tool is designed to work seamlessly with Claude Code as part of your PR review workflow:

```bash
# 1. Fix SonarQube issues first (if using sonarqube-claude-tools)
/sonar-fix 172

# 2. Address Copilot comments
/copilot-review 172

# 3. Create a PR or push changes
/commit
```

You can also integrate with other tools in sequence:
```bash
# Standalone workflow
sonar-fix 172              # Fix SonarQube issues
copilot-review 172         # Address Copilot comments
# Then manually review and address human comments
```

## Output Files

The tool creates temporary files during execution:

- `.copilot-review-<pr-number>.json` - Status tracking file (for resumability)
- `.copilot-review-<pr-number>.log` - Detailed execution log

These files are cleaned up when the command completes successfully.

## Example Session

Here's what a typical session looks like:

```
🤖 GitHub Copilot Comment Review for PR #172

📊 Found 3 Copilot comments to process

================================================================================
📋 PROCESSING COMMENT 1/3
================================================================================

# 🤖 GitHub Copilot Comment Review - Comment 1/3

## PR Information
- **PR Number:** #172
- **Progress:** 1 of 3 comments

## Comment Details
- **Comment ID:** 987654321
- **Author:** github-actions[bot]
- **File:** src/utils/validator.js
- **Line:** 42

**Code Context (lines 32-52):**
```
function validateUser(user) {
  if (!user.email) {
    return false
  }
  // ... more code
}
```

**Copilot's Comment:**
Consider adding input validation for the email format to prevent invalid emails.

---

## Your Task

Please review this comment and decide on one of the following actions:

1. **FIX IT** - Make code changes and respond with: "FIXED: [description]"
2. **DISAGREE** - Explain why and respond with: "DISAGREE: [reasoning]"
3. **ALREADY ADDRESSED** - Explain why and respond with: "ADDRESSED: [explanation]"

**CRITICAL STEP:** Create a file named `.copilot-response-987654321.txt` containing
your response in one of the formats above.

**Please proceed with your analysis and action.**
================================================================================

[Claude analyzes the comment]
[Makes code changes to validator.js to add email validation]
[Creates response file:]

$ echo "FIXED: Added email format validation using regex pattern" > .copilot-response-987654321.txt

[Tool detects response file]
✅ Received response: FIXED: Added email format validation using regex pattern
📦 Committing and pushing changes...
✅ Changes committed and pushed
💬 Replying to comment 987654321...
✅ Replied to comment 987654321
✔️  Resolving comment 987654321...
✅ Resolved comment thread 987654321

[Moves to next comment...]

================================================================================
🎉 ALL COMMENTS PROCESSED!
================================================================================
   Total Comments: 3
   Processed: 3
================================================================================
```

## Features

- ✅ Interactive one-by-one comment processing
- ✅ Automatic code context extraction (±10 lines)
- ✅ Reply to comment threads via GitHub API
- ✅ Auto-resolve comments with reactions
- ✅ Automatic commit and push after fixes
- ✅ Progress tracking and resumability
- ✅ Claude Code slash command integration
- ✅ Detailed logging for debugging

## Limitations & Future Enhancements

### Current Limitations

- GitHub's review comment resolution is done via UI or reactions (we use reactions)
- The interactive loop detects file changes but relies on Claude Code for response parsing
- Only processes review comments (inline code comments), not general PR comments

### Planned Enhancements

- Enhanced response parsing in Claude Code environment
- Support for batch processing mode
- Smart categorization by comment severity
- Integration with other PR automation tools
- Resume from previous session if interrupted
- Support for filtering comments by file or severity

## Troubleshooting

### "GitHub CLI (gh) is not installed"

Install the GitHub CLI:
```bash
# macOS
brew install gh

# Linux
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update
sudo apt install gh

# Windows
winget install GitHub.cli
```

Then authenticate:
```bash
gh auth login
```

### "Could not access PR"

Make sure you:
1. Are in the correct git repository
2. Have access to the PR
3. Are authenticated with GitHub CLI (`gh auth status`)

### "No Copilot comments found"

This means:
- No comments from GitHub Copilot exist on the PR
- Comments may have already been resolved
- The bot username might be different (check PR comments manually)

## Development

### Local Development

```bash
# Clone the repository
git clone https://github.com/justinhandley/ai-copilot-resolution.git
cd ai-copilot-resolution

# Install dependencies
npm install

# Run locally
node bin/copilot-review.js <pr-number>
```

### Testing

```bash
npm test
```

## Related Tools

- [sonarqube-claude-tools](https://github.com/justinhandley/sonarqube-claude-tools) - Automated SonarQube issue fixing
- More tools coming soon for comprehensive PR automation

## License

MIT License - see LICENSE file for details

## Author

Justin Handley

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
