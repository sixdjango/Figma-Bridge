/**
 * React Component Optimizer
 *
 * This module re-exports the AST-based optimizer implementation.
 * The string-based implementation is available in optimizer.string.ts for reference.
 */

// Re-export all AST-based optimizer functions
export {
  optimizeReactComponent,
  default,
  OptimizeOptions,
  optimizeNestedDivs,
  optimizeRootMerge,
  convertStylesToTailwind,
  removeIdentityTransforms,
  removeAutoSizes,
  removeDuplicateAbsolute,
  removeOutlineStyles,
  cleanupEmptyStyles,
  simplifyColors,
  simplifyJsxStrings,
} from "./optimizer/index";
