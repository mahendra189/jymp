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

// Display Banner
console.clear();
console.log(
  chalk.cyan(figlet.textSync("Jymp", { horizontalLayout: "default" }))
);

// Utility to read .jympignore
const loadIgnoreList = () => {
  try {
    const content = fs.readFileSync('.jympignore', 'utf-8');
    return content.split('\n').filter(Boolean);
  } catch {
    return [];
  }
};

// Get all files (excluding ignored ones)
const getAllFiles = async () => {
  const ignoreList = loadIgnoreList();
  const files = await globby(["**/*.*", "!node_modules", ...ignoreList.map(i => `!${i}`)]);
  return files.filter(f => fs.statSync(f).isFile());
};

// Prompt user to pick files manually
const manualFilePicker = async () => {
  const files = await getAllFiles();
  const { selected } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selected',
      message: 'Select files to include:',
      choices: files,
      pageSize: 30 // Show more file rows
    }
  ]);
  return selected;
};

// Prompt user for AI selection prompt
const aiBasedSelector = async () => {
  const files = await getAllFiles();
  const { userPrompt } = await inquirer.prompt([
    {
      type: 'input',
      name: 'userPrompt',
      message: 'Enter your goal (e.g., I want to debug an auth issue):'
    }
  ]);

  // Simulate selection (replace with actual LLM API later)
  const matched = files.filter(f => userPrompt.toLowerCase().split(' ').some(word => f.toLowerCase().includes(word)));
  return matched.length ? matched : files.slice(0, 5); // fallback if no match
};

// Read and format selected files
const combineFiles = async (files) => {
  let result = '';
  // List of image file extensions
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.tiff', '.ico'];
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    result += `\n// -------- ${file} --------\n`;
    if (imageExtensions.includes(ext)) {
      result += `[Image file: ${path.basename(file)}]\n`;
    } else {
      const content = await fs.readFile(file, 'utf-8');
      result += content + '\n';
    }
  }
  return result;
};

// Main flow
const main = async () => {
  const { mode } = await inquirer.prompt([
    {
      type: 'list',
      name: 'mode',
      message: 'Choose selection mode:',
      choices: [
        { name: 'Full Codebase', value: 'full' },
        { name: 'Prompt-Based (AI-assisted)', value: 'ai' },
        { name: 'Manual File Selection', value: 'manual' },
        { name: 'Exit', value: 'exit' }
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

  const combined = await combineFiles(selectedFiles);
  clipboardy.writeSync(combined);

  console.log(chalk.green(`\n✅ Combined ${selectedFiles.length} files. Prompt copied to clipboard!`));
};

main();