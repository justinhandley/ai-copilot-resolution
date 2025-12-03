#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

function setupSlashCommands() {
    console.log('🚀 Setting up GitHub Copilot Review slash command for Claude Code...\n');

    // Determine Claude config directory
    const homeDir = os.homedir();
    const claudeConfigDir = path.join(homeDir, '.claude', 'commands');

    // Check if Claude config directory exists
    if (!fs.existsSync(claudeConfigDir)) {
        console.log(`📁 Creating Claude config directory: ${claudeConfigDir}`);
        try {
            fs.mkdirSync(claudeConfigDir, { recursive: true });
        } catch (error) {
            console.error(`❌ Error creating directory: ${error.message}`);
            process.exit(1);
        }
    }

    // Get the package directory (where docs/ is located)
    const packageDir = path.dirname(__dirname); // Go up from bin/ to package root
    const docsDir = path.join(packageDir, 'docs');

    if (!fs.existsSync(docsDir)) {
        console.error(`❌ Docs directory not found at: ${docsDir}`);
        process.exit(1);
    }

    // Copy slash command file
    const slashCommandFiles = ['copilot-review.md'];
    let copiedCount = 0;

    for (const file of slashCommandFiles) {
        const sourcePath = path.join(docsDir, file);
        const destPath = path.join(claudeConfigDir, file);

        if (!fs.existsSync(sourcePath)) {
            console.log(`⚠️  Warning: ${file} not found, skipping`);
            continue;
        }

        try {
            const isUpdate = fs.existsSync(destPath);
            fs.copyFileSync(sourcePath, destPath);
            console.log(`✅ ${isUpdate ? 'Updated' : 'Copied'}: ${file}`);
            copiedCount++;
        } catch (error) {
            console.error(`❌ Error copying ${file}: ${error.message}`);
        }
    }

    if (copiedCount === 0) {
        console.log('\n❌ No slash commands were installed');
        process.exit(1);
    }

    console.log(`\n🎉 Successfully installed ${copiedCount} slash command${copiedCount === 1 ? '' : 's'}!`);
    console.log(`   Location: ${claudeConfigDir}`);
    console.log('\n📋 Available command in Claude Code:');
    console.log('   /copilot-review [PR#]  - Review and resolve GitHub Copilot comments');

    console.log('\n💡 Note: Running copilot-setup again will overwrite this file with the latest version.');
    console.log('\n🔧 Next steps:');
    console.log('   1. Ensure GitHub CLI (gh) is installed and authenticated');
    console.log('   2. Use the slash command in Claude Code!');
    console.log('   3. Example: /copilot-review 172');
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
GitHub Copilot Review Setup

USAGE:
    copilot-setup

DESCRIPTION:
    Installs GitHub Copilot Review slash command for Claude Code by copying it to:
    ~/.claude/commands/

OPTIONS:
    -h, --help    Show this help message

EXAMPLES:
    copilot-setup   # Install slash command
`);
    process.exit(0);
}

setupSlashCommands();
