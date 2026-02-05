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
  extractPxValue,
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

/**
 * Merge two className strings with position summing
 * Child classes have priority over parent classes
 */
function mergeClassNames(parentClass: string, childClass: string): MergedClassResult {
  const parentParsed = parseClassName(parentClass);
  const childParsed = parseClassName(childClass);

  // Sum positions
  const positions: Record<string, number> = {};
  for (const prop of POSITION_PROPS) {
    const sum = (parentParsed.positions[prop] || 0) + (childParsed.positions[prop] || 0);
    if (sum !== 0) {
      positions[prop] = sum;
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

/**
 * Merge two style entry lists
 */
function mergeStyles(
  parentStyle: ParsedStyleEntry[],
  childStyle: ParsedStyleEntry[]
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
 */
function sumPositions(
  parentStyle: ParsedStyleEntry[],
  childStyle: ParsedStyleEntry[]
): Record<string, number> {
  const positions: Record<string, number> = {};

  for (const prop of POSITION_PROPS) {
    const parentEntry = parentStyle.find((e) => e.key === prop);
    const childEntry = childStyle.find((e) => e.key === prop);

    const parentVal = parentEntry ? extractPxValue(parentEntry.value) : null;
    const childVal = childEntry ? extractPxValue(childEntry.value) : null;

    if (parentVal !== null || childVal !== null) {
      positions[prop] = (parentVal || 0) + (childVal || 0);
    }
  }

  return positions;
}

/**
 * Build merged className string
 */
function buildMergedClassName(
  mergedClasses: string,
  classPositions: Record<string, number>,
  stylePositions: Record<string, number>,
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
    const sum = (classPositions[prop] || 0) + (stylePositions[prop] || 0);
    if (sum !== 0) parts.push(`${prop}-[${sum}px]`);
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

          // Merge styles
          const stylePositions = sumPositions(outerStyle, childStyle);
          const {
            merged: mergedStyle,
            width: styleWidth,
            height: styleHeight,
            positionType: stylePositionType,
          } = mergeStyles(outerStyle, childStyle);

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

          // Merge classNames
          const {
            merged: mergedClassName,
            positions: classPositions,
            zIndex,
            width: classWidth,
            height: classHeight,
            positionType: classPositionType,
          } = mergeClassNames(outerClassName, innerClassName);

          // Merge styles and sum positions
          const stylePositions = sumPositions(outerStyle, innerStyle);
          const {
            merged: mergedStyle,
            width: styleWidth,
            height: styleHeight,
            positionType: stylePositionType,
          } = mergeStyles(outerStyle, innerStyle);

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
