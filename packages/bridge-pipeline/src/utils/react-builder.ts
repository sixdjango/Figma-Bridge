import { parseHTML } from 'linkedom';

export type AssetImportMode = {
  svg?: 'svgr' | 'svgr-query' | 'url' | 'none';
  image?: 'url' | 'none';
};

export type AssetImport = {
  kind: 'image' | 'svg';
  localName: string;
  importPath: string;
  useComponent?: boolean;
};

/**
 * Options for converting px to rem in styles
 */
export type PxToRemOptions = {
  /** Enable px to rem conversion */
  enabled: boolean;
  /** Base font size in px (default: 16) */
  baseFontSize?: number;
  /** Decimal precision (default: 4) */
  precision?: number;
  /** Properties to exclude from conversion (e.g., ['border-width', 'box-shadow']) */
  excludeProperties?: string[];
};

export type JsxParseResult = {
  rootTag: string;
  rootClassName: string;
  rootStyleObj: Record<string, string>;
  rootDynamicStyles?: Map<string, { template: string; imports: string[] }>;
  rootOtherAttrs: Record<string, string>;
  innerJsx: string;
  fullJsx: string;
};

type ReactifyOptions = {
  indent?: number;
  componentTags?: Map<string, string>;
  skipChildrenTags?: Set<string>;
  assetImportMode?: AssetImportMode;
  assetImports?: Map<string, AssetImport>;
  assetImportRefs?: Set<AssetImport>;
  pxToRem?: PxToRemOptions;
};

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

/**
 * Result of splitting HTML by slice node IDs
 */
export type HtmlSplitResult = {
  /** Layout HTML with slice placeholders */
  layoutHtml: string;
  /** Extracted slice HTML fragments by node ID */
  slices: Map<string, { html: string; nodeId: string }>;
};

/**
 * Split HTML by extracting elements with specified node IDs
 * and replacing them with component placeholders
 *
 * @param html - Full HTML content
 * @param sliceNodeIds - Array of node IDs to extract as slices
 * @param sliceNameMap - Map from nodeId to component name
 * @returns Split result with layout HTML and extracted slice HTML
 */
export function splitHtmlByNodeIds(
  html: string,
  sliceNodeIds: string[],
  sliceNameMap: Map<string, string>
): HtmlSplitResult {
  if (!sliceNodeIds.length) {
    return { layoutHtml: html, slices: new Map() };
  }

  const parsed = parseHTML(html || '');
  const doc = parsed.document;
  const slices = new Map<string, { html: string; nodeId: string }>();

  for (const nodeId of sliceNodeIds) {
    // Find element with data-node-id attribute
    const element = doc.querySelector(`[data-node-id="${nodeId}"]`);
    if (!element) continue;

    // Get the outer HTML of this element
    const sliceHtml = element.outerHTML;
    slices.set(nodeId, { html: sliceHtml, nodeId });

    // Get the component name for this slice
    const componentName = sliceNameMap.get(nodeId);
    if (componentName) {
      // Create placeholder element
      const placeholder = doc.createElement(componentName);
      // Copy key attributes for positioning
      const style = element.getAttribute('style');
      const className = element.getAttribute('class');
      if (style) placeholder.setAttribute('style', style);
      if (className) placeholder.setAttribute('className', className);

      // Replace the element with placeholder
      element.parentNode?.replaceChild(placeholder, element);
    }
  }

  // Get the modified HTML
  const layoutHtml = doc.body?.innerHTML || doc.documentElement?.outerHTML || html;

  return { layoutHtml, slices };
}

