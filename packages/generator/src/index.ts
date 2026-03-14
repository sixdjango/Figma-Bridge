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
  ViteOnlineResult,
  FigmaToReactResult,
  Logger,
  UploadedAssets,
} from './types';
import { ensureDir, cleanDir, defaultLogger, buildImportName, createZipArchive } from './utils';
import { writeComponent, generateBarrelExport, buildComponentString } from './component-builder';
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
export * from './tailwind-to-less';
export * from './optimizer';

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
  // When outputDir is omitted, generate to a temp dir, zip to memory, then clean up
  if (!options.outputDir) {
    return _generateViteComponentsMemory(options);
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };
  const logger = opts.logger || defaultLogger;

  // Resolve paths
  const outputDir = path.resolve(opts.outputDir!);
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
  // By default, only copy assets that are actually referenced in the components
  const onlyReferencedAssets = opts.onlyReferencedAssets !== false; // default true
  const copyResult = copyAssets({
    result,
    assetsDir,
    tempImagesDir,
    tempSvgsDir,
    onlyReferenced: onlyReferencedAssets,
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

  // Determine options for component writing
  const includeCssImport = opts.includeCssImport !== false; // default true
  const debug = opts.debug === true; // default false
  const formatOutput = opts.formatOutput !== false; // default true
  const cssMode = opts.cssMode || 'tailwind'; // default tailwind
  const optimizeOutput = opts.optimizeOutput === true; // default false
  const optimizeOptions = opts.optimizeOptions;

  // Determine file suffix for logging
  let filesSuffix: string;
  if (cssMode === 'less-module') {
    filesSuffix = '/index.tsx + index.module.less';
  } else if (includeCssImport) {
    filesSuffix = '/index.tsx + index.css';
  } else {
    filesSuffix = '/index.tsx';
  }

  // Write slice components
  const sliceResults: ViteGeneratorResult['slices'] = [];
  for (const slice of result.slices) {
    const slicePath = writeComponent({
      component: slice,
      outputDir,
      includeCssImport,
      debug,
      formatOutput,
      cssMode,
      optimizeOutput,
      optimizeOptions,
      onWrite: (name, width, height) => {
        logger.info(`Written: ${name}${filesSuffix} (${width}x${height})`);
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
    includeCssImport,
    debug,
    formatOutput,
    cssMode,
    optimizeOutput,
    optimizeOptions,
    onWrite: (name, width, height) => {
      logger.info(`Written: ${name}${filesSuffix} (${width}x${height})`);
    },
  });

  // Generate barrel export
  generateBarrelExport(outputDir, result.layout.name, sliceNames);
  logger.info('Written: index.ts');

  logger.info('Generation complete!');
  logger.info(`  Layout: ${result.layout.name}`);
  logger.info(`  Slices: ${result.slices.length}`);
  logger.info(`  Assets: ${copyResult.copiedSvgs.length} SVGs, ${copyResult.copiedImages.length} images`);

  // Create ZIP archive if requested
  let zipPath: string | undefined;
  let zipBuffer: Buffer | undefined;
  if (opts.outputZip) {
    const zipFilePath = opts.zipPath || `${outputDir}.zip`;
    const zipResult = await createZipArchive(outputDir, zipFilePath, logger);
    zipPath = zipResult.path;
    zipBuffer = zipResult.buffer;
  }

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
    zipPath,
    zipBuffer,
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

/**
 * Create an asset URL provider that maps asset IDs to remote URLs
 */
function createOnlineAssetUrlProvider(uploadedAssets: UploadedAssets) {
  return (id: string, type: 'image' | 'svg', data?: string): string => {
    if (type === 'image') {
      return uploadedAssets.images[id] || `${id}.png`;
    }
    if (type === 'svg') {
      const svgId = id.endsWith('.svg') ? id.replace(/\.svg$/, '') : id;
      return uploadedAssets.svgs[svgId] || uploadedAssets.svgs[id] || `${id}.svg`;
    }
    return id;
  };
}

/**
 * Generate Vite React components for online/remote mode.
 *
 * All assets (images + SVGs) are referenced as <img> tags with remote URLs
 * from the uploadedAssets mapping. No files are written to disk, no ZIP is
 * created — returns component source code strings ready for network transmission.
 *
 * @param options - Generator options (must include uploadedAssets)
 * @returns Object with layout code string and array of slice code strings
 *
 * @example
 * ```typescript
 * const result = await generateViteOnline({
 *   input: figmaJsonData,
 *   uploadedAssets: {
 *     images: { 'abc123': 'https://oss.example.com/abc123.png' },
 *     svgs: { 'icon1': 'https://oss.example.com/icon1.svg' },
 *   },
 * });
 *
 * // result.layout is the Layout component source code
 * // result.slices is an array of slice component source codes
 * ```
 */
export async function generateViteOnline(
  options: ViteGeneratorOptions & { uploadedAssets: UploadedAssets }
): Promise<ViteOnlineResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const logger = opts.logger || defaultLogger;

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

  // Extract picBase64 from input data
  const layoutData = (inputData as any)?.layout;
  const layoutPicBase64: string = layoutData?.picBase64 || '';
  const components: any[] = Array.isArray(layoutData?.components) ? layoutData.components : [];

  // Build slice name → picBase64 mapping
  const slicePicMap = new Map<string, string>();
  for (const comp of components) {
    if (String(comp?.componentType || '').toUpperCase() === 'SLICE' && comp?.type) {
      slicePicMap.set(comp.type, comp.picBase64 || '');
    }
  }

  // Generate React components with remote asset URLs
  // Use 'none' import mode so assets stay as string URLs in JSX (no import statements)
  logger.info('Generating React components (online mode)...');

  const result: FigmaToReactResult = await figmaToReact(inputData, {
    assetUrlProvider: createOnlineAssetUrlProvider(opts.uploadedAssets),
    assetImportMode: {
      svg: 'none',
      image: 'none',
    },
    pxToRem: opts.pxToRem,
  });

  // Online mode is tailwind-only, no CSS import needed
  const debug = opts.debug === true;
  const formatOutput = opts.formatOutput !== false;
  const optimizeOutput = opts.optimizeOutput === true;
  const optimizeOptions = opts.optimizeOptions;

  // Build slice results
  const sliceResults: ViteOnlineResult['slices'] = [];
  for (const slice of result.slices) {
    const code = buildComponentString({
      component: slice,
      includeCssImport: false,
      debug,
      formatOutput,
      cssMode: 'tailwind',
      optimizeOutput,
      optimizeOptions,
    });
    sliceResults.push({
      code,
      uiImg: slicePicMap.get(slice.name) || '',
    });
  }

  // Build layout component string with slice imports
  const sliceImports = result.slices.map(
    (s) => `import ${s.name} from '../${s.name}';`
  );
  const sliceNames = result.slices.map((s) => s.name);

  const layoutCode = buildComponentString({
    component: result.layout,
    sliceImports,
    sliceNames,
    includeCssImport: false,
    debug,
    formatOutput,
    cssMode: 'tailwind',
    optimizeOutput,
    optimizeOptions,
  });

  logger.info('Online generation complete!');
  logger.info(`  Layout: ${result.layout.name}`);
  logger.info(`  Slices: ${result.slices.length}`);

  return {
    layout: { code: layoutCode, uiImg: layoutPicBase64 },
    slices: sliceResults,
  };
}

/**
 * Internal: generate to a temp dir, zip to memory, clean up, return result with zipBuffer.
 */
async function _generateViteComponentsMemory(
  options: ViteGeneratorOptions
): Promise<ViteGeneratorResult> {
  const logger = options.logger || defaultLogger;

  const tempDir = path.join(
    process.cwd(),
    'temp',
    `vite-gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );

  try {
    const result = await generateViteComponents({ ...options, outputDir: tempDir });

    const zipResult = await createZipArchive(
      tempDir,
      undefined,
      {
        info: () => {},
        warn: logger.warn,
        error: logger.error,
      },
      'generated'
    );

    logger.info(`Generated ZIP buffer: ${(zipResult.size / 1024).toFixed(2)} KB`);

    return {
      layout: { name: result.layout.name, width: result.layout.width, height: result.layout.height },
      slices: result.slices.map((s) => ({ name: s.name, width: s.width, height: s.height })),
      assets: result.assets,
      zipBuffer: zipResult.buffer,
    };
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  }
}

/**
 * Options for generating ZIP buffer only
 */
export interface GenerateZipBufferOptions {
  /** Input: file path or parsed JSON object */
  input: string | object;
  /** Directory containing temporary image files */
  tempImagesDir?: string;
  /** Directory containing temporary SVG files */
  tempSvgsDir?: string;
  /** How SVGs should be imported */
  svgImportMode?: 'svgr' | 'svgr-query' | 'url' | 'none';
  /** How images should be imported */
  imageImportMode?: 'url' | 'none';
  /** Include CSS import in components */
  includeCssImport?: boolean;
  /** CSS mode: 'tailwind' or 'less-module' */
  cssMode?: 'tailwind' | 'less-module';
  /** Include debug data attributes */
  debug?: boolean;
  /** Format output code with Prettier */
  formatOutput?: boolean;
  /** Only copy referenced assets */
  onlyReferencedAssets?: boolean;
  /** Px to rem conversion options */
  pxToRem?: {
    enabled: boolean;
    baseFontSize?: number;
    precision?: number;
  };
  /** Root folder name inside the ZIP (default: 'generated') */
  rootName?: string;
  /** Custom logger */
  logger?: Logger;
  /**
   * Whether to optimize the generated output
   * Converts inline styles to Tailwind, merges nested divs, etc.
   * Only applies to 'tailwind' cssMode.
   */
  optimizeOutput?: boolean;
  /** Optimization options (used when optimizeOutput is true) */
  optimizeOptions?: ViteGeneratorOptions['optimizeOptions'];
}

/**
 * Result of ZIP buffer generation
 */
export interface GenerateZipBufferResult {
  /** ZIP file buffer */
  buffer: Buffer;
  /** Size of the ZIP in bytes */
  size: number;
  /** Layout component info */
  layout: {
    name: string;
    width: number;
    height: number;
  };
  /** Slice components info */
  slices: Array<{
    name: string;
    width: number;
    height: number;
  }>;
  /** Asset counts */
  assets: {
    svgCount: number;
    imageCount: number;
  };
}

/**
 * Generate Vite React components and return only the ZIP buffer
 *
 * This method generates components to a temporary directory, creates a ZIP buffer,
 * and cleans up the temporary files. No permanent files are written to disk.
 *
 * @param options - Generator options
 * @returns Promise that resolves to ZIP buffer result
 *
 * @example
 * ```typescript
 * const result = await generateViteZipBuffer({
 *   input: figmaJsonData,
 *   cssMode: 'tailwind',
 * });
 *
 * // Use buffer for HTTP response
 * res.setHeader('Content-Type', 'application/zip');
 * res.send(result.buffer);
 * ```
 */
export async function generateViteZipBuffer(
  options: GenerateZipBufferOptions
): Promise<GenerateZipBufferResult> {
  const logger = options.logger || defaultLogger;

  // Create a unique temporary directory
  const tempDir = path.join(
    process.cwd(),
    'temp',
    `vite-gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );

  try {
    // Generate components to temp directory
    const result = await generateViteComponents({
      input: options.input,
      outputDir: tempDir,
      tempImagesDir: options.tempImagesDir,
      tempSvgsDir: options.tempSvgsDir,
      cleanOutput: true,
      svgImportMode: options.svgImportMode || 'svgr',
      imageImportMode: options.imageImportMode || 'url',
      includeCssImport: options.includeCssImport,
      cssMode: options.cssMode || 'tailwind',
      debug: options.debug || false,
      formatOutput: options.formatOutput !== false,
      onlyReferencedAssets: options.onlyReferencedAssets !== false,
      pxToRem: options.pxToRem,
      optimizeOutput: options.optimizeOutput,
      optimizeOptions: options.optimizeOptions,
      outputZip: false, // We'll create the buffer ourselves
      logger: {
        // Use silent logger for internal generation, only log final result
        info: () => {},
        warn: logger.warn,
        error: logger.error,
      },
    });

    // Create ZIP buffer from temp directory with clean root name
    const zipResult = await createZipArchive(
      tempDir,
      undefined,
      {
        info: () => {}, // Silent
        warn: logger.warn,
        error: logger.error,
      },
      options.rootName || 'generated' // Use clean root folder name
    );

    logger.info(`Generated ZIP buffer: ${(zipResult.size / 1024).toFixed(2)} KB`);
    logger.info(`  Layout: ${result.layout.name} (${result.layout.width}x${result.layout.height})`);
    logger.info(`  Slices: ${result.slices.length}`);
    logger.info(`  Assets: ${result.assets.svgs.length} SVGs, ${result.assets.images.length} images`);

    return {
      buffer: zipResult.buffer,
      size: zipResult.size,
      layout: {
        name: result.layout.name,
        width: result.layout.width,
        height: result.layout.height,
      },
      slices: result.slices.map((s) => ({
        name: s.name,
        width: s.width,
        height: s.height,
      })),
      assets: {
        svgCount: result.assets.svgs.length,
        imageCount: result.assets.images.length,
      },
    };
  } finally {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  }
}
