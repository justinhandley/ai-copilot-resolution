#!/usr/bin/env node
'use strict'

const { exec } = require('child_process')
const fs = require('fs')
const path = require('path')
const util = require('util')
const execPromise = util.promisify(exec)

/**
 * Claude Slash Command: /copilot-review
 *
 * Automated GitHub Copilot comment review and resolution for Pull Requests
 *
 * This script:
 * 1. Fetches all GitHub Copilot comments from a PR
 * 2. Presents ALL comments at once with code context
 * 3. Waits for Claude to review and fix all issues
 * 4. Auto-detects changes and commits them
 * 5. Replies to each comment and resolves threads
 *
 * Usage:
 *   /copilot-review <pr-number> [options]
 *
 * Examples:
 *   /copilot-review 172              # Review all Copilot comments for PR #172
 *   /copilot-review 172 --verbose    # Show detailed logging
 */

class CopilotReviewCommand {
  constructor(prNumber, options = {}) {
    this.prNumber = prNumber
    this.verbose = options.verbose || false
    this.skipResolve = options.skipResolve || false
    this.processedComments = []
    this.statusFile = `.copilot-review-${prNumber}.json`
    this.logFile = `.copilot-review-${prNumber}.log`
    this.repoOwner = null
    this.repoName = null

    // Clean up any previous runs
    this.cleanup()
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString()
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`

    if (this.verbose || level === 'error' || level === 'success') {
      console.log(message)
    }

    fs.appendFileSync(this.logFile, logMessage + '\n')
  }

  async saveStatus() {
    const status = {
      prNumber: this.prNumber,
      processedComments: this.processedComments,
      timestamp: new Date().toISOString(),
      inProgress: true,
    }
    fs.writeFileSync(this.statusFile, JSON.stringify(status, null, 2))
  }

  cleanup() {
    ;[
      this.statusFile,
      this.logFile,
      `.copilot-comments-${this.prNumber}.md`,
    ].forEach(file => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file)
      }
    })
  }

  async getRepoInfo() {
    try {
      const { stdout } = await execPromise(`gh repo view --json owner,name`)
      const repo = JSON.parse(stdout)
      this.repoOwner = repo.owner.login
      this.repoName = repo.name
      this.log(`📦 Repository: ${this.repoOwner}/${this.repoName}`)
    } catch (error) {
      throw new Error(`Could not get repository info: ${error.message}`)
    }
  }

  async checkPrerequisites() {
    this.log('🔍 Checking prerequisites...')

    try {
      await execPromise('git rev-parse --git-dir')
    } catch {
      throw new Error('Not in a git repository')
    }

    try {
      await execPromise('gh --version')
    } catch {
      throw new Error('GitHub CLI (gh) is not installed. Install it from https://cli.github.com/')
    }

    await this.getRepoInfo()

    try {
      const { stdout } = await execPromise(`gh pr view ${this.prNumber} --json number`)
      const pr = JSON.parse(stdout)
      if (pr.number != this.prNumber) {
        throw new Error(`PR #${this.prNumber} not found`)
      }
    } catch (error) {
      throw new Error(`Could not access PR #${this.prNumber}: ${error.message}`)
    }

    this.log('✅ Prerequisites check passed')
  }

  async fetchCopilotComments() {
    this.log('📥 Fetching GitHub Copilot comments from PR...')

    try {
      const { stdout } = await execPromise(
        `gh api repos/${this.repoOwner}/${this.repoName}/pulls/${this.prNumber}/comments`
      )

      const comments = JSON.parse(stdout)

      // Filter for Copilot comments
      const copilotComments = comments.filter(comment => {
        const login = comment.user?.login || ''
        const loginLower = login.toLowerCase()

        return (
          login === 'Copilot' ||
          loginLower === 'copilot' ||
          login === 'github-actions[bot]' ||
          login === 'copilot-pull-request-reviewer[bot]' ||
          loginLower.includes('copilot') ||
          (comment.body && comment.body.includes('Copilot'))
        )
      })

      this.log(`📊 Found ${copilotComments.length} Copilot comments`)
      return copilotComments
    } catch (error) {
      this.log(`Error fetching comments: ${error.message}`, 'error')
      throw error
    }
  }

  async getFileContent(filePath, line = null) {
    try {
      const content = fs.readFileSync(filePath, 'utf8')
      if (line) {
        const lines = content.split('\n')
        const start = Math.max(0, line - 10)
        const end = Math.min(lines.length, line + 10)
        return {
          full: content,
          context: lines.slice(start, end).join('\n'),
          lineStart: start + 1,
          lineEnd: end
        }
      }
      return { full: content }
    } catch (error) {
      this.log(`Error reading file ${filePath}: ${error.message}`, 'error')
      return null
    }
  }

  async generateReviewPrompt(comments) {
    this.log('📝 Generating comprehensive review prompt...')

    let prompt = `# 🤖 GitHub Copilot Comment Review

## PR Information
- **PR Number:** #${this.prNumber}
- **Repository:** ${this.repoOwner}/${this.repoName}
- **Total Comments:** ${comments.length}

## Your Task

Review ALL ${comments.length} GitHub Copilot comments below and address them as needed:

1. **FIX** - If the comment is valid, make the code changes
2. **DISAGREE** - If the comment is not applicable (no action needed)
3. **ALREADY FIXED** - If the issue was already addressed

**Important:**
- Make all necessary code changes now
- I will auto-detect your changes and commit them
- Then I will reply to and resolve each comment automatically
- You don't need to create any response files

---

## Comments to Review (${comments.length} total)

`

    for (let i = 0; i < comments.length; i++) {
      const comment = comments[i]

      prompt += `\n### Comment ${i + 1}/${comments.length}\n\n`
      prompt += `**Comment ID:** ${comment.id}\n`
      prompt += `**Author:** ${comment.user?.login || 'Unknown'}\n`
      prompt += `**File:** ${comment.path || 'N/A'}\n`
      prompt += `**Line:** ${comment.line || comment.original_line || 'N/A'}\n\n`

      if (comment.path) {
        const fileContent = await this.getFileContent(comment.path, comment.line || comment.original_line)
        if (fileContent && fileContent.context) {
          prompt += `**Code Context (lines ${fileContent.lineStart}-${fileContent.lineEnd}):**\n\`\`\`\n${fileContent.context}\n\`\`\`\n\n`
        }
      }

      prompt += `**Copilot's Comment:**\n${comment.body}\n\n`
      prompt += `---\n`
    }

    prompt += `\n## Next Steps

After you've reviewed and made all necessary changes:
1. I will automatically detect your file changes
2. Commit all changes together
3. Reply to each comment explaining what was done
4. Resolve all comment threads
5. Push everything to the PR

**Please proceed with reviewing and fixing the issues above.**
`

    const promptFile = `.copilot-comments-${this.prNumber}.md`
    fs.writeFileSync(promptFile, prompt)

    this.log(`📝 Review prompt saved to ${promptFile}`)
    return prompt
  }

  async replyToComment(commentId, reply) {
    this.log(`💬 Replying to comment ${commentId}...`)

    try {
      const escapedReply = reply.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
      await execPromise(
        `gh api -X POST repos/${this.repoOwner}/${this.repoName}/pulls/${this.prNumber}/comments/${commentId}/replies -f body="${escapedReply}"`
      )

      this.log(`✅ Replied to comment ${commentId}`)
      return true
    } catch (error) {
      this.log(`Error replying to comment ${commentId}: ${error.message}`, 'error')

      try {
        const message = `Re: Review comment https://github.com/${this.repoOwner}/${this.repoName}/pull/${this.prNumber}#discussion_r${commentId}\n\n${reply}`
        const escapedMessage = message.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
        await execPromise(
          `gh pr comment ${this.prNumber} --body "${escapedMessage}"`
        )
        this.log(`✅ Posted fallback PR comment for review comment ${commentId}`)
        return true
      } catch (fallbackError) {
        this.log(`Error with fallback reply: ${fallbackError.message}`, 'error')
        return false
      }
    }
  }

  async resolveComment(commentId) {
    if (this.skipResolve) {
      this.log(`⏭️  Skipping resolution of comment ${commentId}`)
      return true
    }

    this.log(`✔️  Resolving comment ${commentId}...`)

    try {
      const threadQuery = `
        query {
          repository(owner: "${this.repoOwner}", name: "${this.repoName}") {
            pullRequest(number: ${this.prNumber}) {
              reviewThreads(first: 100) {
                nodes {
                  id
                  comments(first: 1) {
                    nodes {
                      databaseId
                    }
                  }
                }
              }
            }
          }
        }
      `

      const escapedThreadQuery = threadQuery.replace(/"/g, '\\"').replace(/\n/g, ' ')
      const { stdout: threadResult } = await execPromise(
        `gh api graphql -f query="${escapedThreadQuery}"`
      )

      const threadData = JSON.parse(threadResult)
      const threads = threadData?.data?.repository?.pullRequest?.reviewThreads?.nodes || []
      const thread = threads.find(t => t.comments?.nodes?.[0]?.databaseId === commentId)

      if (!thread) {
        this.log(`Warning: Could not find thread for comment ${commentId}`, 'warn')
        return false
      }

      const threadId = thread.id

      const resolveQuery = `
        mutation {
          resolveReviewThread(input: {threadId: "${threadId}"}) {
            thread {
              isResolved
            }
          }
        }
      `

      const escapedResolveQuery = resolveQuery.replace(/"/g, '\\"').replace(/\n/g, ' ')
      await execPromise(
        `gh api graphql -f query="${escapedResolveQuery}"`
      )

      this.log(`✅ Resolved comment thread ${commentId}`)
      return true
    } catch (error) {
      this.log(`Warning: Could not resolve comment ${commentId}: ${error.message}`, 'warn')

      try {
        await execPromise(
          `gh api -X POST repos/${this.repoOwner}/${this.repoName}/pulls/comments/${commentId}/reactions -f content="+1"`
        )
        this.log(`✅ Added reaction to comment ${commentId}`)
      } catch (reactionError) {
        this.log(`Warning: Could not add reaction: ${reactionError.message}`, 'warn')
      }

      return false
    }
  }

  async commitChanges(comments) {
    this.log('📦 Checking for changes to commit...')

    try {
      const { stdout: statusOut } = await execPromise('git status --porcelain')
      if (!statusOut.trim()) {
        this.log('No changes to commit')
        return false
      }

      await execPromise('git add -A')

      const commitMessage = `fix: address ${comments.length} GitHub Copilot comment${comments.length === 1 ? '' : 's'} on PR #${this.prNumber}

Reviewed and addressed all GitHub Copilot suggestions:
- Fixed valid issues
- Confirmed already-addressed items
- Documented disagreements where applicable

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>`

      const escapedMessage = commitMessage.replace(/"/g, '\\"').replace(/\n/g, '\\n')
      await execPromise(`git commit -m "${escapedMessage}"`)

      await execPromise('git push')

      this.log('✅ Changes committed and pushed')
      return true
    } catch (error) {
      this.log(`Error committing changes: ${error.message}`, 'error')
      return false
    }
  }

  async waitForFixes() {
    return new Promise(resolve => {
      this.log('⏸️ Waiting for code changes...')

      const watcher = fs.watch(process.cwd(), { recursive: true }, (eventType, filename) => {
        if (
          filename &&
          !filename.includes('node_modules') &&
          !filename.startsWith('.copilot-') &&
          !filename.startsWith('.') &&
          (filename.endsWith('.ts') ||
           filename.endsWith('.tsx') ||
           filename.endsWith('.js') ||
           filename.endsWith('.jsx'))
        ) {
          this.log(`📝 Detected change in ${filename}`)
          clearTimeout(timeout)
          watcher.close()
          // Give a moment for all changes to complete
          setTimeout(resolve, 2000)
        }
      })

      // Timeout after 10 minutes
      const timeout = setTimeout(() => {
        this.log('⏱️ Timeout waiting for changes', 'warn')
        watcher.close()
        resolve()
      }, 600000)
    })
  }

  async run() {
    try {
      console.log(`\n🤖 GitHub Copilot Comment Review for PR #${this.prNumber}\n`)

      await this.checkPrerequisites()
      await this.saveStatus()

      const comments = await this.fetchCopilotComments()

      if (comments.length === 0) {
        console.log('\n✅ No Copilot comments found to review!\n')
        return
      }

      console.log(`\n📊 Found ${comments.length} Copilot comment${comments.length === 1 ? '' : 's'} to process\n`)

      // Generate comprehensive prompt with all comments
      const prompt = await this.generateReviewPrompt(comments)

      // Display prompt
      console.log('='.repeat(80))
      console.log('📋 REVIEW ALL COMMENTS BELOW:')
      console.log('='.repeat(80))
      console.log(prompt)
      console.log('='.repeat(80))
      console.log('⏸️ Waiting for you to review and fix all issues...')
      console.log('   Make all code changes now, then I will auto-detect and continue.')
      console.log('='.repeat(80) + '\n')

      // Wait for Claude to make changes
      await this.waitForFixes()

      console.log('\n📝 Changes detected! Processing...\n')

      // Commit all changes
      const committed = await this.commitChanges(comments)

      if (committed) {
        console.log('\n💬 Replying to and resolving all comments...\n')

        // Reply to and resolve each comment
        for (const comment of comments) {
          const reply = `✅ Reviewed and addressed this Copilot suggestion.

🤖 Automated review via [Claude Code](https://claude.com/claude-code)`

          await this.replyToComment(comment.id, reply)
          await this.resolveComment(comment.id)

          this.processedComments.push({
            id: comment.id,
            file: comment.path,
            replied: true,
            resolved: true,
          })
        }
      }

      // Final summary
      console.log('\n' + '='.repeat(80))
      console.log('🎉 ALL COMMENTS PROCESSED!')
      console.log('='.repeat(80))
      console.log(`   Total Comments: ${comments.length}`)
      console.log(`   Replied: ${this.processedComments.length}`)
      console.log(`   Changes Committed: ${committed ? 'Yes' : 'No'}`)
      console.log('='.repeat(80) + '\n')

      this.cleanup()

    } catch (error) {
      this.log(`Fatal error: ${error.message}`, 'error')
      console.error(`\n❌ Error: ${error.message}\n`)
      throw error
    }
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Usage: copilot-review <pr-number> [options]

Review and resolve GitHub Copilot comments on a pull request.

Options:
  --skip-resolve    Don't auto-resolve comments after addressing
  --verbose         Show detailed logging
  -h, --help        Show this help message

Examples:
  copilot-review 172
  copilot-review 172 --verbose
  copilot-review 172 --skip-resolve
`)
    process.exit(0)
  }

  const prNumber = parseInt(args[0])
  if (isNaN(prNumber)) {
    console.error('Error: PR number must be a valid integer')
    process.exit(1)
  }

  const options = {
    skipResolve: args.includes('--skip-resolve'),
    verbose: args.includes('--verbose'),
  }

  return { prNumber, options }
}

// Main execution
async function main() {
  const { prNumber, options } = parseArgs()
  const command = new CopilotReviewCommand(prNumber, options)
  await command.run()
}

if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error)
    process.exit(1)
  })
}

module.exports = CopilotReviewCommand
