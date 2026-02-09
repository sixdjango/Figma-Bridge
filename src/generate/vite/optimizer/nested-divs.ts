/**
 * AST-based nested div optimizer - merges single-child nested divs
 */

import * as recast from "recast";
import { namedTypes as n, builders as b } from "ast-types";
import {
  parseCode,
  printCode,
  isDivElement,
  isSpanElement,
  isComponent,
  findAttribute,
  extractClassName,
  extractStyleEntries,
  getSingleJSXChild,
  isTextOnlySpan,
  parseClassName,
  hasPercentagePosition,
  hasPercentagePositionInClassName,
  isRelativeAbsolutePattern,
  setClassName,
} from "./ast-utils";
import type { ParsedStyleEntry, ParsedClassName, MergedClassResult } from "./types";
import { CONFLICT_GROUPS, SEMANTIC_CONFLICTS } from "./types";

const POSITION_PROPS = ["left", "top", "right", "bottom"];
const POSITION_TYPE_CLASSES = ["absolute", "relative", "fixed", "sticky"];
const PARENT_PRIORITY_PROPS = ["zIndex"];

// ---------- Box-model conflict guard ----------
// When padding/border from one side is combined with explicit dimensions
// from the other side, the merged element has a different visual size.

const PADDING_CLASS_RE = /^p[xytblr]?-/;

function hasPadding(className: string, style: ParsedStyleEntry[]): boolean {
  const classes = className.split(/\s+/).filter(Boolean);
  if (classes.some((c) => PADDING_CLASS_RE.test(c))) return true;
  return style.some((e) => e.key === "padding" || e.key.startsWith("padding"));
}

