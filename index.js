#!/usr/bin/env node
// jymp - A CLI tool to compile selected files into a single prompt
// Author: Mahendra
// Tech Stack: Node.js + Inquirer + Chalk + Figlet + Clipboardy

// STEP 0: Dependencies Setup (Run this first)
// npm init -y
// npm install inquirer chalk figlet clipboardy globby fs-extra

// STEP 1: index.js
import inquirer from 'inquirer';
import chalk from 'chalk';
import figlet from 'figlet';
import clipboardy from 'clipboardy';
import {globby} from 'globby';
import fs from 'fs-extra';
import path from 'path';
import ora from 'ora';
import gradient from 'gradient-string';
import cliProgress from 'cli-progress';

// Display Banner with gradient and more info
console.clear();
// Read package.json for version and author
let pkg = { version: 'unknown', author: 'unknown' };
try {
  const pkgRaw = fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8');
  pkg = JSON.parse(pkgRaw);
} catch {}
const jympBanner = figlet.textSync("Jymp", {
  font: "ANSI Shadow",
  horizontalLayout: "default",
  verticalLayout: "default"
});

// Creative horizontal acronym for JYMP
const acronymHorizontal =
  chalk.green('📦 Join') + '   ' +
  chalk.yellow('📂 Your') + '   ' +
  chalk.cyan('📄 Multiple') + '   ' +
  chalk.magenta('🧠 Prompts');

// Border and subtitle
const border = chalk.gray('='.repeat(60));
const subtitle = chalk.bold.cyanBright('A CLI tool to compile selected files into a single prompt');
const version = chalk.bold(`Version: ${pkg.version}`);
const author = chalk.bold(`Author: ${pkg.author || 'Mahendra'}`);
const now = chalk.gray('Date: ' + new Date().toLocaleString());
console.log(border);
console.log(gradient.pastel.multiline(jympBanner));
console.log(acronymHorizontal);
console.log(subtitle);
console.log(version + chalk.gray('   |   ') + author);
console.log(now);
console.log(border + '\n');

// Utility to read .jympignore
const loadIgnoreList = () => {
  try {
    const content = fs.readFileSync('.jympignore', 'utf-8');
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
  } catch {
    return [];
  }
};

// Get all files (excluding ignored ones)
const getAllFiles = async () => {
  const ignoreList = loadIgnoreList();
  // Always ignore node_modules, .git, and hidden files/folders
  const baseIgnores = [
    '!node_modules',
    '!.git',
    '!.DS_Store',
    '!.vscode',
    '!.*', // ignore hidden files/folders
  ];
  const files = await globby([
    '**/*.*',
    ...baseIgnores,
    ...ignoreList.map(i => `!${i}`)
  ]);
  return files.filter(f => {
    try {
      return fs.statSync(f).isFile();
    } catch {
      return false;
    }
  });
};

// Helper to build a tree structure from file paths
function buildFileTree(paths) {
  const sep = path.sep;
  const root = {};
  for (const p of paths) {
    const parts = p.split(sep);
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!node[part]) node[part] = (i === parts.length - 1) ? null : {};
      node = node[part];
    }
  }
  return root;
}

// Helper to flatten tree to choices for inquirer
function flattenTree(node, prefix = '', depth = 0, isTop = true) {
  const choices = [];
  if (isTop) {
    // Add legend and section header
    choices.push(new inquirer.Separator(chalk.bold.cyan('─ File/Folder Selection ─')));
    choices.push(new inquirer.Separator(chalk.gray('Legend: ') + chalk.yellow('📁 Folder') + chalk.gray(' | ') + chalk.green('📄 File')));
    choices.push({
      name: chalk.bgGreen.black.bold('  Select ALL files and folders  '),
      value: '__SELECT_ALL__',
      short: 'ALL',
      type: 'all',
    });
    choices.push(new inquirer.Separator(' '));
  }
  for (const key of Object.keys(node).sort()) {
    const value = node[key];
    const fullPath = prefix ? path.join(prefix, key) : key;
    const indent = '    '.repeat(depth); // 4 spaces per level for more space
    if (value === null) {
      // File
      choices.push({
        name: `${indent}${chalk.green('📄')} ${chalk.whiteBright.bold(key)}`,
        value: fullPath,
        short: key,
        type: 'file',
      });
    } else {
      // Folder
      choices.push({
        name: `${indent}${chalk.yellow('📁')} ${chalk.yellowBright.bold(key + '/')}`,
        value: fullPath + '/',
        short: key + '/',
        type: 'folder',
      });
      choices.push(...flattenTree(value, fullPath, depth + 1, false));
    }
    if (isTop) choices.push(new inquirer.Separator(' ')); // Divider between top-level
  }
  return choices;
}

// Helper to get all files under a folder
function getFilesUnderFolder(folder, allFiles) {
  const prefix = folder.endsWith(path.sep) ? folder : folder + path.sep;
  return allFiles.filter(f => f.startsWith(prefix));
}

