import { normalizeComposition } from '../utils/normalize';
import { compositionToIR } from '../pipeline/ir';
import { createContentAssets } from '../pipeline/html';
import { applyAssetUrlProvider, type AssetUrlProvider } from '../utils/asset-mapper';
import {
  parseHtmlForComponent,
  buildReactComponentWithProps,
  splitHtmlByNodeIds,
  extractConsumedNodesFromHtml,
  type AssetImport,
  type AssetImportMode,
  type PxToRemOptions,
} from '../utils/react-builder';
import type { CustomComponentDef, Rect } from '../pipeline/types';

type SliceInput = { components?: CustomComponentDef[]; figmaJson?: any; name?: string };
type SplitCompositionInput = { layout: SliceInput; slices?: SliceInput[] };

export type FigmaToReactOptions = {
  assetUrlProvider?: AssetUrlProvider;
  assetImportMode?: AssetImportMode;
  /**
   * Optional px to rem conversion for inline styles
   * When enabled, converts px values to rem in style attributes
   */
  pxToRem?: PxToRemOptions;
};

export type ReactComponentFile = {
  name: string;
  fileName: string;
  code: string;
  jsx: string;
  cssText: string;
  baseWidth: number;
  baseHeight: number;
  renderUnion: Rect;
  assetImports?: AssetImport[];
};

export type FigmaToReactResult = {
  layout: ReactComponentFile;
  slices: ReactComponentFile[];
  assets: { images: string[]; svgs: string[] };
  assetImports?: AssetImport[];
};

function sanitizeComponentName(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  const cleaned = raw
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');
  if (!cleaned) return fallback;
  return /^[A-Z]/.test(cleaned) ? cleaned : `C${cleaned}`;
}

function buildComponentTagMap(components?: CustomComponentDef[]): Map<string, string> {
  const map = new Map<string, string>();
  if (!Array.isArray(components)) return map;
  components.forEach((c) => {
    if (c?.type) {
      const safeName = sanitizeComponentName(String(c.type), String(c.type));
      map.set(String(c.type).toLowerCase(), safeName);
    }
  });
  return map;
}

function buildAssetImportLines(assetImports?: AssetImport[]): string[] {
  if (!assetImports || assetImports.length === 0) return [];
  const entries = [...assetImports];
  entries.sort((a, b) => a.importPath.localeCompare(b.importPath));
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const line = entry.useComponent
      ? `import { ReactComponent as ${entry.localName} } from '${entry.importPath}';`
      : `import ${entry.localName} from '${entry.importPath}';`;
    if (seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
  }
  return lines;
}

function resolveInput(
  input: { composition?: any; components?: CustomComponentDef[] } | SplitCompositionInput
): { layout: SliceInput; slices: SliceInput[]; isSplit: boolean } {
  if (input && typeof input === 'object' && ('layout' in input || 'slices' in input)) {
    const layout = (input as SplitCompositionInput).layout;
    if (!layout || typeof layout !== 'object' || !layout.figmaJson) throw new Error('figmaToReact: layout.figmaJson required');
    const slices = Array.isArray((input as SplitCompositionInput).slices) ? (input as SplitCompositionInput).slices! : [];
    return { layout, slices, isSplit: true };
  }
  const legacy = input as any;
  if (legacy?.composition) {
    return { layout: { figmaJson: legacy.composition, components: legacy.components }, slices: [], isSplit: false };
  }
  throw new Error('figmaToReact: composition required');
}

