/**
 * Asset handling for Vite generator
 */

import fs from 'fs';
import path from 'path';
import type { FigmaToReactResult, AssetIndexEntry } from './types';
import {
  ensureDir,
  copyFileIfNeeded,
  stripQuery,
  getBaseName,
  buildImportName,
  ensureUniqueName,
  toAssetIndexPath,
} from './utils';

/**
 * Options for copying assets
 */
export interface CopyAssetsOptions {
  result: FigmaToReactResult;
  assetsDir: string;
  tempImagesDir: string;
  tempSvgsDir: string;
}

/**
 * Result of copying assets
 */
export interface CopyAssetsResult {
  /** Number of images copied */
  imageCount: number;
  /** Number of SVGs copied */
  svgCount: number;
  /** List of successfully copied image IDs */
  copiedImages: string[];
  /** List of successfully copied SVG filenames */
  copiedSvgs: string[];
}

/**
 * Copy assets from temp directories to output assets directory
 * Returns info about successfully copied files (filters out non-existent files)
 */
export function copyAssets(options: CopyAssetsOptions): CopyAssetsResult {
  const { result, assetsDir, tempImagesDir, tempSvgsDir } = options;

  ensureDir(assetsDir);

  const images = Array.isArray(result?.assets?.images) ? result.assets.images : [];
  const svgs = Array.isArray(result?.assets?.svgs) ? result.assets.svgs : [];

  const copiedImages: string[] = [];
  const copiedSvgs: string[] = [];

  for (const id of images) {
    if (typeof id !== 'string' || !id) continue;
    const src = path.join(tempImagesDir, `${id}.png`);
    const dest = path.join(assetsDir, `${id}.png`);
    if (copyFileIfNeeded(src, dest)) {
      copiedImages.push(id);
    }
  }

  for (const name of svgs) {
    if (typeof name !== 'string' || !name) continue;
    const src = path.join(tempSvgsDir, name);
    const dest = path.join(assetsDir, name);
    if (copyFileIfNeeded(src, dest)) {
      copiedSvgs.push(name);
    }
  }

  return {
    imageCount: copiedImages.length,
    svgCount: copiedSvgs.length,
    copiedImages,
    copiedSvgs,
  };
}

/**
 * Options for building asset index entries
 */
export interface BuildAssetIndexOptions {
  result: FigmaToReactResult;
  /** Only include these images (filters out non-existent files) */
  existingImages?: string[];
  /** Only include these SVGs (filters out non-existent files) */
  existingSvgs?: string[];
}

/**
 * Build asset index entries for barrel export
 * Only includes assets that actually exist (if existingImages/existingSvgs are provided)
 */
export function buildAssetIndexEntries(options: BuildAssetIndexOptions): AssetIndexEntry[] {
  const { result, existingImages, existingSvgs } = options;
  const entries: AssetIndexEntry[] = [];
  const usedNames = new Set<string>();
  const existingByFile = new Map<string, AssetIndexEntry>();
  const assetImports = Array.isArray(result.assetImports) ? result.assetImports : [];
  const svgUsesQuery = assetImports.some(
    (entry) => entry.kind === 'svg' && entry.importPath.includes('?react')
  );

  // Build sets for quick lookup of existing files
  const existingImageSet = existingImages ? new Set(existingImages) : null;
  const existingSvgSet = existingSvgs ? new Set(existingSvgs) : null;

  // Process existing asset imports (filter by existing files if provided)
  for (const entry of assetImports) {
    const fileName = stripQuery(entry.importPath).split(/[\\/]/).pop() || '';

    // Skip if file doesn't exist (when we have the existing files list)
    if (entry.kind === 'image' && existingImageSet) {
      const imageId = getBaseName(fileName);
      if (!existingImageSet.has(imageId)) continue;
    }
    if (entry.kind === 'svg' && existingSvgSet) {
      if (!existingSvgSet.has(fileName)) continue;
    }

    const record: AssetIndexEntry = {
      localName: entry.localName,
      importPath: toAssetIndexPath(entry.importPath),
      kind: entry.kind,
      useComponent: entry.useComponent,
    };
    entries.push(record);
    if (fileName) existingByFile.set(fileName, record);
    usedNames.add(entry.localName);
  }

  // Add missing images (only those that exist)
  const images = existingImages ?? (Array.isArray(result.assets?.images) ? result.assets.images : []);
  for (const id of images) {
    if (typeof id !== 'string' || !id) continue;
    const fileName = `${id}.png`;
    if (existingByFile.has(fileName)) continue;
    const localName = ensureUniqueName(buildImportName(getBaseName(fileName), 'Img'), usedNames);
    entries.push({ localName, importPath: `./${fileName}`, kind: 'image' });
    existingByFile.set(fileName, entries[entries.length - 1]);
  }

  // Add missing SVGs (only those that exist)
  const svgs = existingSvgs ?? (Array.isArray(result.assets?.svgs) ? result.assets.svgs : []);
  for (const name of svgs) {
    if (typeof name !== 'string' || !name) continue;
    if (existingByFile.has(name)) continue;
    const localName = ensureUniqueName(buildImportName(getBaseName(name), 'Svg'), usedNames);
    const suffix = svgUsesQuery ? '?react' : '';
    entries.push({
      localName,
      importPath: `./${name}${suffix}`,
      kind: 'svg',
      useComponent: true,
    });
    existingByFile.set(name, entries[entries.length - 1]);
  }

  return entries;
}

/**
 * Write assets barrel export file
 */
export function writeAssetsIndex(assetsDir: string, entries: AssetIndexEntry[]): void {
  if (!entries.length) return;

  const lines = entries
    .sort((a, b) => a.localName.localeCompare(b.localName))
    .map((entry) => {
      if (entry.kind === 'svg' && entry.useComponent) {
        return `export { ReactComponent as ${entry.localName} } from '${entry.importPath}';`;
      }
      return `export { default as ${entry.localName} } from '${entry.importPath}';`;
    });

  fs.writeFileSync(path.join(assetsDir, 'index.ts'), lines.join('\n') + '\n', 'utf8');
}

/**
 * Create asset URL provider for figmaToReact
 */
export interface AssetUrlProviderOptions {
  assetsDir: string;
  relativePath?: string;
}

export function createAssetUrlProvider(options: AssetUrlProviderOptions) {
  const { assetsDir, relativePath = '../assets' } = options;

  return (id: string, type: 'image' | 'svg', data?: string): string => {
    if (type === 'image') {
      return `${relativePath}/${id}.png`;
    }
    if (type === 'svg') {
      const fileName = id.endsWith('.svg') ? id : `${id}.svg`;
      if (data) {
        const assetPath = path.join(assetsDir, fileName);
        fs.writeFileSync(assetPath, data, 'utf8');
      }
      return `${relativePath}/${fileName}`;
    }
    return id;
  };
}