// Prompt user to pick files/folders manually (tree view, compatible with inquirer v12+)
const manualFilePicker = async () => {
  const files = await getAllFiles();
  const tree = buildFileTree(files);
  let choices = flattenTree(tree);
  const { selected } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selected',
      message: chalk.bold.cyan('Select files or folders to include (use space to select, arrows to navigate):'),
      pageSize: 20,
      choices: choices,
      loop: false,
      validate: (answer) => {
        if (answer.includes('__SELECT_ALL__')) return true;
        if (answer.length === 0) return chalk.red('Please select at least one file or folder.');
        return true;
      }
    }
  ]);
  // Handle Select All
  let finalFiles = new Set();
  if (selected.includes('__SELECT_ALL__')) {
    files.forEach(f => finalFiles.add(f));
    return Array.from(finalFiles);
  }
  // Expand folders to all files under them
  for (const sel of selected) {
    const isFolder = sel.endsWith('/') || sel.endsWith('\\');
    if (isFolder) {
      getFilesUnderFolder(sel.replace(/[/\\]+$/, ''), files).forEach(f => finalFiles.add(f));
    } else {
      finalFiles.add(sel);
    }
  }
  return Array.from(finalFiles);
};

// Combine selected files into a single string
const combineFiles = async (files) => {
  let result = '';
  // Add all common image extensions to binaryExtensions
  const imageExtensions = [
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.tiff', '.ico'
  ];
  const binaryExtensions = [
    ...imageExtensions,
    '.exe', '.dll', '.so', '.bin', '.woff', '.woff2', '.ttf', '.eot', '.otf', '.class', '.jar', '.apk', '.dmg', '.iso', '.7z', '.rar', '.psd', '.ai', '.sketch', '.icns'
  ];
  const MAX_FILE_SIZE = 1024 * 1024 * 2; // 2MB

  // Progress bar setup
  const bar = new cliProgress.SingleBar({
    format: 'Combining files |' + '{bar}' + '| {percentage}% || {value}/{total} files',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  }, cliProgress.Presets.shades_classic);
  bar.start(files.length, 0);

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    try {
      const stat = await fs.stat(file);
      if (binaryExtensions.includes(ext)) {
        result += `\n// -------- ${file} --------\n[Binary file: ${path.basename(file)}]\n`;
        bar.increment();
        continue;
      }
      if (stat.size > MAX_FILE_SIZE) {
        result += `\n// -------- ${file} --------\n[Skipped: File too large (${(stat.size/1024/1024).toFixed(2)} MB)]\n`;
        bar.increment();
        continue;
      }
      // Try reading as UTF-8, fallback if error
      let content = '';
      try {
        content = await fs.readFile(file, 'utf-8');
      } catch (e) {
        result += `\n// -------- ${file} --------\n[Error reading file: ${e.message}]\n`;
        bar.increment();
        continue;
      }
      const lineCount = content.split(/\r?\n/).length;
      result += `\n// -------- ${file} (${lineCount} lines) --------\n`;
      result += content + '\n';
    } catch (e) {
      result += `\n// -------- ${file} --------\n[Error accessing file: ${e.message}]\n`;
    }
    bar.increment();
  }
  bar.stop();
  return result;
};

// Custom Ctrl+C handler
process.on('SIGINT', () => {
  console.log('\n' + chalk.bgBlue.white.bold('  👋 Exiting Jymp. Have a productive day!  '));
  process.exit(0);
});

// Prompt-based (AI-assisted) file selector using OpenRouter API
const aiBasedSelector = async () => {
  const files = await getAllFiles();
  const { userPrompt } = await inquirer.prompt([
    {
      type: 'input',
      name: 'userPrompt',
      message: chalk.cyan('Enter your goal (e.g., I want to debug an auth issue):'),
    }
  ]);

  // Prepare the prompt for the AI with indices
  const fileList = files.map((f, i) => `${i + 1}. ${f}`).join('\n');
  const systemPrompt = `You are an expert code assistant. Given a user goal and a list of files (with indices), select the most relevant files (max 10) by returning only their indices, one per line.\n\nUser goal: ${userPrompt}\n\nFiles:\n${fileList}\n\nRelevant file indices:`;

  // Show loading spinner while waiting for AI
  const spinner = ora(chalk.cyan('Asking AI to select relevant files...')).start();

  // Call OpenRouter API (OpenAI-compatible)
  const fetch = (await import('node-fetch')).default;
  let aiResponse = '';
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer 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'
      },
      body: JSON.stringify({
        model: 'openai/gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are an expert code assistant.' },
          { role: 'user', content: systemPrompt }
        ],
        max_tokens: 128,
        temperature: 0.2
      })
    });
    const data = await res.json();
    aiResponse = data.choices?.[0]?.message?.content || '';
    spinner.succeed(chalk.green('AI response received.'));
  } catch (e) {
    spinner.fail(chalk.red('AI API error, falling back to manual matching.'));
  }

  // Parse AI response for indices
  let selected = [];
  if (aiResponse) {
    const lines = aiResponse.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const indices = lines
      .map(l => parseInt(l.replace(/[^0-9]/g, ''), 10))
      .filter(n => !isNaN(n) && n >= 1 && n <= files.length);
    selected = indices.map(i => files[i - 1]);
  }
  // Fallback: simple keyword match or first 5 files
  if (!selected.length) {
    selected = files.filter(f => userPrompt.toLowerCase().split(' ').some(word => f.toLowerCase().includes(word)));
    if (!selected.length) selected = files.slice(0, 5);
  }
  return selected;
};

