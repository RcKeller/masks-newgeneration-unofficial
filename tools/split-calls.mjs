#!/usr/bin/env node
/**
 * split-calls.mjs
 * Splits a JSON array of Call actor documents into individual files
 * for import into FoundryVTT compendium packs.
 *
 * Usage:
 *   node tools/split-calls.mjs < christmas-calls-raw.json
 *   cat christmas-calls-raw.json | node tools/split-calls.mjs
 *   node tools/split-calls.mjs --input christmas-calls-raw.json
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const outDir = join(projectRoot, 'src', 'packs', 'calls');

/**
 * Generate a 16-character alphanumeric UUID
 */
function generateUUID() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Create a safe filename from a call name
 */
function safeFileName(name) {
  return name
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 30);
}

/**
 * Process and validate a call object
 */
function processCall(call, index) {
  // Ensure required fields
  if (!call.name) {
    call.name = `Call ${index + 1}`;
  }

  // Generate or validate UUID
  if (!call._id || !/^[A-Za-z0-9]{16}$/.test(call._id)) {
    call._id = generateUUID();
  }

  // Ensure _key matches _id
  call._key = `!actors!${call._id}`;

  // Ensure type is "other"
  call.type = 'other';

  // Ensure system.customType is set
  if (!call.system) call.system = {};
  call.system.customType = 'call';

  // Ensure required arrays
  if (!call.items) call.items = [];
  if (!call.effects) call.effects = [];

  // Ensure ownership
  if (!call.ownership) call.ownership = { default: 0 };

  // Ensure flags structure
  if (!call.flags) call.flags = {};
  if (!call.flags['masks-newgeneration-unofficial']) {
    call.flags['masks-newgeneration-unofficial'] = {};
  }

  const flags = call.flags['masks-newgeneration-unofficial'];

  // Ensure dispatch state defaults
  if (!flags.dispatchStatus) flags.dispatchStatus = 'idle';
  if (!flags.assignedActorIds) flags.assignedActorIds = [];
  if (flags.fitResult === undefined) flags.fitResult = null;
  if (flags.snapshotHeroLabels === undefined) flags.snapshotHeroLabels = null;
  if (flags.forwardChange === undefined) flags.forwardChange = null;

  // Ensure _stats
  const now = Date.now();
  if (!call._stats) {
    call._stats = {
      compendiumSource: null,
      duplicateSource: null,
      coreVersion: '13.350',
      systemId: 'pbta',
      systemVersion: '1.1.22',
      createdTime: now,
      modifiedTime: now,
      lastModifiedBy: null,
    };
  }

  // Ensure sort order
  if (!call.sort) call.sort = 100000 + index;

  // Set default image if not provided
  if (!call.img) call.img = 'icons/svg/mystery-man.svg';

  return call;
}

async function main() {
  let inputData;

  // Check for --input flag or stdin
  const args = process.argv.slice(2);
  const inputIndex = args.indexOf('--input');

  if (inputIndex !== -1 && args[inputIndex + 1]) {
    // Read from file
    const inputFile = args[inputIndex + 1];
    if (!existsSync(inputFile)) {
      console.error(`Error: Input file not found: ${inputFile}`);
      process.exit(1);
    }
    inputData = readFileSync(inputFile, 'utf-8');
  } else {
    // Read from stdin
    inputData = '';
    for await (const chunk of process.stdin) {
      inputData += chunk;
    }
  }

  if (!inputData.trim()) {
    console.error('Error: No input data provided.');
    console.error('Usage: node tools/split-calls.mjs < calls.json');
    console.error('   or: node tools/split-calls.mjs --input calls.json');
    process.exit(1);
  }

  let calls;
  try {
    calls = JSON.parse(inputData);
  } catch (e) {
    console.error('Error: Invalid JSON input.');
    console.error(e.message);
    process.exit(1);
  }

  if (!Array.isArray(calls)) {
    console.error('Error: Input must be a JSON array of call objects.');
    process.exit(1);
  }

  console.log(`Processing ${calls.length} calls...`);

  // Create output directory
  mkdirSync(outDir, { recursive: true });

  let created = 0;
  const usedIds = new Set();

  for (let i = 0; i < calls.length; i++) {
    const call = processCall(calls[i], i);

    // Ensure unique ID
    while (usedIds.has(call._id)) {
      call._id = generateUUID();
      call._key = `!actors!${call._id}`;
    }
    usedIds.add(call._id);

    const safeName = safeFileName(call.name);
    const filename = `call_${safeName}_${call._id}.json`;
    const filepath = join(outDir, filename);

    writeFileSync(filepath, JSON.stringify(call, null, 2));
    console.log(`  Created: ${filename}`);
    created++;
  }

  console.log(`\n✅ Created ${created} call files in ${outDir}`);
  console.log('\nNext steps:');
  console.log('  1. Run: npm run uuid src/packs/calls/');
  console.log('  2. Run: npm run pullJSONtoLDB');
  console.log('  3. Run: npm run build');
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