async function buildReactComponent(
  composition: any,
  components: CustomComponentDef[] | undefined,
  componentName: string,
  options: FigmaToReactOptions,
  additionalImports: string[] = [],
  assetImportMap?: Map<string, AssetImport>
): Promise<ReactComponentFile & { assets: { images: string[]; svgs: string[] } }> {
  normalizeComposition(composition);
  const ir = compositionToIR(composition, { customComponents: components });

  const content = await createContentAssets({
    composition,
    irNodes: ir.nodes,
    cssRules: ir.cssRules,
    renderUnion: ir.renderUnion,
    debugEnabled: false,
  });

  const mapped = applyAssetUrlProvider(content.bodyHtml, content.cssText, ir.nodes, options.assetUrlProvider);

  // Extract consumed nodes from HTML (nodes used as component props)
  // These will be passed as JSX props instead of being in the main HTML tree
  const rawHtml = mapped.htmlFragment || mapped.html;
  const { html: htmlWithoutConsumed, extractedNodes } = ir.consumedNodeIds
    ? extractConsumedNodesFromHtml(rawHtml, ir.consumedNodeIds)
    : { html: rawHtml, extractedNodes: new Map<string, string>() };

  const componentTags = buildComponentTagMap(components);
  const skipChildrenTags = new Set(componentTags.keys());
  const localAssetImports = assetImportMap ?? (options.assetImportMode ? new Map<string, AssetImport>() : undefined);
  const assetImportRefs = localAssetImports ? new Set<AssetImport>() : undefined;

  // Parse HTML and extract root element info for props merging
  const parsed = parseHtmlForComponent(htmlWithoutConsumed, {
    componentTags,
    skipChildrenTags,
    assetImportMode: options.assetImportMode,
    assetImports: localAssetImports,
    assetImportRefs,
    pxToRem: options.pxToRem,
    extractedNodes,
  });

  const usedAssetImports = assetImportRefs ? Array.from(assetImportRefs) : [];
  const assetImportLines = buildAssetImportLines(usedAssetImports);

  // Build component with props support
  const code = buildReactComponentWithProps({
    componentName,
    parsed,
    cssText: mapped.cssText,
    imports: [...additionalImports, ...assetImportLines],
    exportDefault: true,
  });

  const jsx = parsed.fullJsx;
  const assets = { images: ir.assetMeta.images || [], svgs: ir.assetMeta.svgs || [] };

  return {
    name: componentName,
    fileName: `${componentName}.jsx`,
    code,
    jsx,
    cssText: mapped.cssText,
    baseWidth: content.baseWidth,
    baseHeight: content.baseHeight,
    renderUnion: ir.renderUnion,
    assets,
    assetImports: usedAssetImports,
  };
}

/**
 * Extract slice definitions from components array
 * Returns map of nodeId -> sliceName
 */
function extractSliceDefinitions(
  components: CustomComponentDef[] | undefined
): Map<string, { nodeId: string; name: string; def: CustomComponentDef }> {
  const sliceMap = new Map<string, { nodeId: string; name: string; def: CustomComponentDef }>();
  if (!Array.isArray(components)) return sliceMap;

  components.forEach((c, i) => {
    if (String(c.componentType || '').toUpperCase() === 'SLICE' && c.nodeId) {
      const name = sanitizeComponentName(c.type, `Slice${i + 1}`);
      sliceMap.set(c.nodeId, { nodeId: c.nodeId, name, def: c });
    }
  });

  return sliceMap;
}

/**
 * Build import statements for slices by name
 */
function buildSliceImportsByName(sliceNames: string[]): string[] {
  return sliceNames.map((name) => `import ${name} from './${name}';`);
}

