import { normalizeComposition } from '../utils/normalize';
import { compositionToIR } from '../pipeline/ir';
import { createContentAssets } from '../pipeline/html';
import { applyAssetUrlProvider, type AssetUrlProvider } from '../utils/asset-mapper';
import { buildReactComponentSource, htmlFragmentToJsx } from '../utils/react-builder';
import type { CustomComponentDef, Rect } from '../pipeline/types';

type SliceInput = { components?: CustomComponentDef[]; figmaJson?: any; name?: string };
type SplitCompositionInput = { layout: SliceInput; slices?: SliceInput[] };

export type FigmaToReactOptions = { assetUrlProvider?: AssetUrlProvider };

export type ReactComponentFile = {
  name: string;
  fileName: string;
  code: string;
  jsx: string;
  cssText: string;
  baseWidth: number;
  baseHeight: number;
  renderUnion: Rect;
};

export type FigmaToReactResult = {
  layout: ReactComponentFile;
  slices: ReactComponentFile[];
  assets: { images: string[]; svgs: string[] };
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

function deriveSliceName(slice: SliceInput, index: number): string {
  const fromDef = (slice.components || []).find((c) => String(c.componentType || '').toUpperCase() === 'SLICE');
  if (fromDef?.type) return sanitizeComponentName(fromDef.type, `Slice${index + 1}`);
  if (slice.name) return sanitizeComponentName(slice.name, `Slice${index + 1}`);
  return `Slice${index + 1}`;
}

function buildImportsForSlices(sliceFiles: ReactComponentFile[]): string[] {
  return sliceFiles.map((sf) => `import ${sf.name} from './${sf.fileName.replace(/\.jsx$/, '')}';`);
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
  additionalImports: string[] = []
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
  const componentTags = buildComponentTagMap(components);
  const jsx = htmlFragmentToJsx(mapped.htmlFragment || mapped.html, { componentTags });
  const code = buildReactComponentSource(componentName, jsx, mapped.cssText, additionalImports, true);
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
  };
}

export async function figmaToReact(
  input: { composition?: any; components?: CustomComponentDef[] } | SplitCompositionInput,
  options: FigmaToReactOptions = {}
): Promise<FigmaToReactResult> {
  const { layout, slices, isSplit } = resolveInput(input as any);
  const sliceComponents = Array.isArray(slices)
    ? slices.reduce<CustomComponentDef[]>((acc, cur) => {
        if (Array.isArray(cur?.components)) acc.push(...cur.components!);
        return acc;
      }, [])
    : [];
  const layoutComponents: CustomComponentDef[] = [
    ...(Array.isArray(layout.components) ? layout.components : []),
    ...sliceComponents,
  ];

  const sliceOutputs: ReactComponentFile[] = [];
  if (isSplit && Array.isArray(slices)) {
    for (let i = 0; i < slices.length; i++) {
      const slice = slices[i];
      if (!slice?.figmaJson) continue;
      const sliceName = deriveSliceName(slice, i);
      const sliceResult = await buildReactComponent(
        slice.figmaJson,
        slice.components,
        sliceName,
        options
      );
      sliceOutputs.push(sliceResult);
    }
  }

  const layoutImports = isSplit ? buildImportsForSlices(sliceOutputs) : [];
  const layoutResult = await buildReactComponent(
    layout.figmaJson,
    layoutComponents,
    'Layout',
    options,
    layoutImports
  );

  const imageSet = new Set<string>();
  const svgSet = new Set<string>();
  [layoutResult, ...sliceOutputs].forEach((r: any) => {
    r.assets?.images?.forEach((img: string) => imageSet.add(img));
    r.assets?.svgs?.forEach((svg: string) => svgSet.add(svg));
  });

  return { layout: layoutResult, slices: sliceOutputs, assets: { images: Array.from(imageSet), svgs: Array.from(svgSet) } };
}
