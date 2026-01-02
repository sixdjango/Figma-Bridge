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
}

/**
 * Component build context
 */
export interface ComponentBuildContext {
  componentName: string;
  jsx: string;
  cssImportPath: string;
  sliceImports: string[];
  assetImportNames: string[];
  sliceNames: string[];
}
