import { normalizeComposition } from '../utils/normalize';
import { compositionToIR } from '../pipeline/ir';
import { createPreviewAssets, createContentAssets } from '../pipeline/html';
import type { CustomComponentDef, Rect } from '../pipeline/types';
import type { AssetType, AssetUrlProvider } from '../utils/asset-mapper';
import { applyAssetUrlProvider } from '../utils/asset-mapper';

export type { AssetType, AssetUrlProvider };

export type FigmaToHtmlOptions = {
  assetUrlProvider?: AssetUrlProvider;
  debugEnabled?: boolean;
};

type SliceInput = { components?: CustomComponentDef[]; figmaJson?: any };
type SplitCompositionInput = { layout: SliceInput; slices?: SliceInput[] };

function resolveInput(input: { composition?: any; components?: CustomComponentDef[] } | SplitCompositionInput | null | undefined): { composition: any; components?: CustomComponentDef[] } {
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
      return { composition: layout.figmaJson, components: compList };
    }
    // Legacy shape: { composition, components? }
    if ('composition' in input) {
      return { composition: (input as any).composition, components: Array.isArray((input as any).components) ? (input as any).components : undefined };
    }
  }
  throw new Error('figmaToHtml: composition required');
}

export async function figmaToHtml(input: { composition?: any; components?: CustomComponentDef[] } | SplitCompositionInput, options: FigmaToHtmlOptions = {}) {
  const { composition, components } = resolveInput(input as any);
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
    }
  };
}
