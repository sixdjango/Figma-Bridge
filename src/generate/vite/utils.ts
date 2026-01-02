/**
 * Common utility functions for Vite generator
 */

import fs from 'fs';
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
