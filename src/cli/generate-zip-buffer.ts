#!/usr/bin/env node
/**
 * CLI script to generate React components from Figma JSON
 * and return only the ZIP buffer (no permanent files written).
 *
 * Usage: npx ts-node src/cli/generate-zip-buffer.ts
 */

import path from 'path';
import fs from 'fs';
import { generateViteZipBuffer } from '@figma-bridge/generator';

// Configuration
const MOCK_FILE = path.join(process.cwd(), 'examples/mock/component_image_composition.json');
const TEMP_IMAGES_DIR = path.join(process.cwd(), 'temp', 'images');
const TEMP_SVGS_DIR = path.join(process.cwd(), 'temp', 'svgs');

async function main() {
  console.log('[generate-zip-buffer] Starting...');

  try {
    const result = await generateViteZipBuffer({
      input: MOCK_FILE,
      tempImagesDir: TEMP_IMAGES_DIR,
      tempSvgsDir: TEMP_SVGS_DIR,
      svgImportMode: 'svgr',
      imageImportMode: 'url',
      includeCssImport: false,
      cssMode: 'tailwind',
      debug: false,
      formatOutput: true,
      logger: {
        info: (msg) => console.log(`[generate-zip-buffer] ${msg}`),
        warn: (msg) => console.warn(`[generate-zip-buffer] ${msg}`),
        error: (msg) => console.error(`[generate-zip-buffer] ${msg}`),
      },
    });

    console.log('\n[generate-zip-buffer] Done!');
    console.log(`  Buffer size: ${(result.size / 1024).toFixed(2)} KB`);
    console.log(`  Layout: ${result.layout.name} (${result.layout.width}x${result.layout.height})`);
    console.log(`  Slices: ${result.slices.length}`);
    console.log(`  Assets: ${result.assets.svgCount} SVGs, ${result.assets.imageCount} images`);

    // Example: Save buffer to file for verification
    const outputPath = path.join(process.cwd(), 'temp', 'output.zip');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, result.buffer);
    console.log(`\n  Saved to: ${outputPath} (for verification)`);

    // Example usage in server context:
    // res.setHeader('Content-Type', 'application/zip');
    // res.setHeader('Content-Disposition', 'attachment; filename="components.zip"');
    // res.send(result.buffer);

  } catch (err) {
    console.error('[generate-zip-buffer] Error:', err);
    process.exit(1);
  }
}

main();
