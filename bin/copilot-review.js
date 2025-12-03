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
 * 2. For each comment:
 *    - Presents the comment and code context to Claude
 *    - Waits for Claude to fix, disagree, or explain
 *    - Replies to the comment with reasoning
 *    - Resolves the comment
 *    - Commits changes if fixes were made
 * 3. Repeats until all comments are processed
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
    this.currentCommentIndex = 0
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
      currentCommentIndex: this.currentCommentIndex,
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
    ].forEach(file => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file)
      }
    })
  }

  async getRepoInfo() {
    try {
      // Get repository info from gh CLI
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

    // Check if we're in a git repository
    try {
      await execPromise('git rev-parse --git-dir')
    } catch {
      throw new Error('Not in a git repository')
    }

    // Check if gh CLI is installed
    try {
      await execPromise('gh --version')
    } catch {
      throw new Error('GitHub CLI (gh) is not installed. Install it from https://cli.github.com/')
    }

    // Get repo info
    await this.getRepoInfo()

    // Check if PR exists
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
      // Fetch PR review comments (inline comments on code)
      const { stdout } = await execPromise(
        `gh api repos/${this.repoOwner}/${this.repoName}/pulls/${this.prNumber}/comments`
      )

      const comments = JSON.parse(stdout)

      // Filter for Copilot comments
      // Copilot can appear as: "Copilot", "copilot", "github-actions[bot]", "copilot-pull-request-reviewer[bot]"
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

  async generateCommentPrompt(comment, index, total) {
    this.log(`📝 Generating prompt for comment ${index + 1}/${total}...`)

    let prompt = `# 🤖 GitHub Copilot Comment Review - Comment ${index + 1}/${total}

## PR Information
- **PR Number:** #${this.prNumber}
- **Progress:** ${index + 1} of ${total} comments

## Comment Details
- **Comment ID:** ${comment.id}
- **Author:** ${comment.user?.login || 'Unknown'}
- **File:** ${comment.path || 'N/A'}
- **Line:** ${comment.line || comment.original_line || 'N/A'}
`

    if (comment.path) {
      // Get file context
      const fileContent = await this.getFileContent(comment.path, comment.line || comment.original_line)
      if (fileContent && fileContent.context) {
        prompt += `
**Code Context (lines ${fileContent.lineStart}-${fileContent.lineEnd}):**
\`\`\`
${fileContent.context}
\`\`\`
`
      }
    }

    prompt += `
**Copilot's Comment:**
${comment.body}

---

## Your Task

Please review this comment and decide on one of the following actions:

1. **FIX IT** - If the comment is valid and you should make code changes:
   - Make the necessary code changes to address the comment
   - Respond with: "FIXED: [brief description of what you changed]"

2. **DISAGREE** - If the comment is not valid or applicable:
   - Explain why you disagree with the comment
   - Respond with: "DISAGREE: [your reasoning]"

3. **ALREADY ADDRESSED** - If the issue is already fixed or doesn't apply:
   - Explain why no change is needed
   - Respond with: "ADDRESSED: [your explanation]"

After you've decided and taken any necessary action:

**CRITICAL STEP:** Create a file named \`.copilot-response-${comment.id}.txt\` containing your response in one of these formats:
- FIXED: [brief description of what you changed]
- DISAGREE: [your reasoning for disagreeing]
- ADDRESSED: [explanation of why no change is needed]

Example:
\`\`\`bash
# After making your changes, create the response file:
echo "FIXED: Added email format validation using regex pattern" > .copilot-response-${comment.id}.txt
\`\`\`

I will automatically:
1. Detect your response file
2. Commit any code changes you made
3. Reply to the comment with your response
4. Mark the comment as resolved

**Please proceed with your analysis, make any necessary changes, and create the response file.**
`

    return prompt
  }

  async replyToComment(commentId, reply) {
    this.log(`💬 Replying to comment ${commentId}...`)

    try {
      // CORRECT GitHub API endpoint for replying to review comments:
      // POST /repos/{owner}/{repo}/pulls/{pull_number}/comments/{comment_id}/replies
      const escapedReply = reply.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
      await execPromise(
        `gh api -X POST repos/${this.repoOwner}/${this.repoName}/pulls/${this.prNumber}/comments/${commentId}/replies -f body="${escapedReply}"`
      )

      this.log(`✅ Replied to comment ${commentId}`)
      return true
    } catch (error) {
      this.log(`Error replying to comment ${commentId}: ${error.message}`, 'error')

      // Fallback: add a regular PR comment with a reference
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

  async resolveComment(commentId, comment) {
    if (this.skipResolve) {
      this.log(`⏭️  Skipping resolution of comment ${commentId} (--skip-resolve enabled)`)
      return true
    }

    this.log(`✔️  Resolving comment ${commentId}...`)

    try {
      // Step 1: Get the thread ID for this comment using GraphQL
      // We need the THREAD's node_id, not the comment's node_id
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

      // Find the thread that contains this comment
      const thread = threads.find(t => t.comments?.nodes?.[0]?.databaseId === commentId)

      if (!thread) {
        this.log(`Warning: Could not find thread for comment ${commentId}`, 'warn')
        return false
      }

      const threadId = thread.id
      this.log(`Found thread ID: ${threadId}`)

      // Step 2: Resolve the thread using the correct thread ID
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

      // Fallback: Add a reaction to indicate we've addressed it
      try {
        await execPromise(
          `gh api -X POST repos/${this.repoOwner}/${this.repoName}/pulls/comments/${commentId}/reactions -f content="+1"`
        )
        this.log(`✅ Added reaction to comment ${commentId} (resolution fallback)`)
      } catch (reactionError) {
        this.log(`Warning: Could not add reaction either: ${reactionError.message}`, 'warn')
      }

      return false
    }
  }

  async commitChanges(description) {
    this.log('📦 Checking for changes to commit...')

    try {
      // Check if there are changes to commit
      const { stdout: statusOut } = await execPromise('git status --porcelain')
      if (!statusOut.trim()) {
        this.log('No changes to commit')
        return false
      }

      // Add all changes
      await execPromise('git add -A')

      // Commit with message
      const commitMessage = `fix: ${description}

- Addressed GitHub Copilot comment on PR #${this.prNumber}

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>`

      const escapedMessage = commitMessage.replace(/"/g, '\\"').replace(/\n/g, '\\n')
      await execPromise(`git commit -m "${escapedMessage}"`)

      // Push changes
      await execPromise('git push')

      this.log('✅ Changes committed and pushed')
      return true
    } catch (error) {
      this.log(`Error committing changes: ${error.message}`, 'error')
      return false
    }
  }


  async processComment(comment, index, total) {
    console.log('\n' + '='.repeat(80))
    console.log(`📋 PROCESSING COMMENT ${index + 1}/${total}`)
    console.log('='.repeat(80))

    // Generate and display the prompt
    const prompt = await this.generateCommentPrompt(comment, index, total)
    console.log(prompt)
    console.log('='.repeat(80))
    console.log('⏸️ Please review the comment and take action as described above.')
    console.log('📝 IMPORTANT: After making your changes, create a file named:')
    console.log(`   .copilot-response-${comment.id}.txt`)
    console.log('   containing your response in one of these formats:')
    console.log('   - FIXED: [description]')
    console.log('   - DISAGREE: [reasoning]')
    console.log('   - ADDRESSED: [explanation]')
    console.log('='.repeat(80) + '\n')

    // Wait for the response file to be created
    const responseFile = `.copilot-response-${comment.id}.txt`
    await this.waitForResponseFile(responseFile)

    // Read Claude's response
    const claudeResponse = fs.readFileSync(responseFile, 'utf8').trim()
    fs.unlinkSync(responseFile) // Clean up the response file

    console.log(`\n✅ Received response: ${claudeResponse}\n`)

    // Commit any changes if files were modified
    let changesMade = false
    const { stdout: gitStatus } = await execPromise('git status --porcelain')
    if (gitStatus.trim()) {
      // Extract description from response
      const description = claudeResponse.substring(claudeResponse.indexOf(':') + 1).trim()
      await this.commitChanges(description)
      changesMade = true
    }

    // Reply to the comment with Claude's response
    await this.replyToComment(comment.id, claudeResponse)

    // Resolve the comment
    await this.resolveComment(comment.id, comment)

    return {
      commentId: comment.id,
      comment: comment,
      response: claudeResponse,
      changesMade: changesMade,
      processed: true,
    }
  }

  async waitForResponseFile(responseFile) {
    return new Promise(resolve => {
      this.log(`⏸️ Waiting for response file: ${responseFile}`)

      // Check if file already exists
      if (fs.existsSync(responseFile)) {
        resolve()
        return
      }

      // Watch for file creation
      const watcher = fs.watch(process.cwd(), (eventType, filename) => {
        if (filename === responseFile && fs.existsSync(responseFile)) {
          this.log(`📝 Response file detected: ${responseFile}`)
          clearTimeout(timeout)
          watcher.close()
          resolve()
        }
      })

      // Timeout after 10 minutes
      const timeout = setTimeout(() => {
        this.log('⏱️ Response timeout - no response file created', 'error')
        watcher.close()
        // Create a default response file so we don't hang
        fs.writeFileSync(responseFile, 'ADDRESSED: Timeout - manually review this comment')
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

      // Process each comment one by one
      for (let i = 0; i < comments.length; i++) {
        const comment = comments[i]
        this.currentCommentIndex = i

        const result = await this.processComment(comment, i, comments.length)

        // Log the result
        this.log(`Comment ${comment.id} processed: ${result.response}`, 'success')
        if (result.changesMade) {
          this.log(`Changes committed and pushed for comment ${comment.id}`, 'success')
        }

        // Save progress
        this.processedComments.push({
          id: comment.id,
          response: result.response,
          changesMade: result.changesMade,
        })
        await this.saveStatus()
      }

      // Final summary
      console.log('\n' + '='.repeat(80))
      console.log('🎉 ALL COMMENTS PROCESSED!')
      console.log('='.repeat(80))
      console.log(`   Total Comments: ${comments.length}`)
      console.log(`   Processed: ${this.processedComments.length}`)
      console.log('='.repeat(80) + '\n')

      // Cleanup
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
