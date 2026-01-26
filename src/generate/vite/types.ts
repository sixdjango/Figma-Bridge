/**
 * Type definitions for Vite React component generation
 */

import type { FigmaToReactResult, ReactComponentFile, PxToRemOptions } from 'figma-html-bridge';

// Re-export for convenience
export type { FigmaToReactResult, ReactComponentFile, PxToRemOptions };

/**
 * Parsed root element information from JSX
 */
export interface RootElementInfo {
  tag: string;
  className: string;
  style: Record<string, string>;
  otherAttrs: Record<string, string>;
  innerJsx: string;
}

/**
 * Custom component import definition
 */
export interface CustomComponentImport {
  componentName: string;
  fromLib: string;
  importWay: 'DEFAULT' | 'NAMED';
}

/**
 * Asset index entry for generating asset barrel exports
 */
export interface AssetIndexEntry {
  localName: string;
  importPath: string;
  kind: 'image' | 'svg';
  useComponent?: boolean;
}

/**
 * Options for generating Vite React components
 */
export interface ViteGeneratorOptions {
  /** Input Figma JSON data or file path */
  input: string | object;
  /** Output directory for generated components */
  outputDir: string;
  /** Directory for assets output */
  assetsDir?: string;
  /** Directory containing temporary images */
  tempImagesDir?: string;
  /** Directory containing temporary SVGs */
  tempSvgsDir?: string;
  /** Whether to clean output directory before generation */
  cleanOutput?: boolean;
  /** SVG import mode */
  svgImportMode?: 'svgr' | 'svgr-query' | 'url' | 'none';
  /** Image import mode */
  imageImportMode?: 'url' | 'none';
  /** Custom logger */
  logger?: Logger;
  /**
   * Optional px to rem conversion for inline styles
   * When enabled, converts px values to rem in style attributes
   * @example
   * pxToRem: { enabled: true, baseFontSize: 16, precision: 4 }
   */
  pxToRem?: PxToRemOptions;
  /**
   * Whether to include CSS import in generated components
   * Set to false when using Tailwind CSS
   * @default true
   */
  includeCssImport?: boolean;
  /**
   * Whether to include debug data attributes (data-node-id, data-component-lib, etc.)
   * in the final output. Set to true for debugging, false for production.
   * @default false
   */
  debug?: boolean;
  /**
   * Whether to format the output code with prettier
   * @default true
   */
  formatOutput?: boolean;
  /**
   * Only copy assets that are actually referenced in the generated components.
   * When true, unused assets will not be copied to the output directory.
   * @default true
   */
  onlyReferencedAssets?: boolean;
  /**
   * CSS output mode:
   * - 'tailwind': Use Tailwind CSS classes inline (default)
   * - 'less-module': Generate LESS module file with converted styles
   * @default 'tailwind'
   */
  cssMode?: 'tailwind' | 'less-module';
  /**
   * Whether to create a ZIP archive of the generated output.
   * When enabled, creates a ZIP file containing all generated files.
   * @default false
   */
  outputZip?: boolean;
  /**
   * Custom path for the ZIP file.
   * If not specified, defaults to `{outputDir}.zip`
   */
  zipPath?: string;
}

/**
 * Logger interface for customizable logging
 */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * Result of Vite component generation
 */
export interface ViteGeneratorResult {
  /** Layout component info */
  layout: {
    name: string;
    path: string;
    width: number;
    height: number;
  };
  /** Slice components info */
  slices: Array<{
    name: string;
    path: string;
    width: number;
    height: number;
  }>;
  /** Generated asset files */
  assets: {
    svgs: string[];
    images: string[];
  };
  /** Path to the generated ZIP file (if outputZip was enabled) */
  zipPath?: string;
  /** ZIP file buffer (if outputZip was enabled) */
  zipBuffer?: Buffer;
}

/**
 * Component build context
 */
export interface ComponentBuildContext {
  componentName: string;
  jsx: string;
  /** CSS import path, if undefined CSS import is skipped */
  cssImportPath?: string;
  sliceImports: string[];
  assetImportNames: string[];
  sliceNames: string[];
}
