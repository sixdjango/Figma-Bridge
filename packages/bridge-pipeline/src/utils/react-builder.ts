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
 * Component import for nested component props
 */
export type ComponentImport = {
  localName: string;
  fromLib: string;
  importWay: 'DEFAULT' | 'NAMED' | string;
};

/**
 * Parsed component prop definition
 * Can be either:
 * 1. Full definition: { type: "ComponentName", fromLib?: ..., props?: ... }
 * 2. Node reference: { nodeId: "xxx", isComponent: true } - rendered from extractedNodes
 */
export type ComponentPropDef = {
  /** Component type/name - optional for nodeId references */
  type?: string;
  /** Node ID for referencing rendered Figma nodes */
  nodeId?: string;
  /** Props to pass to the component */
  props?: Record<string, any>;
  /** Library to import from */
  fromLib?: string;
  /** Import method */
  importWay?: 'DEFAULT' | 'NAMED' | string;
  /** Mark as component reference */
  isComponent?: boolean;
  /** Children to render inside the component */
  children?: ComponentPropDef | ComponentPropDef[] | string;
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
  /** Component props on root element (parsed from data-component-prop-*) */
  rootComponentProps?: Map<string, { propName: string; jsxExpr: string }>;
  innerJsx: string;
  fullJsx: string;
  /** Component imports from component props */
  componentImports?: Map<string, ComponentImport>;
};

type ReactifyOptions = {
  indent?: number;
  componentTags?: Map<string, string>;
  skipChildrenTags?: Set<string>;
  assetImportMode?: AssetImportMode;
  assetImports?: Map<string, AssetImport>;
  assetImportRefs?: Set<AssetImport>;
  pxToRem?: PxToRemOptions;
  /** Collected component imports from component props */
  componentImports?: Map<string, ComponentImport>;
  /** Extracted HTML fragments for consumed nodes (used for component props) */
  extractedNodes?: Map<string, string>;
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
      // Create placeholder element without style/className —
      // the Slice component already has these in its own root element
      const placeholder = doc.createElement(componentName);

      // Replace the element with placeholder
      element.parentNode?.replaceChild(placeholder, element);
    }
  }

  // Get the modified HTML
  const layoutHtml = doc.body?.innerHTML || doc.documentElement?.outerHTML || html;

  return { layoutHtml, slices };
}

/**
 * Result of extracting consumed nodes from HTML
 */
export type ConsumedNodeExtractResult = {
  /** HTML with consumed nodes removed */
  html: string;
  /** Map of nodeId -> extracted outerHTML */
  extractedNodes: Map<string, string>;
};

/**
 * Extract consumed nodes from rendered HTML and clean up custom component children
 *
 * Process order:
 * 1. First extract nodes referenced in component props (consumed nodes)
 * 2. Then clear all children from custom component nodes (they shouldn't have Figma-rendered children)
 *
 * @param html - Full rendered HTML
 * @param consumedNodeIds - Set of node IDs to extract
 * @returns Result with modified HTML and extracted node HTML fragments
 */
