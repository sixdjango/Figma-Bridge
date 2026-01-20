/**
 * Vite React Component Generator
 *
 * Generates React components from Figma JSON for Vite projects.
 *
 * @example
 * ```typescript
 * import { generateViteComponents } from './generate/vite';
 *
 * const result = await generateViteComponents({
 *   input: './figma-data.json',
 *   outputDir: './src/generated',
 * });
 * ```
 */

import fs from 'fs';
import path from 'path';
import { figmaToReact } from 'figma-html-bridge';
import type {
  ViteGeneratorOptions,
  ViteGeneratorResult,
  FigmaToReactResult,
  Logger,
} from './types';
import { ensureDir, cleanDir, defaultLogger, buildImportName } from './utils';
import { writeComponent, generateBarrelExport } from './component-builder';
import {
  copyAssets,
  buildAssetIndexEntries,
  writeAssetsIndex,
  createAssetUrlProvider,
  saveBase64Images,
} from './asset-handler';

// Re-export types and utilities for external use
export * from './types';
export * from './utils';
export * from './jsx-parser';
export * from './component-builder';
export * from './asset-handler';

/**
 * Default options for Vite generator
 */
const DEFAULT_OPTIONS: Partial<ViteGeneratorOptions> = {
  cleanOutput: true,
  svgImportMode: 'svgr',
  imageImportMode: 'url',
};

/**
 * Generate Vite React components from Figma JSON
 *
 * @param options - Generator options
 * @returns Generation result with component info
 */
export async function generateViteComponents(
  options: ViteGeneratorOptions
): Promise<ViteGeneratorResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const logger = opts.logger || defaultLogger;

  // Resolve paths
  const outputDir = path.resolve(opts.outputDir);
  const assetsDir = opts.assetsDir
    ? path.resolve(opts.assetsDir)
    : path.join(outputDir, 'assets');
  const tempImagesDir = opts.tempImagesDir
    ? path.resolve(opts.tempImagesDir)
    : path.join(process.cwd(), 'temp', 'images');
  const tempSvgsDir = opts.tempSvgsDir
    ? path.resolve(opts.tempSvgsDir)
    : path.join(process.cwd(), 'temp', 'svgs');

  // Load input data
  let inputData: object;
  if (typeof opts.input === 'string') {
    const inputPath = path.resolve(opts.input);
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file not found: ${inputPath}`);
    }
    const rawJson = fs.readFileSync(inputPath, 'utf8');
    inputData = JSON.parse(rawJson);
    logger.info(`Loaded input from: ${inputPath}`);
  } else {
    inputData = opts.input;
  }

  // Clean and create output directories
  if (opts.cleanOutput) {
    cleanDir(outputDir);
  } else {
    ensureDir(outputDir);
  }
  ensureDir(assetsDir);
  logger.info(`Output directory: ${outputDir}`);

  // Extract and save base64 images from component definitions
  const layoutData = (inputData as any)?.layout;
  const components = Array.isArray(layoutData?.components) ? layoutData.components : [];
  const savedBase64Images = saveBase64Images(components, assetsDir, logger);
  if (savedBase64Images.length > 0) {
    logger.info(`Saved ${savedBase64Images.length} base64 images from components`);
  }

  // Generate React components
  logger.info('Generating React components...');

  const result: FigmaToReactResult = await figmaToReact(inputData, {
    assetUrlProvider: createAssetUrlProvider({ assetsDir }),
    assetImportMode: {
      svg: opts.svgImportMode,
      image: opts.imageImportMode,
    },
    pxToRem: opts.pxToRem,
  });

  // Copy assets (returns only successfully copied files)
  const copyResult = copyAssets({
    result,
    assetsDir,
    tempImagesDir,
    tempSvgsDir,
  });

  // Merge base64 saved images with copied images
  const allCopiedImages = [
    ...copyResult.copiedImages,
    ...savedBase64Images.map(img => img.imageId),
  ];

  // Write assets index (only for files that actually exist)
  const assetEntries = buildAssetIndexEntries({
    result,
    existingImages: allCopiedImages,
    existingSvgs: copyResult.copiedSvgs,
  });
  writeAssetsIndex(assetsDir, assetEntries);

  // Write slice components
  const sliceResults: ViteGeneratorResult['slices'] = [];
  for (const slice of result.slices) {
    const slicePath = writeComponent({
      component: slice,
      outputDir,
      onWrite: (name, width, height) => {
        logger.info(`Written: ${name}/index.tsx + index.css (${width}x${height})`);
      },
    });
    sliceResults.push({
      name: slice.name,
      path: slicePath,
      width: slice.baseWidth,
      height: slice.baseHeight,
    });
  }

  // Write layout component with slice imports
  const sliceImports = result.slices.map(
    (s) => `import ${s.name} from '../${s.name}';`
  );
  const sliceNames = result.slices.map((s) => s.name);

  const layoutPath = writeComponent({
    component: result.layout,
    outputDir,
    sliceImports,
    sliceNames,
    onWrite: (name, width, height) => {
      logger.info(`Written: ${name}/index.tsx + index.css (${width}x${height})`);
    },
  });

  // Generate barrel export
  generateBarrelExport(outputDir, result.layout.name, sliceNames);
  logger.info('Written: index.ts');

  logger.info('Generation complete!');
  logger.info(`  Layout: ${result.layout.name}`);
  logger.info(`  Slices: ${result.slices.length}`);
  logger.info(`  Assets: ${copyResult.copiedSvgs.length} SVGs, ${copyResult.copiedImages.length} images`);

  return {
    layout: {
      name: result.layout.name,
      path: layoutPath,
      width: result.layout.baseWidth,
      height: result.layout.baseHeight,
    },
    slices: sliceResults,
    assets: {
      svgs: copyResult.copiedSvgs,
      images: copyResult.copiedImages,
    },
  };
}

/**
 * Create a configured generator instance
 * Useful for reusing configuration across multiple generations
 */
export function createViteGenerator(baseOptions: Partial<ViteGeneratorOptions>) {
  return {
    /**
     * Generate components with merged options
     */
    generate: (options: Partial<ViteGeneratorOptions> & { input: ViteGeneratorOptions['input'] }) =>
      generateViteComponents({ ...baseOptions, ...options } as ViteGeneratorOptions),

    /**
     * Get resolved options
     */
    getOptions: () => ({ ...DEFAULT_OPTIONS, ...baseOptions }),
  };
}
