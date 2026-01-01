import { normalizeComposition } from '../utils/normalize';
import { compositionToIR } from '../pipeline/ir';
import { createPreviewAssets, createContentAssets } from '../pipeline/html';
import { buildReactComponentAsset, collectCustomComponentImports } from '../pipeline/react';
import type { CustomComponentDef, ReactBuildResult, RenderNodeIR, Rect, ReactComponentAsset, ReactImport } from '../pipeline/types';

export type AssetType = 'image' | 'svg';
export type AssetUrlProvider = (id: string, type: AssetType, data?: string) => string;

export type FigmaToHtmlOptions = {
  assetUrlProvider?: AssetUrlProvider;
  debugEnabled?: boolean;
};

type SliceInput = { components?: CustomComponentDef[]; figmaJson?: any };
type SplitCompositionInput = { layout: SliceInput; slices?: SliceInput[] };

function resolveInput(
  input: { composition?: any; components?: CustomComponentDef[] } | SplitCompositionInput | null | undefined
): { composition: any; components?: CustomComponentDef[]; layout?: SliceInput; slices?: SliceInput[] } {
  if (input && typeof input === 'object') {
    // Split layout/slices format
    if ('layout' in input || 'slices' in input) {
      const layout = (input as SplitCompositionInput).layout;
      if (!layout || typeof layout !== 'object' || !layout.figmaJson) throw new Error('figmaToHtml: layout.figmaJson required');
      const compList: CustomComponentDef[] = [];
      if (Array.isArray(layout.components)) compList.push(...layout.components);
      if (Array.isArray((input as SplitCompositionInput).slices)) {
        for (const slice of (input as SplitCompositionInput).slices!) {
          if (slice && Array.isArray(slice.components)) compList.push(...slice.components);
        }
      }
      return { composition: layout.figmaJson, components: compList, layout, slices: (input as SplitCompositionInput).slices || [] };
    }
    // Legacy shape: { composition, components? }
    if ('composition' in input) {
      return { composition: (input as any).composition, components: Array.isArray((input as any).components) ? (input as any).components : undefined };
    }
  }
  throw new Error('figmaToHtml: composition required');
}

function sanitizeComponentName(raw: string | undefined, fallback: string): string {
  const base = (raw || '').trim();
  if (!base) return fallback;
  const cleaned = base.replace(/[^a-zA-Z0-9_]/g, ' ');
  const camel = cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  const safe = camel || fallback;
  if (!/^[A-Za-z_]/.test(safe)) return `C${safe}`;
  return safe;
}

function deriveSliceComponentName(slice: SliceInput, index: number): string {
  const sliceComp = Array.isArray(slice.components)
    ? slice.components.find((c) => (c.componentType || '').toUpperCase() === 'SLICE') || slice.components[0]
    : undefined;
  const figmaName = slice?.figmaJson?.name as string | undefined;
  return sanitizeComponentName(sliceComp?.type || figmaName, `Slice${index + 1}`);
}

function deriveLayoutName(layout?: SliceInput): string {
  const figmaName = layout?.figmaJson?.name as string | undefined;
  return sanitizeComponentName(figmaName, 'Layout');
}

function combineImports(...lists: (ReactImport[] | undefined)[]): ReactImport[] {
  const merged: ReactImport[] = [];
  for (const list of lists) {
    if (!list) continue;
    merged.push(...list);
  }
  return merged;
}

async function buildCompositionArtifacts(
  composition: any,
  components: CustomComponentDef[] | undefined,
  options: FigmaToHtmlOptions,
  reactComponentName: string
): Promise<{ ir: ReturnType<typeof compositionToIR>; mappedContent: { html: string; cssText: string; htmlFragment?: string }; content: Awaited<ReturnType<typeof createContentAssets>>; reactAsset: ReactComponentAsset }> {
  const localComposition = JSON.parse(JSON.stringify(composition));
  normalizeComposition(localComposition);
  const ir = compositionToIR(localComposition, { customComponents: components });

  const content = await createContentAssets({
    composition: localComposition,
    irNodes: ir.nodes,
    cssRules: ir.cssRules,
    renderUnion: ir.renderUnion,
    debugEnabled: false,
  });

  const mappedContent = applyAssetUrlProvider(content.bodyHtml, content.cssText, ir.nodes, options.assetUrlProvider);
  const externalImports = collectCustomComponentImports(ir.nodes);
  const reactAsset = buildReactComponentAsset(reactComponentName, mappedContent.htmlFragment || mappedContent.html, mappedContent.cssText, externalImports);
  return { ir, mappedContent, content, reactAsset };
}