export async function figmaToReact(
  input: { composition?: any; components?: CustomComponentDef[] } | SplitCompositionInput,
  options: FigmaToReactOptions = {}
): Promise<FigmaToReactResult> {
  const { layout } = resolveInput(input as any);
  const sharedAssetImports = options.assetImportMode ? new Map<string, AssetImport>() : undefined;

  // Extract slice definitions from layout components
  const sliceDefinitions = extractSliceDefinitions(layout.components);
  const sliceNodeIds = Array.from(sliceDefinitions.keys());
  const sliceNames = Array.from(sliceDefinitions.values()).map((s) => s.name);

  // Build nodeId -> sliceName map for HTML splitting
  const sliceNameMap = new Map<string, string>();
  sliceDefinitions.forEach((info, nodeId) => {
    sliceNameMap.set(nodeId, info.name);
  });

  // STEP 1: Generate FULL layout HTML (without slice component replacement)
  // This renders all content including slice areas as regular HTML
  normalizeComposition(layout.figmaJson);

  // For full layout generation, exclude slice component definitions
  // so the slice content is rendered as regular HTML elements
  const nonSliceComponents = (layout.components || []).filter(
    (c) => String(c.componentType || '').toUpperCase() !== 'SLICE'
  );

  const ir = compositionToIR(layout.figmaJson, { customComponents: nonSliceComponents });
  const content = await createContentAssets({
    composition: layout.figmaJson,
    irNodes: ir.nodes,
    cssRules: ir.cssRules,
    renderUnion: ir.renderUnion,
    debugEnabled: false,
  });

  const mapped = applyAssetUrlProvider(content.bodyHtml, content.cssText, ir.nodes, options.assetUrlProvider);
  const rawFullHtml = mapped.htmlFragment || mapped.html;
  const fullCss = mapped.cssText;

  // Extract consumed nodes from HTML (nodes used as component props)
  const { html: fullHtml, extractedNodes } = ir.consumedNodeIds
    ? extractConsumedNodesFromHtml(rawFullHtml, ir.consumedNodeIds)
    : { html: rawFullHtml, extractedNodes: new Map<string, string>() };

  // STEP 2: Split HTML by slice node IDs
  const splitResult = splitHtmlByNodeIds(fullHtml, sliceNodeIds, sliceNameMap);

  // STEP 3: Build slice components from extracted HTML
  const sliceOutputs: ReactComponentFile[] = [];
  // Shared asset import map for deduplication, but track refs separately per component
  const globalAssetImports = sharedAssetImports ?? (options.assetImportMode ? new Map<string, AssetImport>() : undefined);

  for (const [nodeId, sliceInfo] of splitResult.slices) {
    const sliceDef = sliceDefinitions.get(nodeId);
    if (!sliceDef) continue;

    const componentTags = buildComponentTagMap(nonSliceComponents);
    const skipChildrenTags = new Set(componentTags.keys());

    // Create separate refs set for this slice to track only its imports
    const sliceAssetRefs = globalAssetImports ? new Set<AssetImport>() : undefined;

    // Parse slice HTML
    const parsed = parseHtmlForComponent(sliceInfo.html, {
      componentTags,
      skipChildrenTags,
      assetImportMode: options.assetImportMode,
      assetImports: globalAssetImports,
      assetImportRefs: sliceAssetRefs,
      pxToRem: options.pxToRem,
      extractedNodes,
    });

    // Only include imports actually used in this slice
    const sliceUsedImports = sliceAssetRefs ? Array.from(sliceAssetRefs) : [];
    const assetImportLines = buildAssetImportLines(sliceUsedImports);

    // Build slice component - slices share the layout's CSS
    const code = buildReactComponentWithProps({
      componentName: sliceDef.name,
      parsed,
      cssText: fullCss, // Share the full CSS with each slice
      imports: assetImportLines,
      exportDefault: true,
    });

    sliceOutputs.push({
      name: sliceDef.name,
      fileName: `${sliceDef.name}.jsx`,
      code,
      jsx: parsed.fullJsx,
      cssText: fullCss,
      baseWidth: content.baseWidth,
      baseHeight: content.baseHeight,
      renderUnion: ir.renderUnion,
      assetImports: sliceUsedImports,
    });
  }

  // STEP 4: Build layout component from modified HTML (with slice placeholders)
  const sliceImports = buildSliceImportsByName(sliceNames);
  const layoutComponentTags = buildComponentTagMap(nonSliceComponents);

  // Add slice names to component tags for JSX conversion
  sliceNames.forEach((name) => {
    layoutComponentTags.set(name.toLowerCase(), name);
  });

  // Create separate refs set for layout to track only its imports
  const layoutAssetRefs = globalAssetImports ? new Set<AssetImport>() : undefined;

  const layoutParsed = parseHtmlForComponent(splitResult.layoutHtml, {
    componentTags: layoutComponentTags,
    skipChildrenTags: new Set(sliceNames.map((n) => n.toLowerCase())),
    assetImportMode: options.assetImportMode,
    assetImports: globalAssetImports,
    assetImportRefs: layoutAssetRefs,
    pxToRem: options.pxToRem,
    extractedNodes,
  });

  // Only include imports actually used in layout (not slice imports)
  const layoutUsedImports = layoutAssetRefs ? Array.from(layoutAssetRefs) : [];
  const layoutAssetImportLines = buildAssetImportLines(layoutUsedImports);

  const layoutCode = buildReactComponentWithProps({
    componentName: 'Layout',
    parsed: layoutParsed,
    cssText: fullCss,
    imports: [...sliceImports, ...layoutAssetImportLines],
    exportDefault: true,
  });

  const layoutResult: ReactComponentFile = {
    name: 'Layout',
    fileName: 'Layout.jsx',
    code: layoutCode,
    jsx: layoutParsed.fullJsx,
    cssText: fullCss,
    baseWidth: content.baseWidth,
    baseHeight: content.baseHeight,
    renderUnion: ir.renderUnion,
    assetImports: layoutUsedImports,
  };

  // Collect all assets
  const allAssetImports = sharedAssetImports ? Array.from(sharedAssetImports.values()) : undefined;
  return {
    layout: layoutResult,
    slices: sliceOutputs,
    assets: { images: ir.assetMeta.images || [], svgs: ir.assetMeta.svgs || [] },
    assetImports: allAssetImports,
  };
}