function stripQueryAndHash(src: string): string {
  return src.split(/[?#]/)[0];
}

function getAssetExtension(src: string): string | null {
  const clean = stripQueryAndHash(src);
  const idx = clean.lastIndexOf('.');
  if (idx <= 0 || idx >= clean.length - 1) return null;
  return clean.slice(idx + 1).toLowerCase();
}

function getAssetBaseName(src: string): string {
  const clean = stripQueryAndHash(src);
  const parts = clean.split(/[\\/]/);
  const file = parts[parts.length - 1] || '';
  const idx = file.lastIndexOf('.');
  return idx > 0 ? file.slice(0, idx) : file;
}

function toPascalCase(input: string): string {
  const parts = String(input || '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  if (!parts.length) return '';
  return parts.map((p) => p[0].toUpperCase() + p.slice(1)).join('');
}

function toCamelCase(prop: string): string {
  if (!prop) return '';
  if (prop.startsWith('--')) return prop;
  return prop.replace(/-([a-z0-9])/gi, (_m, c: string) => c.toUpperCase());
}

/**
 * Convert px value to rem
 */
function convertPxToRem(value: string, options: PxToRemOptions): string {
  const baseFontSize = options.baseFontSize ?? 16;
  const precision = options.precision ?? 4;

  // Match px values including negative numbers and decimals
  return value.replace(/(-?\d*\.?\d+)px\b/g, (_match, num) => {
    const pxValue = parseFloat(num);
    if (pxValue === 0) return '0';
    const remValue = pxValue / baseFontSize;
    // Round to specified precision and remove trailing zeros
    const rounded = parseFloat(remValue.toFixed(precision));
    return `${rounded}rem`;
  });
}

/**
 * Check if a property should be excluded from px→rem conversion
 */
function shouldExcludeProperty(prop: string, excludeList?: string[]): boolean {
  if (!excludeList || excludeList.length === 0) return false;
  const lowerProp = prop.toLowerCase();
  const camelProp = toCamelCase(prop);
  return excludeList.some(ex => {
    const lowerEx = ex.toLowerCase();
    return lowerProp === lowerEx || camelProp === toCamelCase(ex);
  });
}

type StyleParseOptions = {
  pxToRem?: PxToRemOptions;
  assetImportMode?: AssetImportMode;
  assetImports?: Map<string, AssetImport>;
  assetImportRefs?: Set<AssetImport>;
};

type StyleParseResult = {
  styleObj: Record<string, string>;
  /** Style entries that contain asset imports and need special JSX rendering */
  dynamicStyles: Map<string, { template: string; imports: string[] }>;
};

/**
 * Extract url() paths from a CSS value
 */
function extractUrlPaths(value: string): string[] {
  const urls: string[] = [];
  const regex = /url\(\s*['"]?([^'")\s]+)['"]?\s*\)/g;
  let match;
  while ((match = regex.exec(value)) !== null) {
    urls.push(match[1]);
  }
  return urls;
}

/**
 * Process a style value that may contain url() references
 * Returns the processed value and any asset imports needed
 */
function processStyleUrlValue(
  value: string,
  options: StyleParseOptions
): { value: string; dynamicValue?: string; imports: AssetImport[] } {
  const urls = extractUrlPaths(value);
  if (urls.length === 0) {
    return { value, imports: [] };
  }

  const { assetImportMode, assetImports, assetImportRefs } = options;
  if (!assetImportMode || !assetImports) {
    return { value, imports: [] };
  }

  const foundImports: AssetImport[] = [];
  let dynamicValue = value;
  let hasReplacement = false;

  for (const url of urls) {
    if (shouldSkipAssetImport(url)) continue;

    const ext = getAssetExtension(url);
    if (!ext) continue;

    const kind: 'image' | 'svg' = ext === 'svg' ? 'svg' : 'image';
    const kindMode = kind === 'svg' ? (assetImportMode.svg ?? 'none') : (assetImportMode.image ?? 'none');
    if (kindMode === 'none') continue;

    // For background images, we always use URL mode (not component mode)
    let assetImport = assetImports.get(url);
    if (!assetImport) {
      const baseName = getAssetBaseName(url);
      const prefix = kind === 'svg' ? 'Svg' : 'Img';
      const usedNames = new Set(Array.from(assetImports.values()).map((v) => v.localName));
      const localName = ensureUniqueName(buildImportName(baseName, prefix), usedNames);
      assetImport = { kind, localName, importPath: url, useComponent: false };
      assetImports.set(url, assetImport);
    }

    if (assetImportRefs) assetImportRefs.add(assetImport);
    foundImports.push(assetImport);

    // Replace url('path') with url(${importName})
    const urlPattern = new RegExp(`url\\(\\s*['"]?${escapeRegex(url)}['"]?\\s*\\)`, 'g');
    dynamicValue = dynamicValue.replace(urlPattern, `url(\${${assetImport.localName}})`);
    hasReplacement = true;
  }

  return {
    value: hasReplacement ? dynamicValue : value,
    dynamicValue: hasReplacement ? dynamicValue : undefined,
    imports: foundImports,
  };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseStyleToObject(style: string, options: StyleParseOptions = {}): StyleParseResult {
  const styleObj: Record<string, string> = {};
  const dynamicStyles = new Map<string, { template: string; imports: string[] }>();

  const entries = (style || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);

  for (const entry of entries) {
    const idx = entry.indexOf(':');
    if (idx <= 0) continue;
    const rawKey = entry.slice(0, idx).trim();
    let rawVal = entry.slice(idx + 1).trim();
    if (!rawKey) continue;

    // Process url() references in style values
    const urlResult = processStyleUrlValue(rawVal, options);
    rawVal = urlResult.value;

    // Apply px→rem conversion if enabled
    if (options.pxToRem?.enabled && !shouldExcludeProperty(rawKey, options.pxToRem.excludeProperties)) {
      rawVal = convertPxToRem(rawVal, options.pxToRem);
    }

    const key = toCamelCase(rawKey);
    styleObj[key] = rawVal;

    // Track dynamic styles that need template literal rendering
    if (urlResult.dynamicValue) {
      dynamicStyles.set(key, {
        template: rawVal,
        imports: urlResult.imports.map((i) => i.localName),
      });
    }
  }

  return { styleObj, dynamicStyles };
}

function styleObjectToLiteral(
  obj: Record<string, string>,
  dynamicStyles?: Map<string, { template: string; imports: string[] }>
): string {
  const kvs = Object.entries(obj).map(([k, v]) => {
    // Check if this is a dynamic style with template literal
    const dynamic = dynamicStyles?.get(k);
    if (dynamic && dynamic.template.includes('${')) {
      // Use template literal for values containing imports
      return `'${k}': \`${dynamic.template}\``;
    }
    return `'${k}': ${JSON.stringify(v)}`;
  });
  return `{ ${kvs.join(', ')} }`;
}

function styleToObjectLiteral(style: string, options: StyleParseOptions = {}): string {
  const result = parseStyleToObject(style, options);
  return styleObjectToLiteral(result.styleObj, result.dynamicStyles);
}

function indentLines(str: string, level: number): string {
  const pad = ' '.repeat(level);
  return str
    .split('\n')
    .map((line) => (line ? pad + line : pad))
    .join('\n');
}

function escText(text: string): string {
  if (!text) return '';
  return `{${JSON.stringify(text)}}`;
}

function buildImportName(base: string, prefix: string): string {
  const pascal = toPascalCase(base) || 'Asset';
  const name = `${prefix}${pascal}`;
  return /^[A-Za-z_]/.test(name) ? name : `Asset${name}`;
}

function ensureUniqueName(name: string, used: Set<string>): string {
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

function withReactQuery(src: string): string {
  if (/[?&]react(\b|=|&|$)/.test(src)) return src;
  return src.includes('?') ? `${src}&react` : `${src}?react`;
}

function shouldSkipAssetImport(src: string): boolean {
  if (!src) return true;
  const lower = src.toLowerCase();
  if (lower.startsWith('data:')) return true;
  if (lower.startsWith('http:') || lower.startsWith('https:')) return true;
  if (src.startsWith('//')) return true;
  if (src.startsWith('#')) return true;
  if (src.startsWith('/')) return true;
  return false;
}

function resolveAssetImport(src: string, options: ReactifyOptions): AssetImport | null {
  const assetImports = options.assetImports;
  const mode = options.assetImportMode;
  if (!assetImports || !mode) return null;
  if (shouldSkipAssetImport(src)) return null;
  const ext = getAssetExtension(src);
  if (!ext) return null;
  const kind: 'image' | 'svg' = ext === 'svg' ? 'svg' : 'image';
  const kindMode = kind === 'svg' ? (mode.svg ?? 'none') : (mode.image ?? 'none');
  if (kindMode === 'none') return null;

  const existing = assetImports.get(src);
  if (existing) return existing;

  const baseName = getAssetBaseName(src);
  const prefix = kind === 'svg' ? 'Svg' : 'Img';
  const usedNames = new Set(Array.from(assetImports.values()).map((v) => v.localName));
  const localName = ensureUniqueName(buildImportName(baseName, prefix), usedNames);
  const useComponent = kind === 'svg' && (kindMode === 'svgr' || kindMode === 'svgr-query');
  const importPath = useComponent && kindMode === 'svgr-query' ? withReactQuery(src) : src;

  const entry: AssetImport = { kind, localName, importPath, useComponent };
  assetImports.set(src, entry);
  if (options.assetImportRefs) options.assetImportRefs.add(entry);
  return entry;
}

function nodeToJsx(node: any, depth: number, options: ReactifyOptions): string {
  const indent = ' '.repeat(depth);
  if (node.nodeType === 3) {
    const txt = node.textContent ?? '';
    if (!txt.trim()) return '';
    return indent + escText(txt);
  }
  if (node.nodeType !== 1) return '';

  const rawTag = (node.localName || node.tagName || '').toString();
  const tagKey = rawTag.toLowerCase();
  const tagLookup = options.componentTags?.get(tagKey);
  let tagName = tagLookup || rawTag;
  const skipChildren = options.skipChildrenTags?.has(tagKey) || false;
  const isImgTag = tagKey === 'img';
  const srcAttr = isImgTag ? (node.getAttribute('src') ?? '') : '';
  const assetImport = isImgTag ? resolveAssetImport(srcAttr, options) : null;
  if (assetImport && options.assetImportRefs) options.assetImportRefs.add(assetImport);
  const isSvgComponent = !!(assetImport && assetImport.useComponent && assetImport.kind === 'svg');
  if (isSvgComponent) {
    tagName = assetImport!.localName;
  }

  const attrParts: string[] = [];
  for (const attr of node.getAttributeNames()) {
    const attrLower = attr.toLowerCase();
    if (isSvgComponent && (attrLower === 'src' || attrLower === 'alt')) continue;
    let name = attr;
    if (attrLower === 'class') name = 'className';
    else if (attrLower === 'for') name = 'htmlFor';
    else if (attrLower === 'onclick') name = 'onClick';
    const val = node.getAttribute(attr) ?? '';
    if (assetImport && !assetImport.useComponent && attrLower === 'src') {
      attrParts.push(`src={${assetImport.localName}}`);
    } else if (attrLower === 'style') {
      attrParts.push(`style={${styleToObjectLiteral(val, {
        pxToRem: options.pxToRem,
        assetImportMode: options.assetImportMode,
        assetImports: options.assetImports,
        assetImportRefs: options.assetImportRefs,
      })}}`);
    } else {
      attrParts.push(`${name}=${JSON.stringify(val)}`);
    }
  }
  const attrStr = attrParts.length ? ' ' + attrParts.join(' ') : '';
  const children = skipChildren
    ? []
    : Array.from(node.childNodes || [])
        .map((ch: any) => nodeToJsx(ch, depth + (options.indent || 2), options))
        .filter(Boolean);
  const childStr = children.join('\n');

  if (!childStr) {
    const voidish = VOID_ELEMENTS.has(tagName.toLowerCase()) || isSvgComponent;
    const self = `${indent}<${tagName}${attrStr}${voidish ? ' />' : '></' + tagName + '>'}`;
    return self;
  }

  const open = `${indent}<${tagName}${attrStr}>`;
  const close = `${indent}</${tagName}>`;
  return `${open}\n${childStr}\n${close}`;
}

function getRoots(html: string): any[] {
  const parsed = parseHTML(html || '');
  const isFullDoc = /<!doctype\s+html/i.test(html) || /<html[\s>]/i.test(html);
  if (isFullDoc) {
    return Array.from((parsed?.document?.body?.childNodes || []) as any[]);
  }
  const docEl = parsed?.document?.documentElement;
  if (docEl && docEl.tagName !== 'HTML') {
    return [docEl];
  } else if (docEl) {
    return Array.from((parsed?.document?.body?.childNodes || []) as any[]);
  }
  return [];
}

export function htmlFragmentToJsx(html: string, options: ReactifyOptions = {}): string {
  const roots = getRoots(html);
  const children = roots
    .map((n) => nodeToJsx(n, options.indent ?? 2, options))
    .filter(Boolean);
  if (children.length === 1) return children[0];
  const inner = children.join('\n');
  const fragIndent = ' '.repeat(options.indent ?? 2);
  return `${fragIndent}<>\n${inner}\n${fragIndent}</>`;
}

export function parseHtmlForComponent(html: string, options: ReactifyOptions = {}): JsxParseResult {
  const roots = getRoots(html);
  const elementRoots = roots.filter((n) => n.nodeType === 1);

  if (elementRoots.length !== 1) {
    // Multiple or no root elements - wrap in fragment
    const fullJsx = htmlFragmentToJsx(html, options);
    return {
      rootTag: '',
      rootClassName: '',
      rootStyleObj: {},
      rootOtherAttrs: {},
      innerJsx: fullJsx,
      fullJsx,
    };
  }

  const root = elementRoots[0];
  const rootTag = (root.localName || root.tagName || 'div').toString().toLowerCase();
  const rootClassName = root.getAttribute('class') || '';
  const rootStyleStr = root.getAttribute('style') || '';
  const styleParseResult = parseStyleToObject(rootStyleStr, {
    pxToRem: options.pxToRem,
    assetImportMode: options.assetImportMode,
    assetImports: options.assetImports,
    assetImportRefs: options.assetImportRefs,
  });
  const rootStyleObj = styleParseResult.styleObj;

  // Collect other attributes
  const rootOtherAttrs: Record<string, string> = {};
  for (const attr of root.getAttributeNames()) {
    const attrLower = attr.toLowerCase();
    if (attrLower === 'class' || attrLower === 'style') continue;
    rootOtherAttrs[attr] = root.getAttribute(attr) || '';
  }

  // Generate inner JSX (children only)
  const childNodes = Array.from(root.childNodes || []);
  const innerParts = childNodes
    .map((ch: any) => nodeToJsx(ch, options.indent ?? 2, options))
    .filter(Boolean);
  const innerJsx = innerParts.join('\n');

  // Generate full JSX for reference
  const fullJsx = nodeToJsx(root, options.indent ?? 2, options);

  return {
    rootTag,
    rootClassName,
    rootStyleObj,
    rootDynamicStyles: styleParseResult.dynamicStyles.size > 0 ? styleParseResult.dynamicStyles : undefined,
    rootOtherAttrs,
    innerJsx,
    fullJsx,
  };
}

export function buildReactComponentSource(
  componentName: string,
  jsxBody: string,
  cssText: string,
  imports: string[] = [],
  exportDefault: boolean = true
): string {
  const importSet = new Set<string>();
  importSet.add("import React from 'react';");
  imports.filter(Boolean).forEach((imp) => importSet.add(imp));
  const importSection = Array.from(importSet).join('\n');
  const cssLiteral = JSON.stringify(cssText || '');
  const indentedJsx = indentLines(jsxBody, 4);
  const lines = [
    importSection,
    '',
    `export const ${componentName} = () => (`,
    '  <>',
    `    <style dangerouslySetInnerHTML={{ __html: ${cssLiteral} }} />`,
    indentedJsx,
    '  </>',
    ');',
  ];
  if (exportDefault) {
    lines.push('', `export default ${componentName};`);
  }
  return lines.join('\n');
}

export type ComponentBuildOptions = {
  componentName: string;
  parsed: JsxParseResult;
  cssText: string;
  imports?: string[];
  exportDefault?: boolean;
  pxToRem?: PxToRemOptions;
};

export function buildReactComponentWithProps(options: ComponentBuildOptions): string {
  const { componentName, parsed, cssText, imports = [], exportDefault = true } = options;
  const importSet = new Set<string>();
  importSet.add("import React from 'react';");
  imports.filter(Boolean).forEach((imp) => importSet.add(imp));
  const importSection = Array.from(importSet).join('\n');
  const cssLiteral = JSON.stringify(cssText || '');

  // If no single root element, fall back to simple component
  if (!parsed.rootTag) {
    const indentedJsx = indentLines(parsed.innerJsx, 4);
    const lines = [
      importSection,
      '',
      `export const ${componentName} = () => (`,
      '  <>',
      `    <style dangerouslySetInnerHTML={{ __html: ${cssLiteral} }} />`,
      indentedJsx,
      '  </>',
      ');',
    ];
    if (exportDefault) {
      lines.push('', `export default ${componentName};`);
    }
    return lines.join('\n');
  }

  // Build base style object literal (with dynamic styles for background images etc.)
  const baseStyleLiteral = styleObjectToLiteral(parsed.rootStyleObj, parsed.rootDynamicStyles);

  // Build other attrs string
  const otherAttrParts: string[] = [];
  for (const [k, v] of Object.entries(parsed.rootOtherAttrs)) {
    otherAttrParts.push(`${k}=${JSON.stringify(v)}`);
  }
  const otherAttrsStr = otherAttrParts.length ? ' ' + otherAttrParts.join(' ') : '';

  // Indent inner JSX
  const indentedInner = parsed.innerJsx ? '\n' + indentLines(parsed.innerJsx, 6) + '\n    ' : '';

  const lines = [
    importSection,
    '',
    `const baseClassName = ${JSON.stringify(parsed.rootClassName)};`,
    `const baseStyle = ${baseStyleLiteral};`,
    '',
    `export const ${componentName} = ({ className, style, ...props }) => (`,
    `  <${parsed.rootTag}`,
    `    className={className ? \`\${baseClassName} \${className}\` : baseClassName}`,
    `    style={{ ...baseStyle, ...style }}`,
    `    {...props}${otherAttrsStr}`,
    '  >',
    `    <style dangerouslySetInnerHTML={{ __html: ${cssLiteral} }} />${indentedInner}</${parsed.rootTag}>`,
    ');',
  ];

  if (exportDefault) {
    lines.push('', `export default ${componentName};`);
  }
  return lines.join('\n');
}