// Add a stub for aiBasedSelector if not present
if (typeof aiBasedSelector !== 'function') {
  globalThis.aiBasedSelector = async () => {
    console.log(chalk.yellow('AI-based selection is not implemented. Returning all files.'));
    return await getAllFiles();
  };
}

// Utility to get line count or binary label for a file
async function getFileLineInfo(file, binaryExtensions) {
  const ext = path.extname(file).toLowerCase();
  try {
    if (binaryExtensions.includes(ext)) return 'binary';
    const stat = await fs.stat(file);
    if (stat.size > 1024 * 1024 * 2) return 'too large';
    const content = await fs.readFile(file, 'utf-8');
    return content.split(/\r?\n/).length + ' lines';
  } catch {
    return 'unreadable';
  }
}

// Main flow
const main = async () => {
  const { mode } = await inquirer.prompt([
    {
      type: 'list',
      name: 'mode',
      message: chalk.bold.cyan('✨ Choose selection mode:'),
      choices: [
        {
          name: `${chalk.green('📦  Full Codebase')}  ${chalk.gray('- Combine all files (except ignored)')}`,
          value: 'full'
        },
        {
          name: `${chalk.blue('🤖  Prompt-Based (AI-assisted)')}  ${chalk.gray('- Let AI suggest files based on your goal')}`,
          value: 'ai'
        },
        {
          name: `${chalk.yellow('📝  Manual File Selection')}  ${chalk.gray('- Pick files yourself')}`,
          value: 'manual'
        },
        {
          name: `${chalk.red('❌  Exit')}`,
          value: 'exit'
        }
      ]
    }
  ]);

  let selectedFiles = [];
  if (mode === 'exit') process.exit();
  else if (mode === 'full') selectedFiles = await getAllFiles();
  else if (mode === 'ai') selectedFiles = await aiBasedSelector();
  else selectedFiles = await manualFilePicker();

  if (!selectedFiles.length) {
    console.log(chalk.redBright('\n⚠️  No files selected. Nothing to copy.'));
    console.log(chalk.gray('Tip: Try again and select at least one file or folder.'));
    process.exit(0);
  }

  // Show the names of files being copied, with line counts
  const imageExtensions = [
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.tiff', '.ico'
  ];
  const binaryExtensions = [
    ...imageExtensions,
    '.exe', '.dll', '.so', '.bin', '.woff', '.woff2', '.ttf', '.eot', '.otf', '.class', '.jar', '.apk', '.dmg', '.iso', '.7z', '.rar', '.psd', '.ai', '.sketch', '.icns'
  ];
  console.log(chalk.yellow('\nFiles copied to clipboard:'));
  const fileInfos = await Promise.all(selectedFiles.map(f => getFileLineInfo(f, binaryExtensions)));
  selectedFiles.forEach((f, i) => {
    const info = fileInfos[i];
    let label = info === 'binary' ? chalk.gray('(binary)') : info === 'too large' ? chalk.gray('(too large)') : info === 'unreadable' ? chalk.red('(unreadable)') : chalk.gray(`(${info})`);
    console.log(chalk.cyan(' - ' + f), label);
  });

  // Progress bar for combining files
  let combined = '';
  try {
    combined = await combineFiles(selectedFiles);
    console.log(chalk.green('Files combined!'));
  } catch (e) {
    console.log(chalk.red('Failed to combine files.'));
    console.error(e);
    process.exit(1);
  }

  // Show context length for LLM
  console.log(chalk.magenta(`\nLLM context length: ${combined.length.toLocaleString()} characters`));

  // Progress spinner for copying to clipboard
  const spinner2 = ora('Copying to clipboard...').start();
  try {
    clipboardy.writeSync(combined);
    spinner2.succeed('Copied to clipboard!');
  } catch (e) {
    spinner2.fail('Failed to copy to clipboard.');
    console.error(e);
    process.exit(1);
  }

  // Small delay for effect
  await new Promise(res => setTimeout(res, 400));

  console.log(chalk.green(`\n✅ Combined ${selectedFiles.length} files. Prompt copied to clipboard!`));
  console.log(chalk.gray('💡 Tip: Paste your prompt directly into your favorite LLM or chat window!'));
};

// Run main with error handling for inquirer ExitPromptError
(async () => {
  try {
    await main();
  } catch (err) {
    if (err && err.name && err.name === 'ExitPromptError') {
      console.log('\n' + chalk.bgBlue.white.bold('  👋 Exiting Jymp. Have a productive day!  '));
      process.exit(0);
    }
    throw err;
  }
})();