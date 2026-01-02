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
 * Copy assets from temp directories to output assets directory
 */
export function copyAssets(options: CopyAssetsOptions): { images: number; svgs: number } {
  const { result, assetsDir, tempImagesDir, tempSvgsDir } = options;

  ensureDir(assetsDir);

  const images = Array.isArray(result?.assets?.images) ? result.assets.images : [];
  const svgs = Array.isArray(result?.assets?.svgs) ? result.assets.svgs : [];

  let imageCount = 0;
  let svgCount = 0;

  for (const id of images) {
    if (typeof id !== 'string' || !id) continue;
    const src = path.join(tempImagesDir, `${id}.png`);
    const dest = path.join(assetsDir, `${id}.png`);
    if (copyFileIfNeeded(src, dest)) imageCount++;
  }

  for (const name of svgs) {
    if (typeof name !== 'string' || !name) continue;
    const src = path.join(tempSvgsDir, name);
    const dest = path.join(assetsDir, name);
    if (copyFileIfNeeded(src, dest)) svgCount++;
  }

  return { images: imageCount, svgs: svgCount };
}

/**
 * Build asset index entries for barrel export
 */
export function buildAssetIndexEntries(result: FigmaToReactResult): AssetIndexEntry[] {
  const entries: AssetIndexEntry[] = [];
  const usedNames = new Set<string>();
  const existingByFile = new Map<string, AssetIndexEntry>();
  const assetImports = Array.isArray(result.assetImports) ? result.assetImports : [];
  const svgUsesQuery = assetImports.some(
    (entry) => entry.kind === 'svg' && entry.importPath.includes('?react')
  );

  // Process existing asset imports
  for (const entry of assetImports) {
    const fileName = stripQuery(entry.importPath).split(/[\\/]/).pop() || '';
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

  // Add missing images
  const images = Array.isArray(result.assets?.images) ? result.assets.images : [];
  for (const id of images) {
    if (typeof id !== 'string' || !id) continue;
    const fileName = `${id}.png`;
    if (existingByFile.has(fileName)) continue;
    const localName = ensureUniqueName(buildImportName(getBaseName(fileName), 'Img'), usedNames);
    entries.push({ localName, importPath: `./${fileName}`, kind: 'image' });
    existingByFile.set(fileName, entries[entries.length - 1]);
  }

  // Add missing SVGs
  const svgs = Array.isArray(result.assets?.svgs) ? result.assets.svgs : [];
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