function hasBorderWidth(className: string, style: ParsedStyleEntry[]): boolean {
  const classes = className.split(/\s+/).filter(Boolean);
  if (classes.some((c) => c === "border" || /^border-\d/.test(c) || /^border-\[/.test(c))) return true;
  return style.some((e) => e.key === "borderWidth" || (e.key === "border" && /\d+px/.test(e.value)));
}

function hasExplicitDims(className: string, style: ParsedStyleEntry[]): boolean {
  const parsed = parseClassName(className);
  if (parsed.width !== null || parsed.height !== null) return true;
  return style.some((e) => (e.key === "width" || e.key === "height") && e.value !== "auto");
}

/**
 * Check if merging would create a box-model conflict.
 * Padding/border from one side + explicit dimensions from the other
 * → merged element has different visual size than the original nesting.
 */
function hasBoxModelConflict(
  outerClassName: string, outerStyle: ParsedStyleEntry[],
  innerClassName: string, innerStyle: ParsedStyleEntry[]
): boolean {
  const outerHasBoxMod = hasPadding(outerClassName, outerStyle)
    || hasBorderWidth(outerClassName, outerStyle);
  const innerHasBoxMod = hasPadding(innerClassName, innerStyle)
    || hasBorderWidth(innerClassName, innerStyle);
  const outerHasDims = hasExplicitDims(outerClassName, outerStyle);
  const innerHasDims = hasExplicitDims(innerClassName, innerStyle);

  // Outer padding/border + inner dimensions → padding would enlarge or shrink content
  if (outerHasBoxMod && innerHasDims) return true;
  // Inner padding/border + outer dimensions → dimensions were for element without padding
  if (innerHasBoxMod && outerHasDims) return true;

  return false;
}

// ---------- Positioning conflict guard ----------

function getPositionType(className: string, style: ParsedStyleEntry[]): string | null {
  const parsed = parseClassName(className);
  if (parsed.positionType) return parsed.positionType;
  const posEntry = style.find((e) => e.key === "position");
  if (posEntry) return posEntry.value;
  return null;
}

/**
 * Check if merging would destroy a positioning context.
 *
 * Cases that must block merge:
 * 1. Outer is relative/sticky + inner is absolute/fixed
 *    → inner is positioned relative to outer; merge loses the containing block
 *      and changes the element from in-flow to out-of-flow.
 * 2. Outer and inner have different position types (e.g., absolute vs relative)
 *    → child position wins in merge, dropping the outer's position semantics.
 */
function hasPositioningConflict(
  outerClassName: string, outerStyle: ParsedStyleEntry[],
  innerClassName: string, innerStyle: ParsedStyleEntry[]
): boolean {
  const outerPos = getPositionType(outerClassName, outerStyle);
  const innerPos = getPositionType(innerClassName, innerStyle);

  if (!outerPos || !innerPos) return false;

  // Same position type → safe to merge
  if (outerPos === innerPos) return false;

  // Outer creates containing block, inner depends on it
  if ((outerPos === "relative" || outerPos === "sticky")
    && (innerPos === "absolute" || innerPos === "fixed")) {
    return true;
  }

  // Outer is out-of-flow, inner is in-flow → merge would drop the outer's positioning
  if ((outerPos === "absolute" || outerPos === "fixed")
    && (innerPos === "relative" || innerPos === "sticky" || innerPos === "static")) {
    return true;
  }

  return false;
}

/**
 * Get conflict group key for a class
 * Returns a unique key if the class belongs to a conflict group
 */
function getConflictGroup(className: string): string | null {
  // Check explicit conflict groups
  for (const group of CONFLICT_GROUPS) {
    if (group.includes(className)) {
      return group.join(",");
    }
  }

  // Dynamic prefixes that are mutually exclusive
  const dynamicPrefixes = [
    "w-", "h-", "min-w-", "max-w-", "min-h-", "max-h-",
    "top-", "bottom-", "left-", "right-", "z-",
    "gap-", "gap-x-", "gap-y-",
    "p-", "px-", "py-", "pt-", "pb-", "pl-", "pr-",
    "m-", "mx-", "my-", "mt-", "mb-", "ml-", "mr-",
    "rounded-", "opacity-", "bg-", "leading-", "shadow-",
  ];

  for (const prefix of dynamicPrefixes) {
    if (className.startsWith(prefix)) {
      return prefix;
    }
  }

  // Handle text-[size] vs text-[color] - need to distinguish
  if (className.startsWith("text-")) {
    // text-left, text-center, etc. are text alignment
    if (["text-left", "text-center", "text-right", "text-justify"].includes(className)) {
      return "text-align";
    }
    // text-xs, text-sm, text-base, text-lg, text-xl, etc. are text size
    if (/^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)$/.test(className)) {
      return "text-size";
    }
    // text-[XXpx] is text size
    if (/^text-\[\d+(\.\d+)?(px|rem|em)\]$/.test(className)) {
      return "text-size";
    }
    // text-[#XXX] or text-[rgb(...)] is text color
    if (/^text-\[#|^text-\[rgb/.test(className)) {
      return "text-color";
    }
    // Default: treat as text color
    return "text-color";
  }

  // Handle font-[family]
  if (className.startsWith("font-")) {
    // font-thin, font-bold, etc. are font weights
    if (/^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/.test(className)) {
      return "font-weight";
    }
    // font-[xxx] is font family
    if (/^font-\[/.test(className)) {
      return "font-family";
    }
    return "font-weight";
  }

  return null;
}

/**
 * Check if parent class has semantic conflict with child classes
 */
function hasSemanticConflict(parentClass: string, childClasses: string[]): boolean {
  for (const conflict of SEMANTIC_CONFLICTS) {
    if (conflict.parent.includes(parentClass)) {
      // Check if any child class is in the child conflict group
      for (const childClass of childClasses) {
        if (conflict.child.includes(childClass)) {
          return true;
        }
      }
    }
  }
  return false;
}

const TEXT_ALIGN_CLASSES = ["text-left", "text-right", "text-center", "text-justify"];
const JUSTIFY_CLASSES = ["justify-center", "justify-start", "justify-end", "justify-between", "justify-around", "justify-evenly"];
const ITEMS_CLASSES = ["items-center", "items-start", "items-end", "items-baseline", "items-stretch"];
const FLEX_COL_CLASSES = ["flex-col", "flex-col-reverse"];

/**
 * Post-process merged classes to handle conditional semantic conflicts
 * This runs after all classes are merged to check combined conditions
 *
 * Rules:
 * 1. If child has text-left/text-right AND merged has flex + flex-col → remove items-*
 * 2. If child has text-left/text-right AND merged has flex (no flex-col) → remove justify-*
 */
function postProcessMergedClasses(mergedClasses: string[], childClasses: string[]): string[] {
  // Check if child has text alignment class
  const hasTextAlign = childClasses.some((cls) => TEXT_ALIGN_CLASSES.includes(cls));
  if (!hasTextAlign) {
    return mergedClasses;
  }

  // Check flex direction in merged result
  const hasFlex = mergedClasses.includes("flex") || mergedClasses.includes("inline-flex");
  const hasFlexCol = mergedClasses.some((cls) => FLEX_COL_CLASSES.includes(cls));

  if (!hasFlex) {
    return mergedClasses;
  }

  // Apply conditional removal
  return mergedClasses.filter((cls) => {
    if (hasFlexCol) {
      // flex + flex-col (vertical): text alignment conflicts with items-*
      if (ITEMS_CLASSES.includes(cls)) {
        return false;
      }
    } else {
      // flex only (horizontal): text alignment conflicts with justify-*
      if (JUSTIFY_CLASSES.includes(cls)) {
        return false;
      }
    }
    return true;
  });
}

// ---------- Multi-child-only class filter ----------
// Since we only merge single-child parents, classes that only affect
// multi-child layouts had no visual effect and must not carry over
// (they'd incorrectly apply to the inner element's children after merge).

function isMultiChildOnlyClass(cls: string): boolean {
  // gap between children
  if (/^gap(-x|-y)?-/.test(cls)) return true;
  // Tailwind space between children
  if (/^space-(x|y)-/.test(cls)) return true;
  // Flex wrap (1 child never wraps)
  if (cls === "flex-wrap" || cls === "flex-wrap-reverse") return true;
  return false;
}

const MULTI_CHILD_STYLE_PROPS = ["gap", "rowGap", "columnGap"];

/**
 * Sum two CSS position values.
 * Same unit → arithmetic sum; different units → child (b) takes priority.
 */
function sumPositionValues(a: string | undefined, b: string | undefined): string | null {
  if (!a && !b) return null;
  if (!a) return b!;
  if (!b) return a;

  // Try to parse both: value + optional unit
  const aMatch = a.match(/^(-?[\d.]+)([a-z%]*)$/);
  const bMatch = b.match(/^(-?[\d.]+)([a-z%]*)$/);

  if (aMatch && bMatch) {
    const aUnit = aMatch[2] || "px";
    const bUnit = bMatch[2] || "px";
    if (aUnit === bUnit) {
      const sum = parseFloat(aMatch[1]) + parseFloat(bMatch[1]);
      if (sum === 0) return null;
      return `${sum}${aUnit}`;
    }
  }

  // Different units or unparseable (calc, var, etc.) → child takes priority
  return b;
}

/**
 * Merge two className strings with position summing
 * Child classes have priority over parent classes
 */
function mergeClassNames(parentClass: string, childClass: string): MergedClassResult {
  const parentParsed = parseClassName(parentClass);
  const childParsed = parseClassName(childClass);

  // Merge positions (same-unit sums, different-unit child wins)
  const positions: Record<string, string> = {};
  for (const prop of POSITION_PROPS) {
    const merged = sumPositionValues(parentParsed.positions[prop], childParsed.positions[prop]);
    if (merged) {
      positions[prop] = merged;
    }
  }

  // Parent z-index takes priority
  const zIndex = parentParsed.zIndex ?? childParsed.zIndex;

  // Child width/height takes priority
  const width = childParsed.width ?? parentParsed.width;
  const height = childParsed.height ?? parentParsed.height;

  // Child position type takes priority
  const positionType = childParsed.positionType ?? parentParsed.positionType;

  // Merge classes - child first (higher priority), then parent
  const mergedClasses: string[] = [];
  const seenConflictGroups = new Set<string>();
  const seenClasses = new Set<string>();

  // Collect all child classes for semantic conflict checking
  const allChildClasses = [...childParsed.classes];
  if (childParsed.positionType) {
    allChildClasses.push(childParsed.positionType);
  }

  // Add child classes first (they have priority)
  for (const cls of childParsed.classes) {
    if (POSITION_TYPE_CLASSES.includes(cls)) {
      seenConflictGroups.add("__position_type__");
      continue;
    }

    // Skip duplicates
    if (seenClasses.has(cls)) continue;

    mergedClasses.push(cls);
    seenClasses.add(cls);

    // Mark conflict group as seen
    const conflictGroup = getConflictGroup(cls);
    if (conflictGroup) {
      seenConflictGroups.add(conflictGroup);
    }
  }

  // Add parent classes that don't conflict
  for (const cls of parentParsed.classes) {
    if (POSITION_TYPE_CLASSES.includes(cls)) continue;

    // Skip duplicates
    if (seenClasses.has(cls)) continue;

    // Skip parent's multi-child-only classes (parent had 1 child → no effect,
    // but after merge they'd incorrectly apply to the inner element's children)
    if (isMultiChildOnlyClass(cls)) continue;

    // Check for conflict group
    const conflictGroup = getConflictGroup(cls);
    if (conflictGroup && seenConflictGroups.has(conflictGroup)) {
      continue; // Child already has a class in this conflict group
    }

    // Check for semantic conflict (e.g., justify-center vs text-left)
    if (hasSemanticConflict(cls, allChildClasses)) {
      continue; // Skip parent class due to semantic conflict
    }

    mergedClasses.push(cls);
    seenClasses.add(cls);
    if (conflictGroup) {
      seenConflictGroups.add(conflictGroup);
    }
  }

  // Post-process: handle conditional semantic conflicts (text-align vs flex layout)
  const finalClasses = postProcessMergedClasses(mergedClasses, allChildClasses);

  return {
    merged: finalClasses.join(" "),
    positions,
    zIndex,
    width,
    height,
    positionType,
  };
}

// Flex-related style properties that should be removed when flex container is merged away
const FLEX_DEPENDENT_STYLES = ["flexBasis", "flexGrow", "flexShrink"];

/**
 * Check if flex container is being merged away
 * Returns true if outer div has flex class, meaning we're merging away a flex container
 * In this case, inner element's flexBasis/flexGrow/flexShrink should be removed
 * because they were meant for the outer flex container that's being removed
 */
function shouldRemoveFlexStyles(outerClassName: string): boolean {
  // If outer has flex, we're removing a flex container
  // The inner element's flex-related styles (flexBasis, etc.) were for this container
  return outerClassName.includes("flex");
}

/**
 * Merge two style entry lists
 */
function mergeStyles(
  parentStyle: ParsedStyleEntry[],
  childStyle: ParsedStyleEntry[],
  removeFlexStyles: boolean = false
): { merged: ParsedStyleEntry[]; width: string | null; height: string | null; positionType: string | null } {
  const merged: ParsedStyleEntry[] = [];
  const seenKeys = new Set<string>();
  let width: string | null = null;
  let height: string | null = null;
  let parentPositionType: string | null = null;
  let childPositionType: string | null = null;

  // Process child styles first (higher priority)
  for (const entry of childStyle) {
    if (POSITION_PROPS.includes(entry.key)) continue; // Will be summed separately
    // Skip flex-dependent styles if flex direction changed
    if (removeFlexStyles && FLEX_DEPENDENT_STYLES.includes(entry.key)) continue;
    if (entry.key === "width") {
      width = entry.value;
      continue;
    }
    if (entry.key === "height") {
      height = entry.value;
      continue;
    }
    if (entry.key === "position" && POSITION_TYPE_CLASSES.includes(entry.value)) {
      childPositionType = entry.value;
      continue;
    }
    merged.push(entry);
    seenKeys.add(entry.key);
  }

  // Add parent styles that don't conflict
  for (const entry of parentStyle) {
    if (POSITION_PROPS.includes(entry.key)) continue;
    // Skip flex-dependent styles if flex direction changed
    if (removeFlexStyles && FLEX_DEPENDENT_STYLES.includes(entry.key)) continue;
    // Skip multi-child-only style props from parent (parent had 1 child → no effect)
    if (MULTI_CHILD_STYLE_PROPS.includes(entry.key)) continue;
    if (seenKeys.has(entry.key)) {
      // Parent priority props
      if (PARENT_PRIORITY_PROPS.includes(entry.key)) {
        // Replace with parent value
        const idx = merged.findIndex((e) => e.key === entry.key);
        if (idx >= 0) merged[idx] = entry;
      }
      continue;
    }
    if (entry.key === "width" && width === null) {
      width = entry.value;
      continue;
    }
    if (entry.key === "height" && height === null) {
      height = entry.value;
      continue;
    }
    if (entry.key === "position" && POSITION_TYPE_CLASSES.includes(entry.value)) {
      parentPositionType = entry.value;
      continue;
    }
    merged.push(entry);
    seenKeys.add(entry.key);
  }

  return { merged, width, height, positionType: childPositionType ?? parentPositionType };
}

/**
 * Sum position values from style entries
 * Handles any CSS unit (px, rem, em, %, vw, vh, etc.)
 */
function sumPositions(
  parentStyle: ParsedStyleEntry[],
  childStyle: ParsedStyleEntry[]
): Record<string, string> {
  const positions: Record<string, string> = {};

  for (const prop of POSITION_PROPS) {
    const parentEntry = parentStyle.find((e) => e.key === prop);
    const childEntry = childStyle.find((e) => e.key === prop);

    const merged = sumPositionValues(parentEntry?.value, childEntry?.value);
    if (merged) {
      positions[prop] = merged;
    }
  }

  return positions;
}

/**
 * Build merged className string
 */
function buildMergedClassName(
  mergedClasses: string,
  classPositions: Record<string, string>,
  stylePositions: Record<string, string>,
  zIndex: number | null,
  classWidth: string | null,
  classHeight: string | null,
  styleWidth: string | null,
  styleHeight: string | null,
  classPositionType: string | null,
  stylePositionType: string | null
): string {
  const parts: string[] = [];

  if (mergedClasses) parts.push(mergedClasses);

  const finalPositionType = stylePositionType ?? classPositionType;
  if (finalPositionType) parts.push(finalPositionType);

  for (const prop of POSITION_PROPS) {
    const merged = sumPositionValues(classPositions[prop], stylePositions[prop]);
    if (merged) parts.push(`${prop}-[${merged}]`);
  }

  if (zIndex !== null) parts.push(`z-[${zIndex}]`);

  const finalWidth = styleWidth ?? classWidth;
  if (finalWidth) parts.push(`w-[${finalWidth}]`);

  const finalHeight = styleHeight ?? classHeight;
  if (finalHeight) parts.push(`h-[${finalHeight}]`);

  return parts.join(" ");
}

/**
 * Build JSX attributes for merged element
 */
function buildMergedAttributes(
  className: string,
  style: ParsedStyleEntry[]
): (n.JSXAttribute | n.JSXSpreadAttribute)[] {
  const attrs: n.JSXAttribute[] = [];

  if (className) {
    attrs.push(b.jsxAttribute(b.jsxIdentifier("className"), b.stringLiteral(className)));
  }

  if (style.length > 0) {
    const props = style.map((entry) =>
      b.objectProperty(b.identifier(entry.key), b.stringLiteral(entry.value))
    );
    attrs.push(
      b.jsxAttribute(
        b.jsxIdentifier("style"),
        b.jsxExpressionContainer(b.objectExpression(props))
      )
    );
  }

  return attrs;
}

/**
 * Optimize nested single-child divs using AST
 */
export function optimizeNestedDivs(code: string): string {
  const ast = parseCode(code);
  let modified = true;
  let iterations = 0;
  const maxIterations = 100;

  // Keep iterating until no more changes
  while (modified && iterations < maxIterations) {
    modified = false;
    iterations++;

    // Bottom-up traversal - process children first
    recast.visit(ast, {
      visitJSXElement(path) {
        // Traverse children first (bottom-up)
        this.traverse(path);

        const node = path.node;
        if (!isDivElement(node)) return;

        // Get outer div's attributes
        const outerClassName = extractClassName(node);
        if (outerClassName === null) return; // Dynamic className, skip

        const outerStyle = extractStyleEntries(node);
        if (outerStyle === null) return; // Has spread/dynamic, skip

        // Check for single child
        const child = getSingleJSXChild(node);
        if (!child) return;

        // Case 1: Child is text-only span - merge div + span -> span
        const spanCheck = isTextOnlySpan(child);
        if (spanCheck.isMatch) {
          const childClassName = extractClassName(child);
          if (childClassName === null) return;

          const childStyle = extractStyleEntries(child);
          if (childStyle === null) return;

          // Skip if padding/border + dimensions conflict
          if (hasBoxModelConflict(outerClassName, outerStyle, childClassName, childStyle)) return;

          // Skip if position types conflict (e.g., relative parent + absolute child)
          if (hasPositioningConflict(outerClassName, outerStyle, childClassName, childStyle)) return;

          // Use proper class merging with conflict resolution
          // Here outer (div) is parent, inner (span) is child
          const {
            merged: mergedClassName,
            positions: classPositions,
            zIndex,
            width: classWidth,
            height: classHeight,
            positionType: classPositionType,
          } = mergeClassNames(outerClassName, childClassName);

          // Check if flex direction changed during merge
          const removeFlexStyles = shouldRemoveFlexStyles(outerClassName);

          // Merge styles
          const stylePositions = sumPositions(outerStyle, childStyle);
          const {
            merged: mergedStyle,
            width: styleWidth,
            height: styleHeight,
            positionType: stylePositionType,
          } = mergeStyles(outerStyle, childStyle, removeFlexStyles);

          // Build final className
          const finalClassName = buildMergedClassName(
            mergedClassName,
            classPositions,
            stylePositions,
            zIndex,
            classWidth,
            classHeight,
            styleWidth,
            styleHeight,
            classPositionType,
            stylePositionType
          );

          // Build new span element
          const newAttrs = buildMergedAttributes(finalClassName, mergedStyle);
          const newSpan = b.jsxElement(
            b.jsxOpeningElement(b.jsxIdentifier("span"), newAttrs, false),
            b.jsxClosingElement(b.jsxIdentifier("span")),
            [b.jsxText(spanCheck.text)]
          );

          path.replace(newSpan);
          modified = true;
          return false;
        }

        // Case 2: Child is another div - merge nested divs
        if (isDivElement(child)) {
          const innerClassName = extractClassName(child);
          if (innerClassName === null) return; // Dynamic className, skip

          const innerStyle = extractStyleEntries(child);
          if (innerStyle === null) return; // Has spread/dynamic, skip

          // Skip relative+absolute centering patterns
          if (isRelativeAbsolutePattern(outerClassName, outerStyle, innerClassName, innerStyle)) {
            return;
          }

          // Skip if inner has percentage positioning
          if (hasPercentagePosition(innerStyle) || hasPercentagePositionInClassName(innerClassName)) {
            return;
          }

          // Skip if padding/border + dimensions conflict
          if (hasBoxModelConflict(outerClassName, outerStyle, innerClassName, innerStyle)) {
            return;
          }

          // Skip if position types conflict (e.g., relative parent + absolute child)
          if (hasPositioningConflict(outerClassName, outerStyle, innerClassName, innerStyle)) {
            return;
          }

          // Merge classNames
          const {
            merged: mergedClassName,
            positions: classPositions,
            zIndex,
            width: classWidth,
            height: classHeight,
            positionType: classPositionType,
          } = mergeClassNames(outerClassName, innerClassName);

          // Check if flex direction changed during merge
          const removeFlexStyles = shouldRemoveFlexStyles(outerClassName);

          // Merge styles and sum positions
          const stylePositions = sumPositions(outerStyle, innerStyle);
          const {
            merged: mergedStyle,
            width: styleWidth,
            height: styleHeight,
            positionType: stylePositionType,
          } = mergeStyles(outerStyle, innerStyle, removeFlexStyles);

          // Build final className
          const finalClassName = buildMergedClassName(
            mergedClassName,
            classPositions,
            stylePositions,
            zIndex,
            classWidth,
            classHeight,
            styleWidth,
            styleHeight,
            classPositionType,
            stylePositionType
          );

          // Build new element with inner's children
          const newAttrs = buildMergedAttributes(finalClassName, mergedStyle);
          const innerChildren = child.children || [];

          const newDiv = b.jsxElement(
            b.jsxOpeningElement(b.jsxIdentifier("div"), newAttrs, false),
            b.jsxClosingElement(b.jsxIdentifier("div")),
            innerChildren
          );

          path.replace(newDiv);
          modified = true;
          return false;
        }
      },
    });
  }

  return printCode(ast);
}
