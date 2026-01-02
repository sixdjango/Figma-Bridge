/**
 * React component source code builder
 */

import fs from 'fs';
import path from 'path';
import type { ReactComponentFile, ComponentBuildContext } from './types';
import { ensureDir } from './utils';
import { parseJsxRoot, extractCustomComponentImports, buildCustomComponentImportLines } from './jsx-parser';

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
  lines.push(`import '${cssImportPath}';`);
  if (assetImportNames.length) {
    lines.push(`import { ${assetImportNames.join(', ')} } from '../assets';`);
  }
  customImportLines.forEach(imp => lines.push(imp));
  sliceImports.forEach(imp => lines.push(imp));
  lines.push('');

  // Parse root element info for props merging
  const rootInfo = parseJsxRoot(jsx);

  if (rootInfo) {
    // Generate component with props support
    const baseClassNameLiteral = JSON.stringify(rootInfo.className);
    const baseStyleEntries = Object.entries(rootInfo.style)
      .map(([k, v]) => `'${k}': ${JSON.stringify(v)}`)
      .join(', ');
    const baseStyleLiteral = `{ ${baseStyleEntries} }`;

    // Other attrs
    const otherAttrsStr = Object.entries(rootInfo.otherAttrs)
      .map(([k, v]) => `${k}="${v}"`)
      .join(' ');
    const otherAttrsPart = otherAttrsStr ? ` ${otherAttrsStr}` : '';

    lines.push(`const baseClassName = ${baseClassNameLiteral};`);
    lines.push(`const baseStyle = ${baseStyleLiteral};`);
    lines.push('');
    lines.push(`interface ${componentName}Props {`);
    lines.push('  className?: string;');
    lines.push('  style?: React.CSSProperties;');
    lines.push('  [key: string]: unknown;');
    lines.push('}');
    lines.push('');
    lines.push(`export const ${componentName}: React.FC<${componentName}Props> = ({ className, style, ...props }) => (`);
    lines.push(`  <${rootInfo.tag}`);
    lines.push(`    className={className ? \`\${baseClassName} \${className}\` : baseClassName}`);
    lines.push(`    style={{ ...baseStyle, ...style }}`);
    lines.push(`    {...props}${otherAttrsPart}`);
    lines.push('  >');
    if (rootInfo.innerJsx) {
      lines.push(rootInfo.innerJsx);
    }
    lines.push(`  </${rootInfo.tag}>`);
    lines.push(');');
  } else {
    // Fallback: simple component without props
    lines.push(`export const ${componentName}: React.FC = () => (`);
    lines.push(jsx);
    lines.push(');');
  }

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
 * Write component files to disk
 */
export interface WriteComponentOptions {
  component: ReactComponentFile;
  outputDir: string;
  sliceImports?: string[];
  sliceNames?: string[];
  onWrite?: (name: string, width: number, height: number) => void;
}

export function writeComponent(options: WriteComponentOptions): string {
  const {
    component,
    outputDir,
    sliceImports = [],
    sliceNames = [],
    onWrite,
  } = options;

  const componentDir = path.join(outputDir, component.name);
  ensureDir(componentDir);
  const assetImportNames = getAssetImportNames(component);

  // Build component source
  const tsxContent = buildComponentTsx({
    componentName: component.name,
    jsx: component.jsx,
    cssImportPath: './index.css',
    sliceImports,
    assetImportNames,
    sliceNames,
  });

  // Write files
  const tsxPath = path.join(componentDir, 'index.tsx');
  const cssPath = path.join(componentDir, 'index.css');

  fs.writeFileSync(tsxPath, tsxContent, 'utf8');
  fs.writeFileSync(cssPath, component.cssText, 'utf8');

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
    `export { default as ${layoutName} } from './${layoutName}';`,
    ...sliceNames.map(name => `export { default as ${name} } from './${name}';`)
  ];
  fs.writeFileSync(path.join(outputDir, 'index.ts'), exports.join('\n') + '\n', 'utf8');
}
