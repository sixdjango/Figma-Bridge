/**
 * Common utility functions for Vite generator
 */

import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import type { Logger } from './types';

/**
 * Default console logger
 */
export const defaultLogger: Logger = {
  info: (msg) => console.log(`[vite-generator] ${msg}`),
  warn: (msg) => console.warn(`[vite-generator] ${msg}`),
  error: (msg) => console.error(`[vite-generator] ${msg}`),
};

/**
 * Ensure directory exists, create if not
 */
export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Clean directory by removing and recreating it
 */
export function cleanDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true });
  }
  ensureDir(dir);
}

/**
 * Copy file if source exists and destination doesn't
 */
export function copyFileIfNeeded(src: string, dest: string): boolean {
  try {
    if (!fs.existsSync(src)) return false;
    if (fs.existsSync(dest)) return true;
    fs.copyFileSync(src, dest);
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert string to PascalCase
 */
export function toPascalCase(input: string): string {
  const parts = String(input || '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  if (!parts.length) return '';
  return parts.map((p) => p[0].toUpperCase() + p.slice(1)).join('');
}

/**
 * Build a valid import name with prefix
 */
export function buildImportName(base: string, prefix: string): string {
  const pascal = toPascalCase(base) || 'Asset';
  const name = `${prefix}${pascal}`;
  return /^[A-Za-z_]/.test(name) ? name : `Asset${name}`;
}

/**
 * Ensure unique name by appending number suffix if needed
 */
export function ensureUniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  let i = 2;
  while (used.has(`${name}${i}`)) i += 1;
  const finalName = `${name}${i}`;
  used.add(finalName);
  return finalName;
}

/**
 * Strip query string and hash from path
 */
export function stripQuery(path: string): string {
  return path.split(/[?#]/)[0];
}

/**
 * Get base name without extension
 */
export function getBaseName(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  return idx > 0 ? fileName.slice(0, idx) : fileName;
}

/**
 * Normalize path to use forward slashes
 */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Convert import path to relative asset path
 */
export function toAssetIndexPath(importPath: string): string {
  const normalized = normalizePath(importPath);
  const match = normalized.match(/(?:^|\/)assets\/(.+)$/);
  const rel = match ? match[1] : normalized.replace(/^\.?\//, '');
  return rel.startsWith('./') ? rel : `./${rel}`;
}

/**
 * Result of ZIP archive creation
 */
export interface ZipArchiveResult {
  /** Path to the ZIP file (if outputPath was provided) */
  path?: string;
  /** ZIP file buffer */
  buffer: Buffer;
  /** Size of the ZIP in bytes */
  size: number;
}

/**
 * Options for creating ZIP archive
 */
export interface CreateZipOptions {
  /** Directory to archive */
  sourceDir: string;
  /** Optional path for the output ZIP file. If not provided, only buffer is returned */
  outputPath?: string;
  /** Root folder name inside the ZIP. Defaults to source directory name */
  rootName?: string;
  /** Logger */
  logger?: Logger;
}

/**
 * Create a ZIP archive of a directory
 *
 * @param sourceDir - Directory to archive
 * @param outputPath - Optional path for the output ZIP file. If not provided, only buffer is returned.
 * @param logger - Optional logger
 * @returns Promise that resolves to ZIP result with path and buffer
 */
export async function createZipArchive(
  sourceDir: string,
  outputPath?: string,
  logger: Logger = defaultLogger,
  rootName?: string
): Promise<ZipArchiveResult> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    const archive = archiver('zip', {
      zlib: { level: 9 }, // Maximum compression
    });

    // Collect buffer chunks
    archive.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    archive.on('end', async () => {
      const buffer = Buffer.concat(chunks);
      const sizeKB = (buffer.length / 1024).toFixed(2);

      // Write to file if path provided
      if (outputPath) {
        const outputDir = path.dirname(outputPath);
        ensureDir(outputDir);
        fs.writeFileSync(outputPath, buffer);
        logger.info(`ZIP created: ${outputPath} (${sizeKB} KB)`);
      } else {
        logger.info(`ZIP buffer created (${sizeKB} KB)`);
      }

      resolve({
        path: outputPath,
        buffer,
        size: buffer.length,
      });
    });

    archive.on('error', (err) => {
      logger.error(`ZIP creation failed: ${err.message}`);
      reject(err);
    });

    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') {
        logger.warn(`ZIP warning: ${err.message}`);
      } else {
        reject(err);
      }
    });

    // Add directory contents with custom root name or default to directory name
    const dirName = rootName || path.basename(sourceDir);
    archive.directory(sourceDir, dirName);

    // Finalize
    archive.finalize();
  });
}

/**
 * Create a ZIP archive buffer of a directory (without writing to disk)
 *
 * @param sourceDir - Directory to archive
 * @param logger - Optional logger
 * @returns Promise that resolves to ZIP buffer
 */
export async function createZipBuffer(
  sourceDir: string,
  logger: Logger = defaultLogger
): Promise<Buffer> {
  const result = await createZipArchive(sourceDir, undefined, logger);
  return result.buffer;
}
