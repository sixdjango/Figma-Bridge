/**
 * JSX parsing utilities for extracting component information
 */

import type { RootElementInfo, CustomComponentImport } from './types';

/**
 * Parse JSX string to extract root element information
 * Used for props merging in generated components
 */
export function parseJsxRoot(jsx: string): RootElementInfo | null {
  // Match: <tagName className="..." style={{...}} ...>content</tagName>
  const rootMatch = jsx.match(/^\s*<(\w+)\s+([^>]*)>([\s\S]*)<\/\1>\s*$/);
  if (!rootMatch) return null;

  const [, tag, attrsStr, innerContent] = rootMatch;

  // Extract className
  const classMatch = attrsStr.match(/className=(?:"([^"]*)"|{[^}]*})/);
  const className = classMatch ? classMatch[1] || '' : '';

  // Extract style object
  const styleMatch = attrsStr.match(/style=\{\s*\{([^}]*)\}\s*\}/);
  const style: Record<string, string> = {};
  if (styleMatch) {
    const styleContent = styleMatch[1];
    const styleEntries = styleContent.match(/'([^']+)':\s*"([^"]*)"/g);
    if (styleEntries) {
      for (const entry of styleEntries) {
        const m = entry.match(/'([^']+)':\s*"([^"]*)"/);
        if (m) style[m[1]] = m[2];
      }
    }
  }

  // Extract other attrs (excluding className and style)
  const otherAttrs: Record<string, string> = {};
  const attrMatches = attrsStr.matchAll(/(\w+)="([^"]*)"/g);
  for (const m of attrMatches) {
    if (m[1] !== 'className') {
      otherAttrs[m[1]] = m[2];
    }
  }

  return { tag, className, style, otherAttrs, innerJsx: innerContent.trim() };
}

/**
 * Extract custom component imports from JSX
 * Parses data-component-lib and data-import-way attributes
 */
export function extractCustomComponentImports(jsx: string): CustomComponentImport[] {
  const imports: CustomComponentImport[] = [];
  const seen = new Set<string>();

  // Match: <ComponentName ... data-component-lib="..." data-import-way="..." ...>
  const regex = /<([A-Z][a-zA-Z0-9]*)\s+[^>]*data-component-lib="([^"]+)"[^>]*data-import-way="([^"]+)"[^>]*>/g;
  let match;
  while ((match = regex.exec(jsx)) !== null) {
    const [, componentName, fromLib, importWay] = match;
    const key = `${componentName}:${fromLib}`;
    if (seen.has(key)) continue;
    seen.add(key);
    imports.push({
      componentName,
      fromLib,
      importWay: importWay === 'DEFAULT' ? 'DEFAULT' : 'NAMED',
    });
  }

  // Also try alternative order: data-import-way before data-component-lib
  const regex2 = /<([A-Z][a-zA-Z0-9]*)\s+[^>]*data-import-way="([^"]+)"[^>]*data-component-lib="([^"]+)"[^>]*>/g;
  while ((match = regex2.exec(jsx)) !== null) {
    const [, componentName, importWay, fromLib] = match;
    const key = `${componentName}:${fromLib}`;
    if (seen.has(key)) continue;
    seen.add(key);
    imports.push({
      componentName,
      fromLib,
      importWay: importWay === 'DEFAULT' ? 'DEFAULT' : 'NAMED',
    });
  }

  return imports;
}

/**
 * Build import lines from custom component imports
 * Groups named imports from same library
 */
export function buildCustomComponentImportLines(imports: CustomComponentImport[]): string[] {
  // Group by fromLib
  const byLib = new Map<string, CustomComponentImport[]>();
  for (const imp of imports) {
    const list = byLib.get(imp.fromLib) || [];
    list.push(imp);
    byLib.set(imp.fromLib, list);
  }

  const lines: string[] = [];
  for (const [lib, comps] of byLib) {
    const namedImports = comps
      .filter(c => c.importWay === 'NAMED')
      .map(c => c.componentName);
    const defaultImports = comps.filter(c => c.importWay === 'DEFAULT');

    if (namedImports.length > 0) {
      lines.push(`import { ${namedImports.join(', ')} } from '${lib}';`);
    }
    for (const def of defaultImports) {
      lines.push(`import ${def.componentName} from '${lib}';`);
    }
  }
  return lines;
}
