/**
 * React component source code builder
 */

import fs from 'fs';
import path from 'path';
import type { ReactComponentFile, ComponentBuildContext } from './types';
import { ensureDir } from './utils';
import { extractCustomComponentImports, buildCustomComponentImportLines } from './jsx-parser';
import { convertToLessModule, generateLessImport } from './tailwind-to-less';
import { optimizeReactComponent, type OptimizeOptions } from './optimizer';

/**
 * Build TypeScript/React component source code
 */
export function buildComponentTsx(context: ComponentBuildContext): string {
  const {
    componentName,
    jsx,
    cssImportPath,
    sliceImports = [],
    assetImportNames = [],
    sliceNames = [],
  } = context;

  const lines: string[] = [];

  // Extract custom component imports from JSX, excluding slices (handled separately)
  const sliceNameSet = new Set(sliceNames);
  const customImports = extractCustomComponentImports(jsx)
    .filter(imp => !sliceNameSet.has(imp.componentName));
  const customImportLines = buildCustomComponentImportLines(customImports);

  // Build imports section
  lines.push(`import React from 'react';`);
  if (cssImportPath) {
    lines.push(`import '${cssImportPath}';`);
  }
  if (assetImportNames.length) {
    lines.push(`import { ${assetImportNames.join(', ')} } from '../assets';`);
  }
  customImportLines.forEach(imp => lines.push(imp));
  sliceImports.forEach(imp => lines.push(imp));
  lines.push('');

  // Simple component with inline className/style on root element
  lines.push(`export const ${componentName}: React.FC = () => (`);
  lines.push(jsx);
  lines.push(');');

  lines.push('');
  lines.push(`export default ${componentName};`);

  return lines.join('\n');
}

/**
 * Get asset import names from component
 */
export function getAssetImportNames(component: ReactComponentFile): string[] {
  const imports = Array.isArray(component.assetImports) ? component.assetImports : [];
  const names = imports.map((entry) => entry.localName).filter(Boolean);
  return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
}

/**
 * Build component context with pre-extracted imports
 */
interface ComponentBuildContextWithImports {
  componentName: string;
  jsx: string;
  cssImportPath?: string;
  sliceImports: string[];
  assetImportNames: string[];
  customImportLines: string[];
}

/**
 * Build TypeScript/React component source code with pre-extracted imports
 * Use this when imports need to be extracted before processing JSX
 */
export function buildComponentTsxWithImports(context: ComponentBuildContextWithImports): string {
  const {
    componentName,
    jsx,
    cssImportPath,
    sliceImports = [],
    assetImportNames = [],
    customImportLines = [],
  } = context;

  const lines: string[] = [];

  // Build imports section
  lines.push(`import React from 'react';`);
  if (cssImportPath) {
    lines.push(`import '${cssImportPath}';`);
  }
  if (assetImportNames.length) {
    lines.push(`import { ${assetImportNames.join(', ')} } from '../assets';`);
  }
  customImportLines.forEach(imp => lines.push(imp));
  sliceImports.forEach(imp => lines.push(imp));
  lines.push('');

  // Simple component with inline className/style on root element
  lines.push(`export const ${componentName}: React.FC = () => (`);
  lines.push(jsx);
  lines.push(');');

  lines.push('');
  lines.push(`export default ${componentName};`);

  return lines.join('\n');
}

/**
 * Debug data attributes that should be stripped in production mode
 * Note: data-component-name is NOT stripped because it's used for determining tag names
 */
const DEBUG_DATA_ATTRS = [
  'data-node-id',
  'data-layer-id',
  'data-component-lib',
  'data-import-way',
  'data-component-type',
  // 'data-component-name' is intentionally NOT stripped - it's used for tag name resolution
];

/**
 * Strip debug data attributes from JSX content
 */
export function stripDebugAttributes(jsx: string): string {
  let result = jsx;
  for (const attr of DEBUG_DATA_ATTRS) {
    // Match attribute with quoted value: data-node-id="..." or data-node-id='...'
    result = result.replace(new RegExp(`\\s*${attr}="[^"]*"`, 'g'), '');
    result = result.replace(new RegExp(`\\s*${attr}='[^']*'`, 'g'), '');
  }
  return result;
}

/**
 * Format TypeScript/JSX code using simple formatting rules
 * (For production, consider using prettier)
 */
export function formatCode(code: string): string {
  // Basic formatting: normalize line endings and remove excessive blank lines
  return code
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n';
}

/**
 * Write component files to disk
 */
