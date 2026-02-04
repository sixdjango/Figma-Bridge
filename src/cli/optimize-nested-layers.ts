#!/usr/bin/env ts-node
/**
 * Optimize nested single-child layers in React/JSX components
 *
 * This script merges multi-level nested single-child div elements into a single element,
 * combining their classNames and styles appropriately.
 *
 * Rules:
 * 1. Merge from the last node upward
 * 2. If the last node is a component (uppercase), don't modify it, merge parents above
 * 3. Position values (left, top, right, bottom) are summed when merging
 * 4. Handle both Tailwind format (top-[5px]) and style format ({top: "5px"})
 * 5. Child styles have higher priority for same-domain properties (except positions which sum)
 * 6. Preserve the outermost z-index
 *
 * Usage: npm run optimize-layers -- <path-to-tsx-file>
 */

import * as fs from "fs";
import * as path from "path";

// Position properties that need to be summed when merging
const POSITION_PROPS = ["left", "top", "right", "bottom"];

// Properties where parent (outer) value takes precedence
const PARENT_PRIORITY_PROPS = ["zIndex"];

// Position type classes that are mutually exclusive
const POSITION_TYPE_CLASSES = ["absolute", "relative", "fixed", "sticky"];

interface ParsedStyle {
  [key: string]: string;
}

/**
 * Extract numeric value from a px string like "5px" or "10.5px"
 */
function extractPxValue(value: string): number | null {
  const match = value.match(/^(-?[\d.]+)px$/);
  if (match) {
    return parseFloat(match[1]);
  }
  return null;
}

/**
 * Check if a style has percentage-based positioning (like "50%")
 * This is used for centering patterns that should not be merged
 */
function hasPercentagePosition(style: ParsedStyle): boolean {
  for (const prop of POSITION_PROPS) {
    const value = style[prop];
    if (value && value.includes("%")) {
      return true;
    }
  }
  return false;
}

/**
 * Check if className contains percentage-based positioning (like "left-[50%]")
 * This handles cases where styles have already been converted to Tailwind
 */
