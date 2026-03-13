#!/usr/bin/env node
/**
 * CLI script to test generateViteOnline — online/remote asset mode.
 *
 * Reads a Figma JSON mock, builds a fake uploadedAssets mapping
 * (image/SVG IDs → OSS-style URLs), and outputs component source
 * code strings to stdout.
 *
 * Usage: npx ts-node src/cli/generate-online.ts [path-to-json]
 */

import path from 'path';
import fs from 'fs';
import { generateViteOnline } from '../generate/vite';
import type { UploadedAssets } from '../generate/vite/types';

// Default mock file
const inputArg = process.argv[2];
const MOCK_FILE = inputArg
  ? path.resolve(inputArg)
  : path.join(process.cwd(), 'examples/mock/component_image_composition.json');

const TEMP_IMAGES_DIR = path.join(process.cwd(), 'temp', 'images');
const TEMP_SVGS_DIR = path.join(process.cwd(), 'temp', 'svgs');

// Fake OSS base URL
const OSS_BASE = 'https://cdn.example.com/figma-assets';

/**
 * Scan temp directories to build a fake uploadedAssets mapping,
 * simulating assets already uploaded to OSS.
 */
function buildUploadedAssets(): UploadedAssets {
  const images: Record<string, string> = {};
  const svgs: Record<string, string> = {};

  if (fs.existsSync(TEMP_IMAGES_DIR)) {
    for (const file of fs.readdirSync(TEMP_IMAGES_DIR)) {
      if (!file.endsWith('.png')) continue;
      const id = file.replace(/\.png$/, '');
      images[id] = `${OSS_BASE}/images/${file}`;
    }
  }

  if (fs.existsSync(TEMP_SVGS_DIR)) {
    for (const file of fs.readdirSync(TEMP_SVGS_DIR)) {
      if (!file.endsWith('.svg')) continue;
      const id = file.replace(/\.svg$/, '');
      svgs[id] = `${OSS_BASE}/svgs/${file}`;
    }
  }

  return { images, svgs };
}

async function main() {
  console.log('[generate-online] Starting...');
  console.log(`[generate-online] Input: ${MOCK_FILE}`);

  if (!fs.existsSync(MOCK_FILE)) {
    console.error(`[generate-online] File not found: ${MOCK_FILE}`);
    process.exit(1);
  }

  const uploadedAssets = buildUploadedAssets();
  console.log(`[generate-online] Uploaded assets: ${Object.keys(uploadedAssets.images).length} images, ${Object.keys(uploadedAssets.svgs).length} svgs`);

  try {
    const result = await generateViteOnline({
      input: MOCK_FILE,
      uploadedAssets,
      debug: false,
      formatOutput: true,
      optimizeOutput: true,
      optimizeOptions: {
        convertToTailwind: false,
      },
      logger: {
        info: (msg) => console.log(`[generate-online] ${msg}`),
        warn: (msg) => console.warn(`[generate-online] ${msg}`),
        error: (msg) => console.error(`[generate-online] ${msg}`),
      },
    });

    // Print layout component
    console.log('\n' + '='.repeat(60));
    console.log('LAYOUT COMPONENT');
    console.log('='.repeat(60));
    console.log(result.layout.code);
    console.log(`  uiImg: ${result.layout.uiImg ? result.layout.uiImg.substring(0, 50) + '...' : '(empty)'}`);

    // Print slice components
    result.slices.forEach((slice, i) => {
      console.log('\n' + '='.repeat(60));
      console.log(`SLICE ${i + 1}`);
      console.log('='.repeat(60));
      console.log(slice.code);
      console.log(`  uiImg: ${slice.uiImg ? slice.uiImg.substring(0, 50) + '...' : '(empty)'}`);
    });

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('[generate-online] Done!');
    console.log(`  Layout: ${result.layout.code.length} chars, uiImg: ${result.layout.uiImg.length} chars`);
    console.log(`  Slices: ${result.slices.length}`);
    result.slices.forEach((slice, i) => {
      console.log(`    Slice ${i + 1}: ${slice.code.length} chars, uiImg: ${slice.uiImg.length} chars`);
    });

    // Verify no local import/require of assets
    const allCode = [result.layout.code, ...result.slices.map(s => s.code)].join('\n');
    const hasAssetImport = /from\s+['"]\.\.\/assets/.test(allCode);
    const hasOssUrl = allCode.includes(OSS_BASE);
    console.log(`\n  Asset imports (should be false): ${hasAssetImport}`);
    console.log(`  Contains OSS URLs (should be true): ${hasOssUrl}`);
  } catch (err) {
    console.error('[generate-online] Error:', err);
    process.exit(1);
  }
}

main();
