# Architecture

## Overview

The AI Copilot Resolution tool is designed with a modular architecture that separates concerns and allows for easy extension.

## Components

### 1. CopilotReviewCommand Class

The main orchestrator that handles:
- Prerequisites checking
- Comment fetching
- Review prompt generation
- Status tracking
- Logging

### 2. GitHub API Integration

Uses GitHub CLI (`gh`) for:
- Fetching PR data
- Retrieving comments and reviews
- Posting replies
- Resolving comments (planned)

### 3. File System Integration

Reads local repository files to:
- Get code context around comments
- Provide full file content when needed
- Support Claude's analysis

### 4. Claude Integration

Generates structured prompts for Claude Code to:
- Analyze comment validity
- Determine appropriate actions
- Make code changes
- Provide reasoning

## Data Flow

```
1. User runs copilot-review <pr-number>
   ↓
2. Check prerequisites (git, gh CLI, PR exists)
   ↓
3. Fetch PR comments via gh CLI
   ↓
4. Filter for Copilot comments
   ↓
5. For each comment:
   - Get file path and line number
   - Extract code context (±10 lines)
   - Build review prompt
   ↓
6. Write review prompt to .md file
   ↓
7. User/Claude reviews and addresses comments
   ↓
8. (Future) Post replies and resolve comments
```

## File Structure

```
ai-copilot-resolution/
├── bin/
│   └── copilot-review.js      # Main executable
├── docs/
│   ├── architecture.md         # This file
│   └── api.md                  # API documentation (planned)
├── package.json
├── README.md
└── LICENSE
```

## Future Enhancements

### Comment Resolution API

Currently, the tool generates review prompts but doesn't automatically resolve comments. Future versions will:
- Implement direct comment resolution via GitHub API
- Support threaded replies
- Handle comment state transitions

### Batch Processing

Instead of generating one large prompt, future versions could:
- Process comments in batches
- Allow partial progress tracking
- Resume from previous sessions

### Smart Categorization

Future versions could categorize comments by:
- Type (security, performance, style, etc.)
- Priority (critical, high, medium, low)
- File/module affected
- Estimated effort

### Integration with CI/CD

The tool could be integrated into CI/CD pipelines to:
- Run automatically on PR creation/update
- Block merges if unresolved critical comments exist
- Generate reports of comment resolution rates

## Design Decisions

### Why GitHub CLI?

Using `gh` CLI instead of direct API calls:
- ✅ Handles authentication automatically
- ✅ Simpler JSON parsing with `--json` flag
- ✅ Consistent with other GitHub workflows
- ✅ No need for separate token management

### Why Separate Files?

Generating `.md` files for review:
- ✅ Claude Code can easily read and process
- ✅ User can review the prompt before Claude processes it
- ✅ Provides audit trail of what was reviewed
- ✅ Can be versioned if needed

### Why Not Auto-Fix Everything?

The tool asks for human/Claude review before acting:
- ✅ Copilot comments may not always be correct
- ✅ Context matters - some suggestions don't fit the architecture
- ✅ Allows for reasoned disagreement with comments
- ✅ Maintains code quality by avoiding blind automation
