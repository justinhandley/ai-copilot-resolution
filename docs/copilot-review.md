Run the copilot-review command to automatically review and resolve GitHub Copilot comments on a pull request.

Usage: /copilot-review [PR_NUMBER] [OPTIONS]

This command runs `npx -p ai-copilot-resolution copilot-review [PR_NUMBER] [OPTIONS]` which:
- Fetches all GitHub Copilot comments from the specified PR
- Presents each comment with code context for Claude to review
- Waits for Claude to fix issues, disagree, or explain why no change is needed
- Automatically replies to each comment with actions taken
- Marks comments as resolved when appropriate
- Commits and pushes changes after each fix

Examples:
- /copilot-review 172 - Review all Copilot comments for PR #172
- /copilot-review 172 --verbose - Show detailed logging
- /copilot-review 172 --skip-resolve - Don't auto-resolve comments

Prerequisites:
- GitHub CLI (gh) must be installed and authenticated
- Must be run from within the git repository
