/**
 * React Component Optimizer
 *
 * This module re-exports the AST-based optimizer implementation.
 * The string-based implementation is available in optimizer.string.ts.
 */

// Re-export AST-based optimizer
export {
  optimizeReactComponent,
  default,
  OptimizeOptions,
  optimizeNestedDivs,
  convertStylesToTailwind,
  removeIdentityTransforms,
  removeAutoSizes,
  removeDuplicateAbsolute,
  removeOutlineStyles,
  cleanupEmptyStyles,
  simplifyColors,
  simplifyJsxStrings,
} from "./optimizer/index";

// Re-export root merge from string-based (TODO: migrate to AST)
export { optimizeRootMerge } from "./optimizer.string";