export function extractConsumedNodesFromHtml(
  html: string,
  consumedNodeIds: Set<string>
): ConsumedNodeExtractResult {
  const parsed = parseHTML(html || '');
  const doc = parsed.document;
  const extractedNodes = new Map<string, string>();

  // Step 1: Find all custom component nodes (have data-component-type attribute)
  const customComponents = doc.querySelectorAll('[data-component-type]');

  // Step 2: For each custom component, extract any consumed nodes from its children first
  // Also check sibling elements that are logical children (node ID starts with component's node ID + ';')
  // This handles cases where children become siblings (e.g., void elements, or rendering quirks)
  for (const component of customComponents) {
    const componentNodeId = component.getAttribute('data-node-id');

    for (const nodeId of consumedNodeIds) {
      if (extractedNodes.has(nodeId)) continue;

      // Check if this consumed node is inside this component
      const consumedElement = component.querySelector(`[data-node-id="${nodeId}"]`);
      if (consumedElement) {
        // Extract the HTML before clearing children
        extractedNodes.set(nodeId, consumedElement.outerHTML);
        continue;
      }

      // Also check sibling elements that are logical children
      // (their node ID starts with the component's node ID followed by ';')
      if (componentNodeId) {
        const parentEl = component.parentNode;
        if (parentEl) {
          const prefix = componentNodeId + ';';
          // Check if the consumed node ID starts with this component's node ID
          if (nodeId.startsWith(prefix)) {
            const siblingElement = parentEl.querySelector(`[data-node-id="${nodeId}"]`);
            if (siblingElement) {
              extractedNodes.set(nodeId, siblingElement.outerHTML);
            }
          }
        }
      }
    }
  }

  // Step 3: Extract any remaining consumed nodes that are not inside components
  for (const nodeId of consumedNodeIds) {
    if (extractedNodes.has(nodeId)) continue;
    const element = doc.querySelector(`[data-node-id="${nodeId}"]`);
    if (!element) continue;
    extractedNodes.set(nodeId, element.outerHTML);
    // Remove the element from the document
    element.parentNode?.removeChild(element);
  }

  // Step 4: Clear all children from custom component nodes
  // Also remove sibling elements that are logical children (node ID starts with component's node ID + ';')
  // This handles cases where children become siblings (e.g., void elements like <input>, or rendering quirks)
  for (const component of customComponents) {
    const componentNodeId = component.getAttribute('data-node-id');

    // Clear all children
    while (component.firstChild) {
      component.removeChild(component.firstChild);
    }

    // Also find and remove sibling elements that are logical children
    // (their node ID starts with the component's node ID followed by ';')
    if (componentNodeId) {
      const parentEl = component.parentNode;
      if (parentEl) {
        const prefix = componentNodeId + ';';
        // Collect siblings to remove (can't modify while iterating)
        const siblingsToRemove: any[] = [];
        for (const sibling of Array.from(parentEl.childNodes)) {
          if (sibling === component) continue;
          if ((sibling as any).nodeType !== 1) continue; // Skip non-element nodes
          const siblingNodeId = (sibling as any).getAttribute?.('data-node-id');
          if (siblingNodeId && siblingNodeId.startsWith(prefix)) {
            siblingsToRemove.push(sibling);
          }
        }
        // Remove collected siblings
        for (const sibling of siblingsToRemove) {
          parentEl.removeChild(sibling);
        }
      }
    }
  }

  // Get the modified HTML
  const modifiedHtml = doc.body?.innerHTML || doc.documentElement?.outerHTML || html;

  return { html: modifiedHtml, extractedNodes };
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

/**
 * Format an attribute value for JSX output
 * Detects numbers and booleans and renders them as JSX expressions
 * @param name - Attribute name
 * @param val - Attribute value (as string from HTML)
 * @returns JSX attribute string (e.g., 'step={8}' or 'disabled={false}' or 'title="hello"')
 */
function formatJsxAttr(name: string, val: string): string {
  // Check for boolean values
  if (val === 'true') {
    return `${name}={true}`;
  }
  if (val === 'false') {
    return `${name}={false}`;
  }

  // Check for numeric values (integers and floats, including negative)
  // Must be a valid number and not empty
  if (val !== '' && /^-?\d+(\.\d+)?$/.test(val)) {
    const num = parseFloat(val);
    if (!isNaN(num) && isFinite(num)) {
      return `${name}={${val}}`;
    }
  }

  // Default: string value
  return `${name}=${JSON.stringify(val)}`;
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

const COMPONENT_PROP_PREFIX = '__COMPONENT_PROP__:';

/**
 * Parse a component prop from serialized format (base64 encoded)
 */
function parseComponentProp(value: string): ComponentPropDef | null {
  if (!value.startsWith(COMPONENT_PROP_PREFIX)) return null;
  try {
    const base64 = value.slice(COMPONENT_PROP_PREFIX.length);
    // Decode base64 to JSON string
    const json = Buffer.from(base64, 'base64').toString('utf8');
    const parsed = JSON.parse(json);
    // Accept full definition (with type) or nodeId reference (with nodeId and isComponent)
    if (typeof parsed?.type === 'string' ||
        (typeof parsed?.nodeId === 'string' && parsed?.isComponent === true)) {
      return parsed as ComponentPropDef;
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

/**
 * Convert component prop to JSX expression
 * If extractedNodes contains pre-rendered HTML for this node, convert that HTML to JSX
 * Otherwise, build JSX from the component definition
 */
/**
 * Render children to JSX string
 */
function renderChildrenToJsx(
  children: ComponentPropDef | ComponentPropDef[] | string | undefined,
  options: ReactifyOptions
): string {
  if (!children) return '';
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) {
    return children.map((c) => componentPropToJsx(c, options)).join('\n');
  }
  return componentPropToJsx(children, options);
}

/**
 * Check if a value looks like a component definition
 * Supports both full definitions ({ type, fromLib, ... }) and nodeId references ({ nodeId, isComponent: true })
 */
function isComponentDef(val: any): val is ComponentPropDef {
  if (!val || typeof val !== 'object') return false;
  // Case 1: Node reference with nodeId and isComponent flag
  if (typeof val.nodeId === 'string' && val.isComponent === true) return true;
  // Case 2: Full component definition with type
  return typeof val.type === 'string' && (val.isComponent || val.nodeId || val.fromLib);
}

/**
 * Recursively clear children from custom components only.
 * Pure HTML elements keep their children, but nested custom components have children cleared.
 * Custom components are identified by having 'data-component-type' attribute.
 */
function clearCustomComponentChildrenRecursive(element: any): void {
  if (!element || element.nodeType !== 1) return;

  // Check if this element is a custom component
  const isCustomComponent = element.getAttribute && element.getAttribute('data-component-type');

  if (isCustomComponent) {
    // Clear all children from custom components
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  } else {
    // For pure HTML elements, recursively process children
    const children = Array.from(element.childNodes || []);
    for (const child of children) {
      clearCustomComponentChildrenRecursive(child);
    }
  }
}

function componentPropToJsx(comp: ComponentPropDef, options: ReactifyOptions): string {
  const componentName = comp.type;

  // Case: nodeId reference without type - render the extracted HTML
  // This handles { nodeId: "xxx", isComponent: true } format
  // The node may be a pure HTML element or a custom component
  if (!componentName && comp.nodeId && options.extractedNodes) {
    const extractedHtml = options.extractedNodes.get(comp.nodeId);
    if (extractedHtml) {
      // Parse the extracted HTML fragment and convert to JSX
      const roots = getRoots(extractedHtml);
      const rootEl = roots.find((n: any) => n.nodeType === 1);
      if (rootEl) {
        // Recursively clear children from custom components only
        // Pure HTML elements keep their children, but nested custom components have children cleared
        clearCustomComponentChildrenRecursive(rootEl);
        // Convert to JSX
        return nodeToJsx(rootEl, 0, options).trim();
      }
    }
    // Fallback: render a comment indicating the missing node
    return `{/* Missing node: ${comp.nodeId} */}`;
  }

  // Register component import only if fromLib is provided
  if (comp.fromLib && componentName && options.componentImports) {
    const importKey = `${comp.fromLib}:${componentName}`;
    if (!options.componentImports.has(importKey)) {
      options.componentImports.set(importKey, {
        localName: componentName,
        fromLib: comp.fromLib,
        importWay: comp.importWay || 'NAMED',
      });
    }
  }

  // Collect children from both comp.children and comp.props.children
  let childrenSource: ComponentPropDef | ComponentPropDef[] | string | undefined = comp.children;
  if (!childrenSource && comp.props?.children) {
    const propsChildren = comp.props.children;
    // Check if props.children is component(s)
    if (Array.isArray(propsChildren) && propsChildren.length > 0 && isComponentDef(propsChildren[0])) {
      childrenSource = propsChildren as ComponentPropDef[];
    } else if (isComponentDef(propsChildren)) {
      childrenSource = propsChildren as ComponentPropDef;
    } else if (typeof propsChildren === 'string') {
      childrenSource = propsChildren;
    }
  }

  // Render children if provided
  const childrenJsx = renderChildrenToJsx(childrenSource, options);

  // If we have pre-rendered HTML for this node, convert it to JSX
  if (comp.nodeId && options.extractedNodes) {
    const extractedHtml = options.extractedNodes.get(comp.nodeId);
    if (extractedHtml) {
      // Parse the extracted HTML fragment using getRoots which handles linkedom quirks
      const roots = getRoots(extractedHtml);
      const rootEl = roots.find((n: any) => n.nodeType === 1);
      if (rootEl && (rootEl as any).tagName) {
        // Add component lib attributes to the element only if fromLib is provided
        if (comp.fromLib) {
          (rootEl as any).setAttribute('data-component-lib', comp.fromLib);
          (rootEl as any).setAttribute('data-import-way', comp.importWay || 'NAMED');
        }

        // Clear children - component props should not have Figma-rendered children
        // The component will render its own content based on props
        while ((rootEl as any).firstChild) {
          (rootEl as any).removeChild((rootEl as any).firstChild);
        }

        // Merge component props into the element (component props take precedence)
        if (comp.props && typeof comp.props === 'object') {
          for (const [key, val] of Object.entries(comp.props)) {
            // Skip children - handled separately as JSX children
            if (key === 'children') continue;
            if (key === 'style' && val && typeof val === 'object') {
              // Merge styles: parse existing style, merge with component props style (higher priority)
              const existingStyle = (rootEl as any).getAttribute('style') || '';
              const existingStyleObj = parseStyleToObject(existingStyle).styleObj;
              // Component props style entries (convert to CSS format for merging)
              for (const [styleKey, styleVal] of Object.entries(val as Record<string, any>)) {
                const cssKey = styleKey.replace(/([A-Z])/g, '-$1').toLowerCase();
                const cssVal = typeof styleVal === 'number' ? `${styleVal}px` : String(styleVal);
                existingStyleObj[toCamelCase(cssKey)] = cssVal;
              }
              // Rebuild style attribute
              const mergedStyle = Object.entries(existingStyleObj)
                .map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}:${v}`)
                .join(';');
              (rootEl as any).setAttribute('style', mergedStyle);
            } else if (key === 'className' && typeof val === 'string') {
              // Merge className: append component props className
              const existingClass = (rootEl as any).getAttribute('class') || '';
              const mergedClass = existingClass ? `${existingClass} ${val}` : val;
              (rootEl as any).setAttribute('class', mergedClass);
            } else if (typeof val === 'string') {
              (rootEl as any).setAttribute(key, val);
            } else if (typeof val === 'number' || typeof val === 'boolean') {
              (rootEl as any).setAttribute(key, String(val));
            } else if (val && typeof val === 'object') {
              // For object props (like nested components), serialize as data attribute
              // These will be handled by the JSX conversion
              (rootEl as any).setAttribute(`data-prop-${key}`, JSON.stringify(val));
            }
          }
        }

        // Convert to JSX string
        let jsx = nodeToJsx(rootEl, 0, options).trim();
        // Replace the original tag name with the component name
        const originalTag = (rootEl as any).tagName.toLowerCase();

        // Find the position of the closing tag or self-closing
        // We need to handle JSX expressions in attributes that may contain '>'
        const selfClosingMatch = jsx.match(new RegExp(`^(<${originalTag}[\\s\\S]*?)\\s*/>$`, 'i'));
        const emptyTagMatch = jsx.match(new RegExp(`^(<${originalTag}[\\s\\S]*?>)\\s*</${originalTag}>$`, 'i'));

        if (selfClosingMatch) {
          // Self-closing tag: <div ... /> -> <ComponentName ...>children</ComponentName> or <ComponentName ... />
          const openingPart = selfClosingMatch[1].replace(new RegExp(`^<${originalTag}`, 'i'), `<${componentName}`);
          if (childrenJsx) {
            jsx = `${openingPart}>${childrenJsx}</${componentName}>`;
          } else {
            jsx = `${openingPart} />`;
          }
        } else if (emptyTagMatch) {
          // Empty non-self-closing tag: <div ...></div> -> <ComponentName ...>children</ComponentName>
          const openingPart = emptyTagMatch[1].replace(new RegExp(`^<${originalTag}`, 'i'), `<${componentName}`);
          if (childrenJsx) {
            jsx = `${openingPart}${childrenJsx}</${componentName}>`;
          } else {
            jsx = `${openingPart}</${componentName}>`;
          }
        } else {
          // Has existing children - just replace tag names
          jsx = jsx.replace(new RegExp(`^<${originalTag}`, 'i'), `<${componentName}`);
          jsx = jsx.replace(new RegExp(`</${originalTag}>$`, 'i'), `</${componentName}>`);
          // If we have additional children to add, insert before closing tag
          if (childrenJsx) {
            jsx = jsx.replace(new RegExp(`</${componentName}>$`), `${childrenJsx}</${componentName}>`);
          }
        }

        return jsx;
      }
    }
  }

  // Fallback: Build props string from component definition
  // This handles both isComponent=true without nodeId, and legacy cases
  const propParts: string[] = [];
  if (comp.props && typeof comp.props === 'object') {
    for (const [key, val] of Object.entries(comp.props)) {
      // Skip children - handled separately as JSX children
      if (key === 'children') continue;
      if (key === 'style' && val && typeof val === 'object') {
        // Convert style object to JSX style
        const styleEntries = Object.entries(val).map(([k, v]) => {
          const camelKey = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          return `${camelKey}: ${JSON.stringify(v)}`;
        });
        propParts.push(`style={{ ${styleEntries.join(', ')} }}`);
      } else if (key === 'className') {
        propParts.push(`className=${JSON.stringify(val)}`);
      } else if (typeof val === 'string') {
        propParts.push(`${key}=${JSON.stringify(val)}`);
      } else if (typeof val === 'number' || typeof val === 'boolean') {
        propParts.push(`${key}={${val}}`);
      } else if (val !== null && val !== undefined) {
        propParts.push(`${key}={${JSON.stringify(val)}}`);
      }
    }
  }

  const propsStr = propParts.length ? ' ' + propParts.join(' ') : '';

  // Include data-component-lib and data-import-way for jsx-parser only if fromLib is provided
  const dataAttrs = comp.fromLib
    ? ` data-component-lib="${comp.fromLib}" data-import-way="${comp.importWay || 'NAMED'}"`
    : '';

  // If has children, render as open/close tags
  if (childrenJsx) {
    return `<${componentName}${dataAttrs}${propsStr}>${childrenJsx}</${componentName}>`;
  }

  return `<${componentName}${dataAttrs}${propsStr} />`;
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

  // Skip head and body tags - they shouldn't appear in component JSX
  if (tagKey === 'head' || tagKey === 'body') {
    // Process children directly without the wrapper tag
    const children = Array.from(node.childNodes || [])
      .map((ch: any) => nodeToJsx(ch, depth, options))
      .filter(Boolean);
    return children.join('\n');
  }
  const tagLookup = options.componentTags?.get(tagKey);
  // Use data-component-name if available (preserves names with dots like List.Item)
  const componentName = node.getAttribute('data-component-name');
  let tagName = componentName || tagLookup || rawTag;
  const skipChildren = options.skipChildrenTags?.has(tagKey) || false;
  const isImgTag = tagKey === 'img';
  const srcAttr = isImgTag ? (node.getAttribute('src') ?? '') : '';
  const assetImport = isImgTag ? resolveAssetImport(srcAttr, options) : null;
  if (assetImport && options.assetImportRefs) options.assetImportRefs.add(assetImport);
  const isSvgComponent = !!(assetImport && assetImport.useComponent && assetImport.kind === 'svg');
  if (isSvgComponent) {
    tagName = assetImport!.localName;
  }

  // Check for direct custom component (has data-component-lib attribute)
  const componentLib = node.getAttribute('data-component-lib');
  const importWay = node.getAttribute('data-import-way') || 'NAMED';
  if (componentLib && options.componentImports) {
    const importKey = `${componentLib}:${tagName}`;
    if (!options.componentImports.has(importKey)) {
      options.componentImports.set(importKey, {
        localName: tagName,
        fromLib: componentLib,
        importWay: importWay,
      });
    }
  }

  // Check for image-id attribute (for Image components with imageId)
  const imageId = node.getAttribute('data-image-id');
  let imageAssetImport: AssetImport | null = null;
  if (imageId && options.assetImports && options.assetImportMode?.image !== 'none') {
    // Create or get asset import for this image
    const importPath = `../assets/${imageId}.png`;
    imageAssetImport = options.assetImports.get(importPath) ?? null;
    if (!imageAssetImport) {
      const usedNames = new Set(Array.from(options.assetImports.values()).map((v) => v.localName));
      const localName = ensureUniqueName(buildImportName(imageId, 'Img'), usedNames);
      imageAssetImport = { kind: 'image', localName, importPath, useComponent: false };
      options.assetImports.set(importPath, imageAssetImport);
    }
    if (options.assetImportRefs) options.assetImportRefs.add(imageAssetImport);
  }

  const attrParts: string[] = [];
  for (const attr of node.getAttributeNames()) {
    const attrLower = attr.toLowerCase();
    if (isSvgComponent && (attrLower === 'src' || attrLower === 'alt')) continue;

    // Skip internal data attributes
    if (attrLower === 'data-component-type') continue;
    if (attrLower === 'data-component-name') continue;
    if (attrLower === 'data-image-id') continue;

    // Skip children attribute - handled as JSX children, not as a prop
    if (attrLower === 'children') continue;

    // Handle component prop attributes (data-component-prop-*)
    if (attrLower.startsWith('data-component-prop-')) {
      const propName = attr.slice('data-component-prop-'.length);
      const val = node.getAttribute(attr) ?? '';
      const compProp = parseComponentProp(val);
      if (compProp) {
        const jsxExpr = componentPropToJsx(compProp, options);
        attrParts.push(`${propName}={${jsxExpr}}`);
      }
      continue;
    }

    let name = attr;
    if (attrLower === 'class') name = 'className';
    else if (attrLower === 'for') name = 'htmlFor';
    else if (attrLower === 'onclick') name = 'onClick';
    const val = node.getAttribute(attr) ?? '';

    // Handle src attribute - use image import reference if available
    if (attrLower === 'src') {
      if (imageAssetImport) {
        // For Image components with imageId, use the image asset import
        attrParts.push(`src={${imageAssetImport.localName}}`);
      } else if (assetImport && !assetImport.useComponent) {
        // For regular img tags with asset imports
        attrParts.push(`src={${assetImport.localName}}`);
      } else {
        attrParts.push(formatJsxAttr(name, val));
      }
    } else if (attrLower === 'style') {
      attrParts.push(`style={${styleToObjectLiteral(val, {
        pxToRem: options.pxToRem,
        assetImportMode: options.assetImportMode,
        assetImports: options.assetImports,
        assetImportRefs: options.assetImportRefs,
      })}}`);
    } else {
      attrParts.push(formatJsxAttr(name, val));
    }
  }
  const attrStr = attrParts.length ? ' ' + attrParts.join(' ') : '';

  // Collect children from DOM nodes
  const domChildren = skipChildren
    ? []
    : Array.from(node.childNodes || [])
        .map((ch: any) => nodeToJsx(ch, depth + (options.indent || 2), options))
        .filter(Boolean);

  // Check for component children defined in the 'children' attribute
  let componentChildrenJsx = '';
  const childrenAttr = node.getAttribute('children');
  if (childrenAttr) {
    try {
      const parsed = JSON.parse(childrenAttr);
      if (Array.isArray(parsed)) {
        // Array of component definitions (including nodeId references)
        const childJsxParts = parsed
          .filter((c: any) => isComponentDef(c))
          .map((c: any) => componentPropToJsx(c as ComponentPropDef, options));
        componentChildrenJsx = childJsxParts.join('\n');
      } else if (isComponentDef(parsed)) {
        // Single component definition (including nodeId reference)
        componentChildrenJsx = componentPropToJsx(parsed as ComponentPropDef, options);
      }
    } catch {
      // Not valid JSON, treat as string children
      componentChildrenJsx = childrenAttr;
    }
  }

  // Combine DOM children and component children
  const allChildren = [...domChildren];
  if (componentChildrenJsx) {
    allChildren.push(componentChildrenJsx);
  }
  const childStr = allChildren.join('\n');

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
  // Initialize component imports map for tracking nested component props
  const componentImports = options.componentImports || new Map<string, ComponentImport>();
  const optionsWithImports: ReactifyOptions = { ...options, componentImports };

  const roots = getRoots(html);
  const elementRoots = roots.filter((n) => n.nodeType === 1);

  if (elementRoots.length !== 1) {
    // Multiple or no root elements - wrap in fragment
    const fullJsx = htmlFragmentToJsx(html, optionsWithImports);
    return {
      rootTag: '',
      rootClassName: '',
      rootStyleObj: {},
      rootOtherAttrs: {},
      innerJsx: fullJsx,
      fullJsx,
      componentImports: componentImports.size > 0 ? componentImports : undefined,
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

  // Collect other attributes and process component props
  const rootOtherAttrs: Record<string, string> = {};
  const rootComponentProps = new Map<string, { propName: string; jsxExpr: string }>();
  for (const attr of root.getAttributeNames()) {
    const attrLower = attr.toLowerCase();
    if (attrLower === 'class' || attrLower === 'style') continue;
    // Skip internal data- attributes (keep data-node-id for debugging)
    if (attrLower === 'data-component-type' || attrLower === 'data-component-lib' ||
        attrLower === 'data-import-way') continue;

    // Handle component prop attributes
    if (attrLower.startsWith('data-component-prop-')) {
      const propName = attr.slice('data-component-prop-'.length);
      const val = root.getAttribute(attr) || '';
      const compProp = parseComponentProp(val);
      if (compProp) {
        const jsxExpr = componentPropToJsx(compProp, optionsWithImports);
        rootComponentProps.set(propName, { propName, jsxExpr });
      }
      continue;
    }

    rootOtherAttrs[attr] = root.getAttribute(attr) || '';
  }

  // Generate inner JSX (children only)
  const childNodes = Array.from(root.childNodes || []);
  const innerParts = childNodes
    .map((ch: any) => nodeToJsx(ch, optionsWithImports.indent ?? 2, optionsWithImports))
    .filter(Boolean);
  const innerJsx = innerParts.join('\n');

  // Generate full JSX for reference
  const fullJsx = nodeToJsx(root, optionsWithImports.indent ?? 2, optionsWithImports);

  return {
    rootTag,
    rootClassName,
    rootStyleObj,
    rootDynamicStyles: styleParseResult.dynamicStyles.size > 0 ? styleParseResult.dynamicStyles : undefined,
    rootOtherAttrs,
    rootComponentProps: rootComponentProps.size > 0 ? rootComponentProps : undefined,
    innerJsx,
    fullJsx,
    componentImports: componentImports.size > 0 ? componentImports : undefined,
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

/**
 * Build import lines from component imports
 */
export function buildComponentImportLines(componentImports?: Map<string, ComponentImport>): string[] {
  if (!componentImports || componentImports.size === 0) return [];

  // Group imports by library
  const byLib = new Map<string, ComponentImport[]>();
  for (const imp of componentImports.values()) {
    const list = byLib.get(imp.fromLib) || [];
    list.push(imp);
    byLib.set(imp.fromLib, list);
  }

  const lines: string[] = [];
  for (const [lib, imps] of byLib) {
    // Separate default and named imports
    const defaultImports = imps.filter((i) => i.importWay === 'DEFAULT');
    const namedImports = imps.filter((i) => i.importWay !== 'DEFAULT');

    if (defaultImports.length > 0 && namedImports.length > 0) {
      // Both default and named
      const defaultName = defaultImports[0].localName;
      const namedNames = namedImports.map((i) => i.localName).join(', ');
      lines.push(`import ${defaultName}, { ${namedNames} } from '${lib}';`);
    } else if (defaultImports.length > 0) {
      // Only default
      lines.push(`import ${defaultImports[0].localName} from '${lib}';`);
    } else if (namedImports.length > 0) {
      // Only named
      const namedNames = namedImports.map((i) => i.localName).join(', ');
      lines.push(`import { ${namedNames} } from '${lib}';`);
    }
  }

  return lines;
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

  // Add component imports from component props
  const componentImportLines = buildComponentImportLines(parsed.componentImports);
  componentImportLines.forEach((imp) => importSet.add(imp));

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

  // Build other attrs string (including component props)
  const otherAttrParts: string[] = [];
  for (const [k, v] of Object.entries(parsed.rootOtherAttrs)) {
    otherAttrParts.push(`${k}=${JSON.stringify(v)}`);
  }
  // Add component props (e.g., leftIcon={<LeftCircleOutlined />})
  if (parsed.rootComponentProps) {
    for (const [, { propName, jsxExpr }] of parsed.rootComponentProps) {
      otherAttrParts.push(`${propName}={${jsxExpr}}`);
    }
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
