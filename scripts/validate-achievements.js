#!/usr/bin/env node

/**
 * Achievement Inventory Validator
 *
 * Validates that:
 * 1. Every achievement in code has a matching SVG asset
 * 2. Every SVG asset has a matching code definition
 * 3. No duplicate achievement IDs exist
 * 4. ACHIEVEMENTS.md tier counts are accurate
 *
 * Usage: node scripts/validate-achievements.js
 *        npm run validate:achievements
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const ACHIEVEMENTS_TS = path.join(ROOT_DIR, 'packages/common/src/achievements.ts');
const ASSETS_DIR = path.join(ROOT_DIR, 'assets/achievements/general');
const ACHIEVEMENTS_MD = path.join(ROOT_DIR, 'ACHIEVEMENTS.md');

// ANSI color codes
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

let errors = 0;
let warnings = 0;

function log(color, prefix, message) {
  console.log(`${color}${prefix}${RESET} ${message}`);
}

function error(message) {
  errors++;
  log(RED, '[ERROR]', message);
}

function warn(message) {
  warnings++;
  log(YELLOW, '[WARN]', message);
}

function success(message) {
  log(GREEN, '[OK]', message);
}

function info(message) {
  log(CYAN, '[INFO]', message);
}

/**
 * Extract achievement IDs and tiers from achievements.ts
 */
function extractAchievementsFromCode() {
  const content = fs.readFileSync(ACHIEVEMENTS_TS, 'utf-8');

  // Extract all id fields
  const idMatches = [...content.matchAll(/id:\s*['"]([^'"]+)['"]/g)];
  const ids = idMatches.map(m => m[1]);

  // Extract all tier fields in order
  const tierMatches = [...content.matchAll(/tier:\s*AchievementTier\.(\w+)/g)];

  const tiers = {};
  const tierCounts = {
    bronze: 0,
    silver: 0,
    gold: 0,
    platinum: 0,
    diamond: 0,
  };

  // Match IDs with tiers by position (they appear in same order)
  for (let i = 0; i < ids.length && i < tierMatches.length; i++) {
    const id = ids[i];
    const tier = tierMatches[i][1].toLowerCase();
    tiers[id] = tier;
    if (tierCounts[tier] !== undefined) {
      tierCounts[tier]++;
    }
  }

  return { ids, tiers, tierCounts };
}

/**
 * Get SVG asset filenames from assets directory
 */
function getAssetFiles() {
  if (!fs.existsSync(ASSETS_DIR)) {
    error(`Assets directory not found: ${ASSETS_DIR}`);
    return [];
  }

  const files = fs.readdirSync(ASSETS_DIR);
  return files
    .filter(f => f.endsWith('.svg'))
    .map(f => f.replace('.svg', ''));
}

/**
 * Extract tier counts from ACHIEVEMENTS.md
 */
function extractDocumentedCounts() {
  if (!fs.existsSync(ACHIEVEMENTS_MD)) {
    warn('ACHIEVEMENTS.md not found - skipping documentation validation');
    return null;
  }

  const content = fs.readFileSync(ACHIEVEMENTS_MD, 'utf-8');

  // Look for the Quick Reference table
  const counts = {};
  const countMatches = content.matchAll(/\|\s*(\d+)\s*\|\s*(Bronze|Silver|Gold|Platinum|Diamond)\s*\|/gi);

  for (const match of countMatches) {
    const count = parseInt(match[1], 10);
    const tier = match[2].toLowerCase();
    counts[tier] = count;
  }

  return Object.keys(counts).length > 0 ? counts : null;
}

/**
 * Main validation
 */
function validate() {
  console.log('\n========================================');
  console.log('  Achievement Inventory Validator');
  console.log('========================================\n');

  // Step 1: Extract achievements from code
  info('Reading achievements from code...');
  const { ids: codeIds, tiers, tierCounts } = extractAchievementsFromCode();

  if (codeIds.length === 0) {
    error('No achievements found in code');
    return false;
  }
  success(`Found ${codeIds.length} achievements in code`);

  // Step 2: Get asset files
  info('Reading SVG assets...');
  const assetIds = getAssetFiles();

  if (assetIds.length === 0) {
    error('No SVG assets found');
    return false;
  }
  success(`Found ${assetIds.length} SVG assets`);

  // Step 3: Check for duplicate IDs
  info('Checking for duplicate IDs...');
  const duplicates = codeIds.filter((id, index) => codeIds.indexOf(id) !== index);
  if (duplicates.length > 0) {
    error(`Duplicate achievement IDs found: ${duplicates.join(', ')}`);
  } else {
    success('No duplicate IDs');
  }

  // Step 4: Check code -> assets
  info('Checking code definitions have matching assets...');
  const missingAssets = codeIds.filter(id => !assetIds.includes(id));
  if (missingAssets.length > 0) {
    for (const id of missingAssets) {
      error(`Missing asset for achievement: ${id} (expected: ${id}.svg)`);
    }
  } else {
    success('All code definitions have matching assets');
  }

  // Step 5: Check assets -> code
  info('Checking assets have matching code definitions...');
  const orphanAssets = assetIds.filter(id => !codeIds.includes(id));
  if (orphanAssets.length > 0) {
    for (const id of orphanAssets) {
      warn(`Orphan asset without code definition: ${id}.svg`);
    }
  } else {
    success('All assets have matching code definitions');
  }

  // Step 6: Validate tier counts against documentation
  info('Validating tier counts against documentation...');
  const docCounts = extractDocumentedCounts();

  if (docCounts) {
    let tierMismatch = false;
    for (const tier of Object.keys(tierCounts)) {
      const codeCount = tierCounts[tier];
      const docCount = docCounts[tier];

      if (docCount !== undefined && codeCount !== docCount) {
        error(`Tier count mismatch for ${tier.toUpperCase()}: code has ${codeCount}, doc says ${docCount}`);
        tierMismatch = true;
      }
    }

    if (!tierMismatch) {
      success('Tier counts match documentation');
    }
  }

  // Summary
  console.log('\n========================================');
  console.log('  Summary');
  console.log('========================================');
  console.log(`  Achievements in code: ${codeIds.length}`);
  console.log(`  SVG assets: ${assetIds.length}`);
  console.log('  Tier breakdown:');
  for (const [tier, count] of Object.entries(tierCounts)) {
    console.log(`    ${tier.charAt(0).toUpperCase() + tier.slice(1)}: ${count}`);
  }
  console.log('');

  if (errors > 0) {
    log(RED, `  FAILED:`, `${errors} error(s), ${warnings} warning(s)`);
    return false;
  } else if (warnings > 0) {
    log(YELLOW, `  PASSED WITH WARNINGS:`, `${warnings} warning(s)`);
    return true;
  } else {
    log(GREEN, `  PASSED:`, 'All validations successful');
    return true;
  }
}

// Run validation
const passed = validate();
process.exit(passed ? 0 : 1);
