/**
 * Main AST-based optimizer - combines all optimization passes
 */

import {
  removeIdentityTransforms,
  removeAutoSizes,
  removeDuplicateAbsolute,
  removeOutlineStyles,
  simplifyColors,
  simplifyJsxStrings,
  cleanupEmptyStyles,
  removeSelfStretchConflicts,
  removeGrowConflicts,
} from "./transforms";
import { convertStylesToTailwind } from "./tailwind-converter";
import { optimizeNestedDivs } from "./nested-divs";
import { wrapRootWithProps } from "./wrap-root-props";
import type { OptimizeOptions } from "./types";

const DEFAULT_OPTIONS: OptimizeOptions = {
  aggressive: true,
  removeAutoSizes: true,
  convertToTailwind: true,
  removeIdentityTransforms: true,
  simplifyColors: true,
  simplifyJsxStrings: true,
  removeOutlineStyles: true,
};

/**
 * Main optimization function using AST-based transforms
 *
 * @param content - The React component source code
 * @param options - Optimization options
 * @returns Optimized content
 */
export function optimizeReactComponent(
  content: string,
  options: OptimizeOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let result = content;

  // 1. Remove identity transforms
  if (opts.removeIdentityTransforms) {
    result = removeIdentityTransforms(result);
  }

  // 2. Remove redundant auto sizes
  if (opts.removeAutoSizes) {
    result = removeAutoSizes(result);
  }

  // 3. Remove duplicate position: absolute
  result = removeDuplicateAbsolute(result);

  // 4. Remove outline debug styles
  if (opts.removeOutlineStyles) {
    result = removeOutlineStyles(result);
  }

  // 5. Convert inline styles to Tailwind
  if (opts.convertToTailwind) {
    result = convertStylesToTailwind(result);
  }

  // 6. Simplify colors
  if (opts.simplifyColors) {
    result = simplifyColors(result);
  }

  // 7. Simplify JSX strings
  if (opts.simplifyJsxStrings) {
    result = simplifyJsxStrings(result);
  }

  // 8. Clean up empty styles
  result = cleanupEmptyStyles(result);

  // 9. Remove self-stretch when parent has non-stretch alignment
  // Must run BEFORE nested-divs merge, otherwise the merge sees
  // self-stretch vs items-center as a semantic conflict and drops items-center.
  result = removeSelfStretchConflicts(result);

  // 10. Remove grow when conflicting with explicit main-axis dimension
  // Must run BEFORE nested-divs merge to catch original parent-child relationships.
  result = removeGrowConflicts(result);

  // 11. Optimize nested divs (aggressive)
  if (opts.aggressive) {
    result = optimizeNestedDivs(result, opts.baseFontSize);
  }

  // 12. Remove grow conflicts again after merge (merge may create new conflicts)
  result = removeGrowConflicts(result);

  // 13. Wrap root element with className/style props support
  if (opts.wrapWithProps) {
    result = wrapRootWithProps(result);
  }

  // 14. Final cleanup - remove trailing whitespace and extra blank lines
  result = result
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n");
  result = result.replace(/\n{3,}/g, "\n\n");

  return result;
}

export default optimizeReactComponent;
