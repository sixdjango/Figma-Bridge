/**
 * Public API for converting Figma composition to React components
 */
import { normalizeComposition } from '../utils/normalize';
import { compositionToIR, type CompositionToIROptions } from '../pipeline/ir';
import { renderToReact, type ReactRenderOptions, type ReactRenderResult } from '../pipeline/react-renderer';
import { generateViteTemplate, generateComponentFiles, type ViteTemplateOptions, type ViteTemplateFile } from '../templates/vite-react-ts';
import type { ComponentMapping, LayoutConfig, SliceConfig } from '../types/component';
import type { RenderNodeIR, Rect } from '../pipeline/types';

export type FigmaToReactOptions = {
  /** Component mappings for custom component rendering */
  components?: ComponentMapping[];
  /** React rendering options */
  react?: ReactRenderOptions;
  /** Component name (default: 'FigmaComponent') */
  componentName?: string;
};

export type FigmaToReactResult = {
  /** React render result */
  react: ReactRenderResult;
  /** IR nodes */
  irNodes: RenderNodeIR[];
  /** Render union bounds */
  renderUnion: Rect;
  /** Asset metadata */
  assets: { images: string[]; svgs?: string[] };
  /** Font metadata */
  fonts: { family: string; weights: number[]; styles: string[] }[];
};

/**
 * Convert Figma composition to React component
 */
export async function figmaToReact(
  input: { composition: any },
  options: FigmaToReactOptions = {}
): Promise<FigmaToReactResult> {
  const { composition } = input || {};
  if (!composition || typeof composition !== 'object') {
    throw new Error('figmaToReact: composition required');
  }

  // Normalize composition
  normalizeComposition(composition);

  // Build IR with component mappings
  const irOptions: CompositionToIROptions = {
    components: options.components,
  };
  const ir = compositionToIR(composition, irOptions);

  // Render to React
  const componentName = options.componentName || 'FigmaComponent';
  const reactOptions: ReactRenderOptions = {
    pxToRem: true,
    remBase: 100,
    useTailwind: false,
    ...options.react,
  };

  const reactResult = await renderToReact(ir.nodes, componentName, reactOptions);

  return {
    react: reactResult,
    irNodes: ir.nodes,
    renderUnion: ir.renderUnion,
    assets: ir.assetMeta,
    fonts: ir.fontMeta.fonts,
  };
}

export type GenerateViteProjectOptions = {
  /** Project name */
  projectName: string;
  /** Use Tailwind CSS */
  useTailwind?: boolean;
  /** Base font size for rem (default: 100) */
  remBase?: number;
};

/**
 * Generate a complete Vite React TypeScript project
 */
export function generateViteProject(
  result: FigmaToReactResult,
  options: GenerateViteProjectOptions
): ViteTemplateFile[] {
  const viteOptions: ViteTemplateOptions = {
    projectName: options.projectName,
    useTailwind: options.useTailwind,
    remBase: options.remBase || 100,
  };

  return generateViteTemplate(result.react, viteOptions);
}

/**
 * Generate only component files (for adding to existing project)
 */
export function generateReactComponentFiles(
  result: FigmaToReactResult
): ViteTemplateFile[] {
  return generateComponentFiles(result.react);
}

/**
 * Process layout config with slices
 */
export async function processLayoutConfig(
  config: LayoutConfig,
  options: FigmaToReactOptions = {}
): Promise<{
  layout: FigmaToReactResult;
  slices: Map<string, FigmaToReactResult>;
}> {
  // Process main layout
  const layoutResult = await figmaToReact(
    { composition: config.layout.figmaJson },
    {
      ...options,
      components: [...(options.components || []), ...config.layout.components],
      componentName: options.componentName || 'Layout',
    }
  );

  // Process slices
  const slices = new Map<string, FigmaToReactResult>();
  for (let i = 0; i < config.slices.length; i++) {
    const slice = config.slices[i];
    // Find slice component to get the name
    const sliceComponent = config.layout.components.find(
      c => c.componentType === 'SLICE' && slice.components.some(sc => sc.nodeID === c.nodeID)
    );
    const sliceName = sliceComponent?.type || `Slice${i + 1}`;

    const sliceResult = await figmaToReact(
      { composition: slice.figmaJson },
      {
        ...options,
        components: [...(options.components || []), ...slice.components],
        componentName: sliceName,
      }
    );

    slices.set(sliceName, sliceResult);
  }

  return { layout: layoutResult, slices };
}

// Re-export types
export type { ComponentMapping, LayoutConfig, SliceConfig } from '../types/component';
export type { ReactRenderOptions, ReactRenderResult } from '../pipeline/react-renderer';
export type { ViteTemplateOptions, ViteTemplateFile } from '../templates/vite-react-ts';