function hasPercentagePositionInClassName(className: string): boolean {
  for (const prop of POSITION_PROPS) {
    // Match patterns like left-[50%], top-[50%], etc.
    const pattern = new RegExp(`${prop}-\\[[^\\]]*%[^\\]]*\\]`);
    if (pattern.test(className)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if this is a relative+absolute positioning pattern that should not be merged
 * These patterns are used for centering and special layouts
 */
function isRelativeAbsolutePattern(outerClassName: string, outerStyle: ParsedStyle, innerClassName: string, innerStyle: ParsedStyle): boolean {
  const outerHasRelative = outerClassName.includes("relative") || outerStyle.position === "relative";
  const innerHasAbsolute = innerClassName.includes("absolute") || innerStyle.position === "absolute";

  // If outer is relative and inner is absolute, check for centering patterns
  if (outerHasRelative && innerHasAbsolute) {
    // Check for percentage positioning (centering pattern)
    if (hasPercentagePosition(innerStyle) || hasPercentagePositionInClassName(innerClassName)) {
      return true;
    }
    // Check for zero height container (common centering wrapper)
    if (outerStyle.height === "0px" || outerStyle.height === "0" || outerClassName.includes("h-[0px]") || outerClassName.includes("h-0")) {
      return true;
    }
  }

  return false;
}

/**
 * Parse className string to extract all tailwind position values and other classes
 */
function parseClassName(className: string): {
  classes: string[];
  positions: Record<string, number>;
  zIndex: number | null;
  width: string | null;
  height: string | null;
} {
  const classes = className.split(/\s+/).filter(Boolean);
  const positions: Record<string, number> = {};
  let zIndex: number | null = null;
  let width: string | null = null;
  let height: string | null = null;

  const nonPositionClasses: string[] = [];

  for (const cls of classes) {
    let isPositionClass = false;

    // Check position classes (handle negative values too)
    for (const prop of POSITION_PROPS) {
      const match = cls.match(new RegExp(`^${prop}-\\[(-?[\\d.]+)px\\]$`));
      if (match) {
        positions[prop] = parseFloat(match[1]);
        isPositionClass = true;
        break;
      }
    }

    // Check z-index
    const zMatch = cls.match(/^z-\[(\d+)\]$/);
    if (zMatch) {
      zIndex = parseInt(zMatch[1], 10);
      isPositionClass = true;
    }

    // Check width class
    const wMatch = cls.match(/^w-\[([^\]]+)\]$/);
    if (wMatch) {
      width = wMatch[1];
      isPositionClass = true;
    }

    // Check height class
    const hMatch = cls.match(/^h-\[([^\]]+)\]$/);
    if (hMatch) {
      height = hMatch[1];
      isPositionClass = true;
    }

    if (!isPositionClass) {
      nonPositionClasses.push(cls);
    }
  }

  return { classes: nonPositionClasses, positions, zIndex, width, height };
}

/**
 * Parse a style object from JSX style attribute string - handles complex values
 * Handles both quoted and unquoted keys: { 'key': "value" } or { key: "value" }
 */
function parseStyleString(styleStr: string): ParsedStyle {
  const style: ParsedStyle = {};
  if (!styleStr) return style;

  // Remove outer braces
  let content = styleStr.trim();
  if (content.startsWith("{{")) {
    let depth = 2;
    let endIdx = 2;
    for (let i = 2; i < content.length; i++) {
      if (content[i] === "{") depth++;
      else if (content[i] === "}") depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
    content = content.slice(2, endIdx).trim();
  } else if (content.startsWith("{") && content.endsWith("}")) {
    content = content.slice(1, -1).trim();
  }

  // Parse key-value pairs
  let pos = 0;
  while (pos < content.length) {
    // Skip whitespace
    while (pos < content.length && /\s/.test(content[pos])) pos++;
    if (pos >= content.length) break;

    // Parse key - may be quoted or unquoted
    let key = "";
    const keyStartChar = content[pos];

    if (keyStartChar === '"' || keyStartChar === "'") {
      // Quoted key like 'position' or "position"
      const quote = keyStartChar;
      pos++;
      const keyStart = pos;
      while (pos < content.length && content[pos] !== quote) {
        if (content[pos] === "\\") pos++;
        pos++;
      }
      key = content.slice(keyStart, pos);
      pos++; // Skip closing quote
    } else if (/[\w]/.test(keyStartChar)) {
      // Unquoted key like position
      const keyStart = pos;
      while (pos < content.length && /[\w]/.test(content[pos])) pos++;
      key = content.slice(keyStart, pos);
    } else {
      pos++;
      continue;
    }

    if (!key) break;

    // Skip whitespace and colon
    while (pos < content.length && /[\s:]/.test(content[pos])) pos++;
    if (pos >= content.length) break;

    // Find value
    let value = "";
    const quoteChar = content[pos];

    if (quoteChar === '"' || quoteChar === "'") {
      pos++;
      const valueStart = pos;
      while (pos < content.length && content[pos] !== quoteChar) {
        if (content[pos] === "\\") pos++;
        pos++;
      }
      value = content.slice(valueStart, pos);
      pos++;
    } else {
      const valueStart = pos;
      let parenDepth = 0;
      while (pos < content.length) {
        if (content[pos] === "(") parenDepth++;
        else if (content[pos] === ")") parenDepth--;
        else if (content[pos] === "," && parenDepth === 0) break;
        pos++;
      }
      value = content.slice(valueStart, pos).trim();
    }

    // Skip comma
    while (pos < content.length && /[\s,]/.test(content[pos])) pos++;

    if (key && value) {
      style[key] = value;
    }
  }

  return style;
}

/**
 * Serialize style object back to JSX format
 */
function serializeStyle(style: ParsedStyle): string {
  const entries = Object.entries(style);
  if (entries.length === 0) return "";

  const pairs = entries.map(([key, value]) => `${key}: "${value}"`);

  if (pairs.length <= 3) {
    return `{{ ${pairs.join(", ")} }}`;
  }

  return `{{\n              ${pairs.join(",\n              ")},\n            }}`;
}

/**
 * Extract className from JSX attributes string
 */
function extractClassNameFromAttrs(attrs: string): string {
  const normalized = attrs.replace(/\s+/g, " ");
  const simpleMatch = normalized.match(/className="([^"]*)"/);
  if (simpleMatch) return simpleMatch[1];
  const templateMatch = normalized.match(/className={`([^`]*)`}/);
  if (templateMatch) return templateMatch[1];
  return "";
}

/**
 * Extract style from JSX attributes string
 */
function extractStyleFromAttrs(attrs: string): ParsedStyle {
  const styleStart = attrs.indexOf("style={{");
  if (styleStart === -1) {
    const simpleMatch = attrs.match(/style=\{([^}]+)\}/);
    if (simpleMatch) {
      return parseStyleString("{" + simpleMatch[1] + "}");
    }
    return {};
  }

  let depth = 0;
  let pos = styleStart + 6;
  let endPos = -1;

  while (pos < attrs.length) {
    const char = attrs[pos];
    if (char === '"' || char === "'") {
      const quote = char;
      pos++;
      while (pos < attrs.length && attrs[pos] !== quote) {
        if (attrs[pos] === "\\") pos++;
        pos++;
      }
    } else if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) {
        endPos = pos + 1;
        break;
      }
    }
    pos++;
  }

  if (endPos === -1) return {};

  const styleStr = attrs.slice(styleStart + 6, endPos);
  return parseStyleString(styleStr);
}

/**
 * Merge className strings - child has priority except positions sum
 */
function mergeClassNames(
  parentClass: string,
  childClass: string
): {
  merged: string;
  positions: Record<string, number>;
  zIndex: number | null;
  width: string | null;
  height: string | null;
  positionType: string | null;
} {
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

  // Use parent z-index if available, otherwise child
  const zIndex = parentParsed.zIndex ?? childParsed.zIndex;
  // Child width/height takes priority
  const width = childParsed.width ?? parentParsed.width;
  const height = childParsed.height ?? parentParsed.height;

  // Find position type classes (absolute, relative, etc.) - child takes priority
  let childPositionType: string | null = null;
  let parentPositionType: string | null = null;

  for (const cls of childParsed.classes) {
    if (POSITION_TYPE_CLASSES.includes(cls)) {
      childPositionType = cls;
      break;
    }
  }
  for (const cls of parentParsed.classes) {
    if (POSITION_TYPE_CLASSES.includes(cls)) {
      parentPositionType = cls;
      break;
    }
  }

  // Child position type takes priority
  const positionType = childPositionType ?? parentPositionType;

  // Merge classes - child classes first (higher priority), then parent classes
  const mergedClasses: string[] = [];
  const seenBases = new Set<string>();

  // Add child classes first (they have higher priority)
  for (const cls of childParsed.classes) {
    // Skip position type classes, we'll add the final one separately
    if (POSITION_TYPE_CLASSES.includes(cls)) {
      seenBases.add("__position_type__");
      continue;
    }
    mergedClasses.push(cls);
    const base = cls.split("-")[0].split("[")[0];
    seenBases.add(base);
  }

  // Add parent classes that don't conflict
  for (const cls of parentParsed.classes) {
    // Skip position type classes
    if (POSITION_TYPE_CLASSES.includes(cls)) {
      continue;
    }
    const base = cls.split("-")[0].split("[")[0];
    if (!seenBases.has(base)) {
      mergedClasses.push(cls);
      seenBases.add(base);
    }
  }

  return { merged: mergedClasses.join(" "), positions, zIndex, width, height, positionType };
}

/**
 * Merge style objects - child priority except positions sum
 */
function mergeStyles(
  parentStyle: ParsedStyle,
  childStyle: ParsedStyle
): { merged: ParsedStyle; width: string | null; height: string | null; positionType: string | null } {
  const merged: ParsedStyle = {};
  let width: string | null = null;
  let height: string | null = null;
  let parentPositionType: string | null = null;
  let childPositionType: string | null = null;

  // Copy parent non-position styles
  for (const [key, value] of Object.entries(parentStyle)) {
    if (!POSITION_PROPS.includes(key)) {
      if (key === "width") {
        width = value;
      } else if (key === "height") {
        height = value;
      } else if (key === "position" && POSITION_TYPE_CLASSES.includes(value)) {
        parentPositionType = value;
      } else {
        merged[key] = value;
      }
    }
  }

  // Child styles override parent
  for (const [key, value] of Object.entries(childStyle)) {
    if (!POSITION_PROPS.includes(key)) {
      if (PARENT_PRIORITY_PROPS.includes(key) && merged[key]) {
        continue;
      }
      if (key === "width") {
        width = value;
      } else if (key === "height") {
        height = value;
      } else if (key === "position" && POSITION_TYPE_CLASSES.includes(value)) {
        childPositionType = value;
      } else {
        merged[key] = value;
      }
    }
  }

  // Child position type takes priority
  const positionType = childPositionType ?? parentPositionType;

  return { merged, width, height, positionType };
}

/**
 * Find matching close tag
 */
function findMatchingCloseTag(content: string, startPos: number): number {
  let depth = 1;
  let pos = startPos;

  while (pos < content.length && depth > 0) {
    const nextOpen = content.indexOf("<div", pos);
    const nextClose = content.indexOf("</div>", pos);

    if (nextClose === -1) return -1;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      const tagEnd = content.indexOf(">", nextOpen);
      if (tagEnd !== -1 && content[tagEnd - 1] === "/") {
        pos = tagEnd + 1;
      } else {
        depth++;
        pos = nextOpen + 4;
      }
    } else {
      depth--;
      if (depth === 0) return nextClose;
      pos = nextClose + 6;
    }
  }

  return -1;
}

/**
 * Check if a string is a React component
 */
function isComponent(tag: string): boolean {
  return /^<[A-Z]/.test(tag.trim());
}

/**
 * Check if content is a span with only text content (no nested elements)
 */
function isTextOnlySpan(content: string): { isMatch: boolean; className: string; text: string } {
  const trimmed = content.trim();

  // Match: <span className="...">text</span> or <span className="...">  text  </span>
  const match = trimmed.match(/^<span\s+className="([^"]*)">\s*([^<]+)\s*<\/span>$/s);
  if (match) {
    return { isMatch: true, className: match[1], text: match[2].trim() };
  }

  // Also match span without className
  const match2 = trimmed.match(/^<span>\s*([^<]+)\s*<\/span>$/s);
  if (match2) {
    return { isMatch: true, className: "", text: match2[1].trim() };
  }

  return { isMatch: false, className: "", text: "" };
}

/**
 * Get the single child of inner content (if any)
 */
function getSingleChild(innerContent: string): string | null {
  const trimmed = innerContent.trim();
  if (!trimmed.startsWith("<")) return null;

  const tagMatch = trimmed.match(/^<([a-zA-Z][a-zA-Z0-9]*)/);
  if (!tagMatch) return null;

  const tagName = tagMatch[1];

  // Self-closing component
  const selfCloseMatch = trimmed.match(/^<[A-Z][a-zA-Z0-9]*[^>]*\/>$/s);
  if (selfCloseMatch) return trimmed;

  // Regular element - find close tag
  const closeTag = `</${tagName}>`;
  if (!trimmed.endsWith(closeTag)) return null;

  // Verify it's a single element by checking balanced tags
  let depth = 0;
  let elements = 0;
  let i = 0;

  while (i < trimmed.length) {
    if (trimmed[i] === "<") {
      if (trimmed[i + 1] === "/") {
        depth--;
        i = trimmed.indexOf(">", i) + 1;
      } else if (/[a-zA-Z]/.test(trimmed[i + 1])) {
        if (depth === 0) elements++;
        const tagEnd = trimmed.indexOf(">", i);
        if (tagEnd !== -1 && trimmed[tagEnd - 1] === "/") {
          i = tagEnd + 1;
        } else {
          depth++;
          i = tagEnd + 1;
        }
      } else {
        i++;
      }
    } else {
      i++;
    }
  }

  return elements === 1 ? trimmed : null;
}

/**
 * Find end of opening tag accounting for multi-line attributes
 */
function findOpenTagEnd(content: string, start: number): number {
  let pos = start;
  while (pos < content.length) {
    const char = content[pos];
    if (char === '"') {
      pos++;
      while (pos < content.length && content[pos] !== '"') {
        if (content[pos] === "\\") pos++;
        pos++;
      }
    } else if (char === "'") {
      pos++;
      while (pos < content.length && content[pos] !== "'") {
        if (content[pos] === "\\") pos++;
        pos++;
      }
    } else if (char === "{") {
      let depth = 1;
      pos++;
      while (pos < content.length && depth > 0) {
        if (content[pos] === "{") depth++;
        else if (content[pos] === "}") depth--;
        else if (content[pos] === '"') {
          pos++;
          while (pos < content.length && content[pos] !== '"') {
            if (content[pos] === "\\") pos++;
            pos++;
          }
        } else if (content[pos] === "'") {
          pos++;
          while (pos < content.length && content[pos] !== "'") {
            if (content[pos] === "\\") pos++;
            pos++;
          }
        }
        pos++;
      }
      continue;
    } else if (char === ">") {
      return pos;
    }
    pos++;
  }
  return -1;
}

/**
 * Build merged element with all properties
 */
function buildMergedElement(
  mergedClassName: string,
  classPositions: Record<string, number>,
  stylePositions: Record<string, number>,
  zIndex: number | null,
  classWidth: string | null,
  classHeight: string | null,
  styleWidth: string | null,
  styleHeight: string | null,
  classPositionType: string | null,
  stylePositionType: string | null,
  mergedStyle: ParsedStyle,
  innerChild: string,
  indent: string
): string {
  const classParts: string[] = [];

  // Add merged className first (child classes have priority, already ordered correctly)
  if (mergedClassName) classParts.push(mergedClassName);

  // Add position type (child takes priority: style > class)
  const finalPositionType = stylePositionType ?? classPositionType;
  if (finalPositionType) classParts.push(finalPositionType);

  // Add position classes
  for (const prop of POSITION_PROPS) {
    const sum = (classPositions[prop] || 0) + (stylePositions[prop] || 0);
    if (sum !== 0) {
      classParts.push(`${prop}-[${sum}px]`);
    }
  }

  // Add z-index
  if (zIndex !== null) classParts.push(`z-[${zIndex}]`);

  // Add width (style takes priority over class)
  const finalWidth = styleWidth ?? classWidth;
  if (finalWidth) classParts.push(`w-[${finalWidth}]`);

  // Add height (style takes priority over class)
  const finalHeight = styleHeight ?? classHeight;
  if (finalHeight) classParts.push(`h-[${finalHeight}]`);

  const finalClassName = classParts.join(" ");

  let merged = `<div`;
  if (finalClassName) merged += ` className="${finalClassName}"`;
  if (Object.keys(mergedStyle).length > 0) {
    merged += ` style=${serializeStyle(mergedStyle)}`;
  }
  merged += `>\n${indent}  ${innerChild.trim()}\n${indent}</div>`;

  return merged;
}

/**
 * Main optimization function
 */
function optimizeNestedDivs(content: string): string {
  let result = content;
  let iterations = 0;
  const maxIterations = 100;

  while (iterations < maxIterations) {
    iterations++;
    let foundMatch = false;

    const divPattern = /<div\s/g;
    let match;

    while ((match = divPattern.exec(result)) !== null) {
      const outerStart = match.index;
      const openTagEnd = findOpenTagEnd(result, outerStart + 5);
      if (openTagEnd === -1) continue;

      const outerAttrs = result.slice(outerStart + 4, openTagEnd).trim();
      const closeStart = findMatchingCloseTag(result, openTagEnd + 1);
      if (closeStart === -1) continue;

      const innerContent = result.slice(openTagEnd + 1, closeStart);
      const child = getSingleChild(innerContent);
      if (!child) continue;

      // Check if child is a text-only span - merge div + span into single span
      const spanCheck = isTextOnlySpan(child);
      if (spanCheck.isMatch) {
        const outerClassName = extractClassNameFromAttrs(outerAttrs);
        const outerStyle = extractStyleFromAttrs(outerAttrs);

        // Merge classNames: outer classes + span classes
        const mergedClassName = outerClassName + (spanCheck.className ? " " + spanCheck.className : "");

        const lineStart = result.lastIndexOf("\n", outerStart) + 1;
        const indent = result.slice(lineStart, outerStart);

        // Build merged span element
        let merged = `<span`;
        if (mergedClassName) merged += ` className="${mergedClassName}"`;
        if (Object.keys(outerStyle).length > 0) {
          merged += ` style=${serializeStyle(outerStyle)}`;
        }
        merged += `>\n${indent}  ${spanCheck.text}\n${indent}</span>`;

        result = result.slice(0, outerStart) + merged + result.slice(closeStart + 6);
        foundMatch = true;
        break;
      }

      if (child.startsWith("<div ") || child.startsWith("<div\n")) {
        const innerOpenEnd = findOpenTagEnd(child, 5);
        if (innerOpenEnd === -1) continue;

        const innerDivAttrs = child.slice(4, innerOpenEnd).trim();
        const innerCloseStart = child.lastIndexOf("</div>");
        if (innerCloseStart === -1) continue;

        const innerDivContent = child.slice(innerOpenEnd + 1, innerCloseStart);
        const innerChild = getSingleChild(innerDivContent);

        if (innerChild && (isComponent(innerChild) || innerChild.startsWith("<div "))) {
          const outerClassName = extractClassNameFromAttrs(outerAttrs);
          const innerClassName = extractClassNameFromAttrs(innerDivAttrs);
          const outerStyle = extractStyleFromAttrs(outerAttrs);
          const innerStyle = extractStyleFromAttrs(innerDivAttrs);

          // Skip if inner element uses percentage-based positioning (in style or className)
          if (hasPercentagePosition(innerStyle) || hasPercentagePositionInClassName(innerClassName)) {
            continue;
          }

          // Skip relative+absolute patterns (centering, special layouts)
          if (isRelativeAbsolutePattern(outerClassName, outerStyle, innerClassName, innerStyle)) {
            continue;
          }

          const {
            merged: mergedClassName,
            positions: classPositions,
            zIndex,
            width: classWidth,
            height: classHeight,
            positionType: classPositionType
          } = mergeClassNames(outerClassName, innerClassName);

          // Sum positions from styles
          const stylePositions: Record<string, number> = {};
          for (const prop of POSITION_PROPS) {
            const outerVal = outerStyle[prop] ? extractPxValue(outerStyle[prop]) : null;
            const innerVal = innerStyle[prop] ? extractPxValue(innerStyle[prop]) : null;
            if (outerVal !== null || innerVal !== null) {
              stylePositions[prop] = (outerVal || 0) + (innerVal || 0);
            }
          }

          const {
            merged: mergedStyle,
            width: styleWidth,
            height: styleHeight,
            positionType: stylePositionType
          } = mergeStyles(outerStyle, innerStyle);

          const lineStart = result.lastIndexOf("\n", outerStart) + 1;
          const indent = result.slice(lineStart, outerStart);

          const merged = buildMergedElement(
            mergedClassName,
            classPositions,
            stylePositions,
            zIndex,
            classWidth,
            classHeight,
            styleWidth,
            styleHeight,
            classPositionType,
            stylePositionType,
            mergedStyle,
            innerChild,
            indent
          );

          result = result.slice(0, outerStart) + merged + result.slice(closeStart + 6);
          foundMatch = true;
          break;
        }
      }
    }

    if (!foundMatch) break;
  }

  console.log(`Optimization iterations: ${iterations}`);
  return result;
}

/**
 * Main function
 */
function optimizeFile(filePath: string): void {
  console.log(`Optimizing: ${filePath}`);

  const content = fs.readFileSync(filePath, "utf-8");
  const originalContent = content;

  let optimized = optimizeNestedDivs(content);
  optimized = optimized.split("\n").map((line) => line.replace(/\s+$/, "")).join("\n");

  if (optimized === originalContent) {
    console.log("No optimizations found.");
    return;
  }

  const outputPath = filePath.replace(/\.tsx$/, ".optimized.tsx");
  fs.writeFileSync(outputPath, optimized);
  console.log(`Optimized file written to: ${outputPath}`);

  const originalLines = originalContent.split("\n").length;
  const optimizedLines = optimized.split("\n").length;
  console.log(`Lines: ${originalLines} -> ${optimizedLines} (${originalLines - optimizedLines} reduced)`);
}

// Main
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log("Usage: npm run optimize-layers -- <path-to-tsx-file>");
  console.log("Example: npm run optimize-layers -- examples/vite/src/generated/Layout/index.tsx");
  process.exit(1);
}

const targetPath = path.resolve(args[0]);
if (!fs.existsSync(targetPath)) {
  console.error(`File not found: ${targetPath}`);
  process.exit(1);
}

optimizeFile(targetPath);
