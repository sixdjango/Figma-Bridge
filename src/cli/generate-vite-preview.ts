#!/usr/bin/env node
/**
 * CLI script to generate React components from Figma JSON
 * and output to examples/vite for preview testing.
 *
 * Output structure:
 *   generated/
 *   ├── assets/          # SVG and image assets
 *   ├── Layout/
 *   │   ├── index.tsx
 *   │   └── index.css
 *   ├── Slice1/
 *   │   ├── index.tsx
 *   │   └── index.css
 *   └── index.ts         # barrel export
 *
 * Usage: npm run generate-vite
 */

import path from 'path';
import { generateViteComponents } from '../generate/vite';

// Configuration
const MOCK_FILE = path.join(process.cwd(), 'examples/mock/component_image_composition.json');
const OUTPUT_DIR = path.join(process.cwd(), 'examples/vite/src/generated');
const TEMP_IMAGES_DIR = path.join(process.cwd(), 'temp', 'images');
const TEMP_SVGS_DIR = path.join(process.cwd(), 'temp', 'svgs');

async function main() {
  console.log('[generate-vite] Starting...');

  try {
    const result = await generateViteComponents({
      input: MOCK_FILE,
      outputDir: OUTPUT_DIR,
      tempImagesDir: TEMP_IMAGES_DIR,
      tempSvgsDir: TEMP_SVGS_DIR,
      cleanOutput: true,
      svgImportMode: 'svgr',
      imageImportMode: 'url',
      logger: {
        info: (msg) => console.log(`[generate-vite] ${msg}`),
        warn: (msg) => console.warn(`[generate-vite] ${msg}`),
        error: (msg) => console.error(`[generate-vite] ${msg}`),
      },
      pxToRem: {
        baseFontSize: 100,
        enabled: false,
        precision: 4,
      }
    });

    console.log('\n[generate-vite] Done!');
    console.log(`  Layout: ${result.layout.name} (${result.layout.width}x${result.layout.height})`);
    console.log(`  Slices: ${result.slices.length}`);
    console.log(`  Assets: ${result.assets.svgs.length} SVGs`);
    console.log(`\nTo preview:\n  cd examples/vite && npm run dev`);
  } catch (err) {
    console.error('[generate-vite] Error:', err);
    process.exit(1);
  }
}

main();
