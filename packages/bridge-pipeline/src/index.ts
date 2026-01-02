export { figmaToHtml } from './public-api/figmaToHtml';
// Expose IR builder for upstream needs (e.g., inspector/sidebar trees)
export { compositionToIR } from './pipeline/ir';
export type { CompositionToIROptions } from './pipeline/ir';
export { normalizeComposition } from './utils/normalize';
export { normalizeHtml } from './utils/htmlPost';
export { extractFontsFromComposition, FontCollector } from './utils/fonts';
export type { FigmaNode, CompositionInput, FigmaVec2, FigmaRect, FigmaStyle, FigmaPaint, FigmaEffect, FigmaText, FigmaTextSegment } from './types/figma';

// React output API
export {
  figmaToReact,
  generateViteProject,
  generateReactComponentFiles,
  processLayoutConfig,
} from './public-api/figmaToReact';

export type {
  FigmaToReactOptions,
  FigmaToReactResult,
  GenerateViteProjectOptions,
} from './public-api/figmaToReact';

// Component mapping types
export type {
  ComponentMapping,
  ComponentType,
  ImportWay,
  SliceConfig,
  LayoutConfig,
  ResolvedComponent,
} from './types/component';

// React renderer
export { renderToReact, generateReactComponent } from './pipeline/react-renderer';
export type { ReactRenderOptions, ReactRenderResult, ImportStatement } from './pipeline/react-renderer';

// Vite template generator
export { generateViteTemplate, generateComponentFiles } from './templates/vite-react-ts';
export type { ViteTemplateOptions, ViteTemplateFile } from './templates/vite-react-ts';

// IR types
export type { RenderNodeIR, LayoutInfo, StyleInfo, Content } from './pipeline/types';
