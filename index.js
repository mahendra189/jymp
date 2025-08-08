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
const border = chalk.gray('='.repeat(60));
const subtitle = chalk.bold.cyanBright('A CLI tool to compile selected files into a single prompt');
const version = chalk.bold(`Version: ${pkg.version}`);
const author = chalk.bold(`Author: ${pkg.author || 'Mahendra'}`);
const now = chalk.gray('Date: ' + new Date().toLocaleString());
console.log(border);
console.log(gradient.pastel.multiline(jympBanner));
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
function flattenTree(node, prefix = '', depth = 0) {
  const choices = [];
  for (const key of Object.keys(node).sort()) {
    const value = node[key];
    const fullPath = prefix ? path.join(prefix, key) : key;
    const indent = '    '.repeat(depth); // 4 spaces per level for more space
    if (value === null) {
      // File
      choices.push({
        name: `${indent}📄 ${key}`,
        value: fullPath,
        short: key,
        type: 'file',
      });
    } else {
      // Folder
      choices.push({
        name: `${indent}📁 ${key}/`,
        value: fullPath + '/',
        short: key + '/',
        type: 'folder',
      });
      choices.push(...flattenTree(value, fullPath, depth + 1));
    }
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
  const choices = flattenTree(tree);
  const { selected } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selected',
      message: 'Select files or folders to include:',
      pageSize: 20,
      choices: choices,
    }
  ]);
  // Expand folders to all files under them
  let finalFiles = new Set();
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
  const binaryExtensions = [
    '.exe', '.dll', '.so', '.bin', '.woff', '.woff2', '.ttf', '.eot', '.otf', '.class', '.jar', '.apk', '.dmg', '.iso', '.7z', '.rar', '.psd', '.ai', '.sketch', '.ico', '.icns'
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

  let i = 0;
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    result += `\n// -------- ${file} --------\n`;
    try {
      const stat = await fs.stat(file);
      if (binaryExtensions.includes(ext)) {
        result += `[Binary file: ${path.basename(file)}]\n`;
        bar.increment();
        continue;
      }
      if (stat.size > MAX_FILE_SIZE) {
        result += `[Skipped: File too large (${(stat.size/1024/1024).toFixed(2)} MB)]\n`;
        bar.increment();
        continue;
      }
      // Try reading as UTF-8, fallback if error
      let content = '';
      try {
        content = await fs.readFile(file, 'utf-8');
      } catch (e) {
        result += `[Error reading file: ${e.message}]\n`;
        bar.increment();
        continue;
      }
      result += content + '\n';
    } catch (e) {
      result += `[Error accessing file: ${e.message}]\n`;
    }
    bar.increment();
  }
  bar.stop();
  return result;
};

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

  // Show the names of files being copied
  console.log(chalk.yellow('\nFiles copied to clipboard:'));
  selectedFiles.forEach(f => console.log(chalk.cyan(' - ' + f)));

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
};

main();