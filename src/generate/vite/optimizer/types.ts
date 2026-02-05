/**
 * Shared types for AST-based optimizer
 */

/**
 * Parsed style entry from JSX style attribute
 */
export interface ParsedStyleEntry {
  key: string;
  value: string;
}

/**
 * Parsed className information
 */
export interface ParsedClassName {
  classes: string[];
  positions: Record<string, number>; // left, top, right, bottom values
  zIndex: number | null;
  width: string | null;
  height: string | null;
  positionType: string | null; // absolute, relative, fixed, sticky
}

/**
 * Extracted attributes from JSX element
 */
export interface ElementAttributes {
  className: string | null; // null if dynamic
  style: ParsedStyleEntry[] | null; // null if has spread/dynamic
  rawClassName?: string; // Original className string
}

/**
 * Merged element result
 */
export interface MergedClassResult {
  merged: string;
  positions: Record<string, number>;
  zIndex: number | null;
  width: string | null;
  height: string | null;
  positionType: string | null;
}

/**
 * Optimization options
 */
export interface OptimizeOptions {
  /** Enable aggressive optimizations (merge nested divs, etc.) */
  aggressive?: boolean;
  /** Remove redundant auto sizes */
  removeAutoSizes?: boolean;
  /** Convert inline styles to Tailwind classes */
  convertToTailwind?: boolean;
  /** Remove identity transforms */
  removeIdentityTransforms?: boolean;
  /** Simplify colors (rgb(0,0,0) -> black) */
  simplifyColors?: boolean;
  /** Simplify JSX string wrappers */
  simplifyJsxStrings?: boolean;
  /** Remove outline debug styles */
  removeOutlineStyles?: boolean;
  /** Merge nested divs into baseClassName/baseStyle */
  mergeToRoot?: boolean;
}

/**
 * Position properties that need summing when merging
 */
export const POSITION_PROPS = ["left", "top", "right", "bottom"] as const;

/**
 * Properties where parent (outer) value takes precedence
 */
export const PARENT_PRIORITY_PROPS = ["zIndex"] as const;

/**
 * Position type classes (mutually exclusive)
 */
export const POSITION_TYPE_CLASSES = ["absolute", "relative", "fixed", "sticky"] as const;

/**
 * Class conflict groups - classes in the same group are mutually exclusive
 */
export const CONFLICT_GROUPS: readonly string[][] = [
  ["justify-center", "justify-start", "justify-end", "justify-between", "justify-around", "justify-evenly"],
  ["items-center", "items-start", "items-end", "items-baseline", "items-stretch"],
  ["self-auto", "self-start", "self-end", "self-center", "self-stretch", "self-baseline"],
  ["text-left", "text-center", "text-right", "text-justify"],
  ["absolute", "relative", "fixed", "sticky", "static"],
  ["flex", "block", "inline", "inline-block", "inline-flex", "grid", "inline-grid", "hidden"],
  ["flex-row", "flex-col", "flex-row-reverse", "flex-col-reverse"],
  ["flex-wrap", "flex-nowrap", "flex-wrap-reverse"],
  ["overflow-auto", "overflow-hidden", "overflow-visible", "overflow-scroll"],
  ["font-thin", "font-extralight", "font-light", "font-normal", "font-medium", "font-semibold", "font-bold", "font-extrabold", "font-black"],
];

/**
 * Semantic conflicts - parent class should be removed when child has conflicting class
 */
export const SEMANTIC_CONFLICTS: readonly { parent: readonly string[]; child: readonly string[] }[] = [
  {
    parent: ["justify-center", "justify-start", "justify-end", "justify-between", "justify-around", "justify-evenly"],
    child: ["text-left", "text-center", "text-right", "text-justify"],
  },
  {
    parent: ["items-center", "items-start", "items-end", "items-baseline", "items-stretch"],
    child: ["self-auto", "self-start", "self-end", "self-center", "self-stretch", "self-baseline"],
  },
];