export interface WriteComponentOptions {
  component: ReactComponentFile;
  outputDir: string;
  sliceImports?: string[];
  sliceNames?: string[];
  /** Whether to include CSS import */
  includeCssImport?: boolean;
  /** Whether to include debug data attributes */
  debug?: boolean;
  /** Whether to format output */
  formatOutput?: boolean;
  /**
   * CSS output mode:
   * - 'tailwind': Use Tailwind CSS classes inline (default)
   * - 'less-module': Generate LESS module file with converted styles
   */
  cssMode?: 'tailwind' | 'less-module';
  /**
   * Whether to optimize the generated output
   * - Converts inline styles to Tailwind classes
   * - Removes identity transforms
   * - Merges nested single-child divs
   * - Simplifies colors and JSX strings
   */
  optimizeOutput?: boolean;
  /** Optimization options (used when optimizeOutput is true) */
  optimizeOptions?: OptimizeOptions;
  onWrite?: (name: string, width: number, height: number) => void;
}

export function writeComponent(options: WriteComponentOptions): string {
  const {
    component,
    outputDir,
    sliceImports = [],
    sliceNames = [],
    includeCssImport = true,
    debug = false,
    formatOutput = true,
    cssMode = 'tailwind',
    optimizeOutput = false,
    optimizeOptions,
    onWrite,
  } = options;

  const componentDir = path.join(outputDir, component.name);
  ensureDir(componentDir);
  const assetImportNames = getAssetImportNames(component);

  // Extract custom component imports from ORIGINAL JSX (before stripping attributes)
  // This is important because extractCustomComponentImports relies on data-component-lib
  const sliceNameSet = new Set(sliceNames);
  const customImports = extractCustomComponentImports(component.jsx)
    .filter(imp => !sliceNameSet.has(imp.componentName));
  const customImportLines = buildCustomComponentImportLines(customImports);

  // Optionally strip debug attributes from JSX
  let processedJsx = component.jsx;
  if (!debug) {
    processedJsx = stripDebugAttributes(processedJsx);
  }

  // Handle LESS module conversion
  let lessContent: string | undefined;
  let cssImportPath: string | undefined;

  if (cssMode === 'less-module') {
    // Convert Tailwind classes to LESS module
    const lessResult = convertToLessModule(processedJsx, component.name);
    processedJsx = lessResult.jsx;
    lessContent = lessResult.less;
    cssImportPath = './index.module.less';
    customImportLines.unshift(generateLessImport('index.module.less'));
  } else if (includeCssImport) {
    cssImportPath = './index.css';
  }

  // Build component source with pre-extracted imports
  let tsxContent = buildComponentTsxWithImports({
    componentName: component.name,
    jsx: processedJsx,
    cssImportPath: cssMode === 'less-module' ? undefined : cssImportPath, // LESS import is in customImportLines
    sliceImports,
    assetImportNames,
    customImportLines,
  });

  // Format output if requested
  if (formatOutput) {
    tsxContent = formatCode(tsxContent);
  }

  // Optimize output if requested (only for tailwind mode, as LESS module has its own structure)
  if (optimizeOutput && cssMode === 'tailwind') {
    tsxContent = optimizeReactComponent(tsxContent, optimizeOptions);
  }

  // Write files
  const tsxPath = path.join(componentDir, 'index.tsx');
  fs.writeFileSync(tsxPath, tsxContent, 'utf8');

  // Write LESS module file
  if (cssMode === 'less-module' && lessContent) {
    const lessPath = path.join(componentDir, 'index.module.less');
    fs.writeFileSync(lessPath, lessContent, 'utf8');
  }

  // Only write CSS file if CSS import is included and not using LESS module
  if (cssMode !== 'less-module' && includeCssImport) {
    const cssPath = path.join(componentDir, 'index.css');
    fs.writeFileSync(cssPath, component.cssText, 'utf8');
  }

  onWrite?.(component.name, component.baseWidth, component.baseHeight);

  return componentDir;
}

/**
 * Generate barrel export file (index.ts)
 */
export function generateBarrelExport(
  outputDir: string,
  layoutName: string,
  sliceNames: string[]
): void {
  const exports = [
    `import Layout from './${layoutName}';`,
    `export { default as ${layoutName} } from './${layoutName}';`,
    ...sliceNames.map(name => `export { default as ${name} } from './${name}';`),
    `export default Layout;`,
  ];
  fs.writeFileSync(path.join(outputDir, 'index.ts'), exports.join('\n') + '\n', 'utf8');
}