export async function figmaToHtml(input: { composition?: any; components?: CustomComponentDef[] } | SplitCompositionInput, options: FigmaToHtmlOptions = {}) {
  const resolved = resolveInput(input as any);
  const { composition, components } = resolved;
  if (!composition || typeof composition !== 'object') throw new Error('figmaToHtml: composition required');
  normalizeComposition(composition);
  const ir = compositionToIR(composition, { customComponents: components });

  const preview = await createPreviewAssets({
    composition,
    irNodes: ir.nodes,
    cssRules: ir.cssRules,
    renderUnion: ir.renderUnion,
    debugEnabled: !!options.debugEnabled,
  });

  // Also build content assets (for export packages)
  const content = await createContentAssets({
    composition,
    irNodes: ir.nodes,
    cssRules: ir.cssRules,
    renderUnion: ir.renderUnion,
    debugEnabled: false,
  });

  const mappedPreview = applyAssetUrlProvider(preview.html, preview.cssText, ir.nodes, options.assetUrlProvider);
  const mappedContent = applyAssetUrlProvider(content.bodyHtml, content.cssText, ir.nodes, options.assetUrlProvider);

  let reactOutput: ReactBuildResult | undefined;
  if (resolved?.layout || resolved?.slices) {
    const layoutName = deriveLayoutName(resolved.layout);
    const sliceReactAssets: ReactComponentAsset[] = [];
    if (Array.isArray(resolved?.slices)) {
      for (let i = 0; i < resolved.slices.length; i++) {
        const slice = resolved.slices[i];
        if (!slice || !slice.figmaJson) continue;
        const sliceName = deriveSliceComponentName(slice, i);
        const sliceArtifacts = await buildCompositionArtifacts(slice.figmaJson, components, options, sliceName);
        sliceReactAssets.push(sliceArtifacts.reactAsset);
      }
    }
    const sliceImports: ReactImport[] = sliceReactAssets.map((s) => ({ name: s.name, path: `./${s.name}`, importKind: 'default' }));
    const externalImports = collectCustomComponentImports(ir.nodes);
    const allImports = combineImports(externalImports, sliceImports);
    const layoutReact = buildReactComponentAsset(layoutName, mappedContent.htmlFragment || mappedContent.html, mappedContent.cssText, allImports);
    reactOutput = { layout: layoutReact, slices: sliceReactAssets };
  } else {
    const externalImports = collectCustomComponentImports(ir.nodes);
    const layoutName = deriveLayoutName({ figmaJson: composition });
    const layoutReact = buildReactComponentAsset(layoutName, mappedContent.htmlFragment || mappedContent.html, mappedContent.cssText, externalImports);
    reactOutput = { layout: layoutReact, slices: [] };
  }

  return {
    html: mappedPreview.html,
    cssText: mappedPreview.cssText,
    baseWidth: preview.baseWidth,
    baseHeight: preview.baseHeight,
    renderUnion: preview.renderUnion as Rect,
    assets: ir.assetMeta,
    debugHtml: preview.debugHtml,
    debugCss: preview.debugCss,
    content: {
      bodyHtml: mappedContent.htmlFragment || mappedContent.html,
      cssText: mappedContent.cssText,
      headLinks: '',
      baseWidth: content.baseWidth,
      baseHeight: content.baseHeight,
    },
    react: reactOutput,
  };
}

export async function figmaToReact(input: { composition?: any; components?: CustomComponentDef[] } | SplitCompositionInput, options: FigmaToHtmlOptions = {}) {
  const result = await figmaToHtml(input as any, options);
  return result.react;
}

function applyAssetUrlProvider(htmlOrFragment: string, cssText: string, nodes: RenderNodeIR[], provider?: AssetUrlProvider): { html: string; cssText: string; htmlFragment?: string } {
  if (!provider) return { html: htmlOrFragment, cssText };
  let outHtml = htmlOrFragment;
  let outCss = cssText;
  let isFragment = false;

  // Detect if this is a fragment (no <html> tag)
  if (!/<!doctype html>/i.test(htmlOrFragment) && !/<html\b/i.test(htmlOrFragment)) {
    isFragment = true;
    outHtml = htmlOrFragment;
  } else {
    outHtml = htmlOrFragment;
  }

  // Build svg file -> content map if available
  const svgMap = new Map<string, string>();
  const stack: RenderNodeIR[] = [...nodes];
  while (stack.length) {
    const n = stack.pop()!;
    if (n && n.svgFile && n.svgContent) svgMap.set(n.svgFile, n.svgContent);
    if (n && n.content && n.content.type === 'children') stack.push(...n.content.nodes);
  }

  // Replace image URLs in CSS and HTML (backgrounds)
  const imgRe = /(["'\(])(?:\/)?images\/([a-zA-Z0-9_-]+)\.png(["'\)])/g;
  outCss = outCss.replace(imgRe, (_m: string, p1: string, id: string, p3: string) => {
    const url = provider(String(id), 'image');
    return `${p1}${url}${p3}`;
  });
  outHtml = outHtml.replace(imgRe, (_m: string, p1: string, id: string, p3: string) => {
    const url = provider(String(id), 'image');
    return `${p1}${url}${p3}`;
  });

  // Replace svg <img src="svgs/<file>"> or <img src="/svgs/<file>">
  const svgRe = /(src=\")(?:[^\"]*\/)?svgs\/([^\"]+)(\")/g;
  outHtml = outHtml.replace(svgRe, (_m: string, p1: string, file: string, p3: string) => {
    const data = svgMap.get(String(file));
    const url = provider(String(file), 'svg', data);
    return `${p1}${url}${p3}`;
  });

  return isFragment ? { html: outHtml, cssText: outCss, htmlFragment: outHtml } : { html: outHtml, cssText: outCss };
}
