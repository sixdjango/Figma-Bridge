/**
 * React Component Optimizer for Figma-generated code
 *
 * This module provides optimization functions that can be used programmatically
 * to optimize generated React/JSX components.
 *
 * Optimizations include:
 * 1. Convert inline styles to Tailwind classes
 * 2. Remove identity transform matrices
 * 3. Remove redundant width/height: "auto"
 * 4. Remove duplicate position: absolute
 * 5. Simplify colors and JSX strings
 * 6. Merge nested single-child div elements
 * 7. Merge div + text-only span into single span
 */

// ============================================================================
// Style to Tailwind Conversion
// ============================================================================

interface ParsedStyleEntry {
  key: string;
  value: string;
}

/**
 * Parse style object content into key-value pairs
 * Handles both quoted and unquoted keys: { 'key': "value" } or { key: "value" }
 */
function parseStyleContent(styleContent: string): ParsedStyleEntry[] {
  const result: ParsedStyleEntry[] = [];
  let pos = 0;
  const content = styleContent.trim();

  while (pos < content.length) {
    // Skip whitespace
    while (pos < content.length && /\s/.test(content[pos])) pos++;
    if (pos >= content.length) break;

    // Parse key - may be quoted or unquoted
    let key = "";
    const keyStartChar = content[pos];

    if (keyStartChar === '"' || keyStartChar === "'") {
      const quote = keyStartChar;
      pos++;
      const keyStart = pos;
      while (pos < content.length && content[pos] !== quote) {
        if (content[pos] === "\\") pos++;
        pos++;
      }
      key = content.slice(keyStart, pos);
      pos++;
    } else if (/[\w]/.test(keyStartChar)) {
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

    // Parse value
    let value = "";
    const startChar = content[pos];

    if (startChar === '"' || startChar === "'") {
      const quote = startChar;
      pos++;
      const valueStart = pos;
      while (pos < content.length && content[pos] !== quote) {
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

    // Skip comma and whitespace
    while (pos < content.length && /[\s,]/.test(content[pos])) pos++;

    if (key && value) {
      result.push({ key, value });
    }
  }

  return result;
}

/**
 * Convert a single style property to Tailwind class
 */
function styleToTailwind(key: string, value: string, existingClasses: string): string | null {
  const normalizedValue = value.replace(/,\s+/g, ",");

  // position
  if (key === "position") {
    if (["absolute", "relative", "fixed", "sticky"].includes(value)) {
      if (!existingClasses.includes(value)) {
        return value;
      }
      return "";
    }
  }

  // width
  if (key === "width") {
    if (value === "100%") return "w-full";
    if (value === "auto") return "w-auto";
    return `w-[${value}]`;
  }

  // height
  if (key === "height") {
    if (value === "100%") return "h-full";
    if (value === "auto") return "h-auto";
    return `h-[${value}]`;
  }

  // left/top/right/bottom
  if (key === "left") return `left-[${value}]`;
  if (key === "top") return `top-[${value}]`;
  if (key === "right") return `right-[${value}]`;
  if (key === "bottom") return `bottom-[${value}]`;

  // margin
  if (key === "margin") return `m-[${value}]`;
  if (key === "marginLeft") return `ml-[${value}]`;
  if (key === "marginRight") return `mr-[${value}]`;
  if (key === "marginTop") return `mt-[${value}]`;
  if (key === "marginBottom") return `mb-[${value}]`;

  // padding
  if (key === "padding") return `p-[${value}]`;
  if (key === "paddingLeft") return `pl-[${value}]`;
  if (key === "paddingRight") return `pr-[${value}]`;
  if (key === "paddingTop") return `pt-[${value}]`;
  if (key === "paddingBottom") return `pb-[${value}]`;

  // gap
  if (key === "gap") return `gap-[${value}]`;
  if (key === "rowGap") return `gap-y-[${value}]`;
  if (key === "columnGap") return `gap-x-[${value}]`;

  // display
  if (key === "display") {
    const displayMap: Record<string, string> = {
      block: "block",
      flex: "flex",
      inline: "inline",
      "inline-block": "inline-block",
      "inline-flex": "inline-flex",
      grid: "grid",
      hidden: "hidden",
      none: "hidden",
    };
    if (displayMap[value] && !existingClasses.includes(displayMap[value])) {
      return displayMap[value];
    }
    return "";
  }

  // overflow
  if (key === "overflow") {
    const overflowMap: Record<string, string> = {
      hidden: "overflow-hidden",
      auto: "overflow-auto",
      scroll: "overflow-scroll",
      visible: "overflow-visible",
    };
    if (overflowMap[value]) return overflowMap[value];
  }

  // background
  if (key === "background" || key === "backgroundColor") {
    return `bg-[${normalizedValue.replace(/_/g, "\\u005f")}]`;
  }

  // boxShadow
  if (key === "boxShadow") {
    const shadowValue = normalizedValue.replace(/\s+/g, "_");
    return `shadow-[${shadowValue}]`;
  }

  // fontFamily
  if (key === "fontFamily") {
    const fontValue = normalizedValue.replace(/\s+/g, "_").replace(/'/g, "");
    return `font-[${fontValue}]`;
  }

  // z-index
  if (key === "zIndex") {
    return `z-[${value}]`;
  }

  // opacity
  if (key === "opacity") {
    return `opacity-[${value}]`;
  }

  // border-radius
  if (key === "borderRadius") {
    return `rounded-[${value}]`;
  }

  // flex properties
  if (key === "flexDirection") {
    if (value === "row") return "flex-row";
    if (value === "column") return "flex-col";
    if (value === "row-reverse") return "flex-row-reverse";
    if (value === "column-reverse") return "flex-col-reverse";
  }
  if (key === "flexWrap") {
    if (value === "wrap") return "flex-wrap";
    if (value === "nowrap") return "flex-nowrap";
    if (value === "wrap-reverse") return "flex-wrap-reverse";
  }
  if (key === "flexGrow") return `grow-[${value}]`;
  if (key === "flexShrink") return `shrink-[${value}]`;
  if (key === "flex") return `flex-[${value.replace(/\s+/g, "_")}]`;

  // align/justify
  if (key === "alignItems") {
    const alignMap: Record<string, string> = {
      "flex-start": "items-start",
      "flex-end": "items-end",
      center: "items-center",
      baseline: "items-baseline",
      stretch: "items-stretch",
    };
    if (alignMap[value]) return alignMap[value];
  }
  if (key === "justifyContent") {
    const justifyMap: Record<string, string> = {
      "flex-start": "justify-start",
      "flex-end": "justify-end",
      center: "justify-center",
      "space-between": "justify-between",
      "space-around": "justify-around",
      "space-evenly": "justify-evenly",
    };
    if (justifyMap[value]) return justifyMap[value];
  }
  if (key === "alignSelf") {
    const selfMap: Record<string, string> = {
      auto: "self-auto",
      "flex-start": "self-start",
      "flex-end": "self-end",
      center: "self-center",
      stretch: "self-stretch",
      baseline: "self-baseline",
    };
    if (selfMap[value]) return selfMap[value];
  }

  // text properties
  if (key === "textAlign") {
    const textAlignMap: Record<string, string> = {
      left: "text-left",
      center: "text-center",
      right: "text-right",
      justify: "text-justify",
    };
    if (textAlignMap[value]) return textAlignMap[value];
  }
  if (key === "fontSize") return `text-[${value}]`;
  if (key === "fontWeight") {
    const weightMap: Record<string, string> = {
      "100": "font-thin",
      "200": "font-extralight",
      "300": "font-light",
      "400": "font-normal",
      "500": "font-medium",
      "600": "font-semibold",
      "700": "font-bold",
      "800": "font-extrabold",
      "900": "font-black",
    };
    if (weightMap[value]) return weightMap[value];
    return `font-[${value}]`;
  }
  if (key === "lineHeight") return `leading-[${value}]`;
  if (key === "letterSpacing") return `tracking-[${value}]`;
  if (key === "color") {
    return `text-[${normalizedValue}]`;
  }

  // whitespace
  if (key === "whiteSpace") {
    const wsMap: Record<string, string> = {
      normal: "whitespace-normal",
      nowrap: "whitespace-nowrap",
      pre: "whitespace-pre",
      "pre-line": "whitespace-pre-line",
      "pre-wrap": "whitespace-pre-wrap",
      "break-spaces": "whitespace-break-spaces",
    };
    if (wsMap[value]) return wsMap[value];
  }

  // transform - keep as style (too complex)
  if (key === "transform" || key === "transformOrigin") {
    return null;
  }

  return null;
}

/**
 * Convert inline styles to Tailwind classes
 */
function convertStylesToTailwind(content: string): string {
  let result = content;

  // Pattern for elements with className and style
  const elementPattern =
    /(<(?:div|span|button|a|[A-Z][a-zA-Z0-9]*)\s+)([^>]*className="([^"]*)"[^>]*style=\{\{)([\s\S]*?)(\}\}[^>]*\/?[^>]*>)/g;

  result = result.replace(
    elementPattern,
    (match, tagStart, attrsBeforeStyle, existingClasses, styleContent, attrsAfterStyle) => {
      const tailwindClasses: string[] = [];
      const remainingStyles: ParsedStyleEntry[] = [];

      const styleProps = parseStyleContent(styleContent);

      for (const { key, value } of styleProps) {
        const twClass = styleToTailwind(key, value, existingClasses);
        if (twClass === null) {
          remainingStyles.push({ key, value });
        } else if (twClass !== "") {
          tailwindClasses.push(twClass);
        }
      }

      const newClasses =
        existingClasses + (tailwindClasses.length > 0 ? " " + tailwindClasses.join(" ") : "");
      const extraAttrs = attrsAfterStyle
        .replace(/^\}\}\s*/, "")
        .replace(/>$/, "")
        .replace(/\/>$/, "")
        .trim();
      const isSelfClosing = attrsAfterStyle.trim().endsWith("/>");

      let newElement: string;

      if (remainingStyles.length === 0) {
        if (extraAttrs) {
          newElement =
            tagStart + `className="${newClasses}" ${extraAttrs}${isSelfClosing ? "/>" : ">"}`;
        } else {
          newElement = tagStart + `className="${newClasses}"${isSelfClosing ? "/>" : ">"}`;
        }
      } else {
        const styleStr = remainingStyles
          .map(({ key, value }) => `${key}: "${value}"`)
          .join(", ");
        if (extraAttrs) {
          newElement =
            tagStart +
            `className="${newClasses}" style={{ ${styleStr} }} ${extraAttrs}${isSelfClosing ? "/>" : ">"}`;
        } else {
          newElement =
            tagStart +
            `className="${newClasses}" style={{ ${styleStr} }}${isSelfClosing ? "/>" : ">"}`;
        }
      }

      return newElement;
    }
  );

  return result;
}

// ============================================================================
// Identity Transform Removal
// ============================================================================

/**
 * Check if a matrix transform is essentially an identity matrix
 */
function isIdentityMatrixValue(matrixStr: string): boolean {
  const match = matrixStr.match(
    /matrix\s*\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/
  );
  if (!match) return false;

  const values = match.slice(1).map((v) => parseFloat(v.trim()));
  const [a, b, c, d, tx, ty] = values;
  const epsilon = 1e-10;

  return (
    Math.abs(a - 1) < epsilon &&
    Math.abs(b) < epsilon &&
    Math.abs(c) < epsilon &&
    Math.abs(d - 1) < epsilon &&
    Math.abs(tx) < epsilon &&
    Math.abs(ty) < epsilon
  );
}

/**
 * Remove identity transforms and their associated transformOrigin
 */
function removeIdentityTransforms(content: string): string {
  let result = content;

  // Find and remove identity matrix transforms (handles scientific notation)
  const transformPattern = /['"]?transform['"]?\s*:\s*["']matrix\([^)]+\)["']\s*,?\s*/g;

  result = result.replace(transformPattern, (match) => {
    if (isIdentityMatrixValue(match)) {
      return "";
    }
    return match;
  });

  // Remove transformOrigin if no transform remains
  result = result.replace(
    /['"]?transformOrigin['"]?\s*:\s*["'][^"']+["']\s*,?\s*(?=\s*\}\})/g,
    ""
  );
  result = result.replace(
    /style=\{\{\s*['"]?transformOrigin['"]?\s*:\s*["'][^"']+["']\s*\}\}/g,
    ""
  );

  return result;
}

// ============================================================================
// Redundant Code Removal
// ============================================================================

/**
 * Remove redundant width/height: "auto"
 */
function removeAutoSizes(content: string): string {
  let result = content;
  result = result.replace(/width\s*:\s*["']auto["']\s*,?\s*/g, "");
  result = result.replace(/height\s*:\s*["']auto["']\s*,?\s*/g, "");
  result = result.replace(/'width'\s*:\s*["']auto["']\s*,?\s*/g, "");
  result = result.replace(/'height'\s*:\s*["']auto["']\s*,?\s*/g, "");
  result = result.replace(/\s+w-auto/g, "");
  result = result.replace(/\s+h-auto/g, "");
  result = result.replace(/w-auto\s+/g, "");
  result = result.replace(/h-auto\s+/g, "");
  return result;
}

/**
 * Remove duplicate position: absolute when className already has 'absolute'
 */
function removeDuplicateAbsolute(content: string): string {
  const pattern =
    /(className="[^"]*\babsolute\b[^"]*"[^>]*style=\{\{[^}]*)(position\s*:\s*["']absolute["']\s*,?\s*)([^}]*\}\})/g;
  return content.replace(pattern, (match, before, _pos, after) => {
    return before + after;
  });
}

/**
 * Remove outline debug styles
 */
function removeOutlineStyles(content: string): string {
  let result = content;
  result = result.replace(/\s*outline-\d+/g, "");
  result = result.replace(/\s*outline-\[rgb\([^)]+\)\]/g, "");
  result = result.replace(/\s*outlineOffset\s*:\s*["'][^"']*["']\s*,?/g, "");
  return result;
}

/**
 * Clean up empty style objects
 */
function cleanupEmptyStyles(content: string): string {
  let result = content;
  result = result.replace(/\s*style=\{\{\s*\}\}/g, "");
  result = result.replace(/\s*style=\{\{\s*,?\s*\}\}/g, "");
  result = result.replace(/,(\s*)\}\}/g, "$1}}");
  return result;
}

/**
 * Simplify common color values
 */
function simplifyColors(content: string): string {
  let result = content;
  result = result.replace(/text-\[rgb\(0,\s*0,\s*0\)\]/g, "text-black");
  result = result.replace(/bg-\[rgb\(0,\s*0,\s*0\)\]/g, "bg-black");
  result = result.replace(/text-\[rgb\(255,\s*255,\s*255\)\]/g, "text-white");
  result = result.replace(/bg-\[rgb\(255,\s*255,\s*255\)\]/g, "bg-white");
  return result;
}

/**
 * Remove unnecessary JSX string wrappers
 */
function simplifyJsxStrings(content: string): string {
  return content.replace(/\{"([^"{}]+)"\}/g, "$1");
}

// ============================================================================
// Nested Layer Optimization
// ============================================================================

const POSITION_PROPS = ["left", "top", "right", "bottom"];
const PARENT_PRIORITY_PROPS = ["zIndex"];
const POSITION_TYPE_CLASSES = ["absolute", "relative", "fixed", "sticky"];

interface ParsedStyle {
  [key: string]: string;
}

/**
 * Extract numeric value from px string
 */
function extractPxValue(value: string): number | null {
  const match = value.match(/^(-?[\d.]+)px$/);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Check if style has percentage-based positioning
 */
function hasPercentagePosition(style: ParsedStyle): boolean {
  for (const prop of POSITION_PROPS) {
    if (style[prop] && style[prop].includes("%")) return true;
  }
  return false;
}

/**
 * Check if className contains percentage-based positioning
 */
function hasPercentagePositionInClassName(className: string): boolean {
  for (const prop of POSITION_PROPS) {
    const pattern = new RegExp(`${prop}-\\[[^\\]]*%[^\\]]*\\]`);
    if (pattern.test(className)) return true;
  }
  return false;
}

/**
 * Check for relative+absolute centering patterns
 */
function isRelativeAbsolutePattern(
  outerClassName: string,
  outerStyle: ParsedStyle,
  innerClassName: string,
  innerStyle: ParsedStyle
): boolean {
  const outerHasRelative =
    outerClassName.includes("relative") || outerStyle.position === "relative";
  const innerHasAbsolute =
    innerClassName.includes("absolute") || innerStyle.position === "absolute";

  if (outerHasRelative && innerHasAbsolute) {
    if (hasPercentagePosition(innerStyle) || hasPercentagePositionInClassName(innerClassName)) {
      return true;
    }
    if (
      outerStyle.height === "0px" ||
      outerStyle.height === "0" ||
      outerClassName.includes("h-[0px]") ||
      outerClassName.includes("h-0")
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Parse className string
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

    for (const prop of POSITION_PROPS) {
      const match = cls.match(new RegExp(`^${prop}-\\[(-?[\\d.]+)px\\]$`));
      if (match) {
        positions[prop] = parseFloat(match[1]);
        isPositionClass = true;
        break;
      }
    }

    const zMatch = cls.match(/^z-\[(\d+)\]$/);
    if (zMatch) {
      zIndex = parseInt(zMatch[1], 10);
      isPositionClass = true;
    }

    const wMatch = cls.match(/^w-\[([^\]]+)\]$/);
    if (wMatch) {
      width = wMatch[1];
      isPositionClass = true;
    }

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
 * Parse style string from JSX
 */
function parseStyleString(styleStr: string): ParsedStyle {
  const style: ParsedStyle = {};
  if (!styleStr) return style;

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

  let pos = 0;
  while (pos < content.length) {
    while (pos < content.length && /\s/.test(content[pos])) pos++;
    if (pos >= content.length) break;

    let key = "";
    const keyStartChar = content[pos];

    if (keyStartChar === '"' || keyStartChar === "'") {
      const quote = keyStartChar;
      pos++;
      const keyStart = pos;
      while (pos < content.length && content[pos] !== quote) {
        if (content[pos] === "\\") pos++;
        pos++;
      }
      key = content.slice(keyStart, pos);
      pos++;
    } else if (/[\w]/.test(keyStartChar)) {
      const keyStart = pos;
      while (pos < content.length && /[\w]/.test(content[pos])) pos++;
      key = content.slice(keyStart, pos);
    } else {
      pos++;
      continue;
    }

    if (!key) break;

    while (pos < content.length && /[\s:]/.test(content[pos])) pos++;
    if (pos >= content.length) break;

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

    while (pos < content.length && /[\s,]/.test(content[pos])) pos++;

    if (key && value) {
      style[key] = value;
    }
  }

  return style;
}

/**
 * Serialize style object to JSX format
 */
function serializeStyle(style: ParsedStyle): string {
  const entries = Object.entries(style);
  if (entries.length === 0) return "";
  const pairs = entries.map(([key, value]) => `${key}: "${value}"`);
  return pairs.length <= 3
    ? `{{ ${pairs.join(", ")} }}`
    : `{{\n              ${pairs.join(",\n              ")},\n            }}`;
}

/**
 * Extract className from attributes
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
 * Extract style from attributes
 */
function extractStyleFromAttrs(attrs: string): ParsedStyle {
  const styleStart = attrs.indexOf("style={{");
  if (styleStart === -1) {
    const simpleMatch = attrs.match(/style=\{([^}]+)\}/);
    if (simpleMatch) return parseStyleString("{" + simpleMatch[1] + "}");
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
  return parseStyleString(attrs.slice(styleStart + 6, endPos));
}

/**
 * Merge classNames with position summing
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

  const positions: Record<string, number> = {};
  for (const prop of POSITION_PROPS) {
    const sum = (parentParsed.positions[prop] || 0) + (childParsed.positions[prop] || 0);
    if (sum !== 0) positions[prop] = sum;
  }

  const zIndex = parentParsed.zIndex ?? childParsed.zIndex;
  const width = childParsed.width ?? parentParsed.width;
  const height = childParsed.height ?? parentParsed.height;

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

  const positionType = childPositionType ?? parentPositionType;

  const mergedClasses: string[] = [];
  const seenBases = new Set<string>();

  for (const cls of childParsed.classes) {
    if (POSITION_TYPE_CLASSES.includes(cls)) {
      seenBases.add("__position_type__");
      continue;
    }
    mergedClasses.push(cls);
    seenBases.add(cls.split("-")[0].split("[")[0]);
  }

  for (const cls of parentParsed.classes) {
    if (POSITION_TYPE_CLASSES.includes(cls)) continue;
    const base = cls.split("-")[0].split("[")[0];
    if (!seenBases.has(base)) {
      mergedClasses.push(cls);
      seenBases.add(base);
    }
  }

  return { merged: mergedClasses.join(" "), positions, zIndex, width, height, positionType };
}

/**
 * Merge style objects
 */
function mergeStyles(
  parentStyle: ParsedStyle,
  childStyle: ParsedStyle
): {
  merged: ParsedStyle;
  width: string | null;
  height: string | null;
  positionType: string | null;
} {
  const merged: ParsedStyle = {};
  let width: string | null = null;
  let height: string | null = null;
  let parentPositionType: string | null = null;
  let childPositionType: string | null = null;

  for (const [key, value] of Object.entries(parentStyle)) {
    if (!POSITION_PROPS.includes(key)) {
      if (key === "width") width = value;
      else if (key === "height") height = value;
      else if (key === "position" && POSITION_TYPE_CLASSES.includes(value))
        parentPositionType = value;
      else merged[key] = value;
    }
  }

  for (const [key, value] of Object.entries(childStyle)) {
    if (!POSITION_PROPS.includes(key)) {
      if (PARENT_PRIORITY_PROPS.includes(key) && merged[key]) continue;
      if (key === "width") width = value;
      else if (key === "height") height = value;
      else if (key === "position" && POSITION_TYPE_CLASSES.includes(value))
        childPositionType = value;
      else merged[key] = value;
    }
  }

  return { merged, width, height, positionType: childPositionType ?? parentPositionType };
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
 * Check if element is a React component
 */
function isComponent(tag: string): boolean {
  return /^<[A-Z]/.test(tag.trim());
}

/**
 * Check for text-only span
 */
function isTextOnlySpan(content: string): { isMatch: boolean; className: string; text: string } {
  const trimmed = content.trim();
  // Use [\s\S] instead of . with s flag for cross-line matching
  const match = trimmed.match(/^<span\s+className="([^"]*)">\s*([\s\S]*?)\s*<\/span>$/);
  if (match && !match[2].includes("<")) return { isMatch: true, className: match[1], text: match[2].trim() };
  const match2 = trimmed.match(/^<span>\s*([\s\S]*?)\s*<\/span>$/);
  if (match2 && !match2[1].includes("<")) return { isMatch: true, className: "", text: match2[1].trim() };
  return { isMatch: false, className: "", text: "" };
}

/**
 * Get single child element
 */
function getSingleChild(innerContent: string): string | null {
  const trimmed = innerContent.trim();
  if (!trimmed.startsWith("<")) return null;

  const tagMatch = trimmed.match(/^<([a-zA-Z][a-zA-Z0-9]*)/);
  if (!tagMatch) return null;

  const tagName = tagMatch[1];
  // Use [\s\S] instead of . with s flag for cross-line matching
  const selfCloseMatch = trimmed.match(/^<[A-Z][a-zA-Z0-9]*[\s\S]*\/>$/);
  if (selfCloseMatch) return trimmed;

  const closeTag = `</${tagName}>`;
  if (!trimmed.endsWith(closeTag)) return null;

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
 * Find end of opening tag
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
 * Build merged element
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

  if (mergedClassName) classParts.push(mergedClassName);

  const finalPositionType = stylePositionType ?? classPositionType;
  if (finalPositionType) classParts.push(finalPositionType);

  for (const prop of POSITION_PROPS) {
    const sum = (classPositions[prop] || 0) + (stylePositions[prop] || 0);
    if (sum !== 0) classParts.push(`${prop}-[${sum}px]`);
  }

  if (zIndex !== null) classParts.push(`z-[${zIndex}]`);

  const finalWidth = styleWidth ?? classWidth;
  if (finalWidth) classParts.push(`w-[${finalWidth}]`);

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
 * Optimize nested single-child divs
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

      // Check for text-only span
      const spanCheck = isTextOnlySpan(child);
      if (spanCheck.isMatch) {
        const outerClassName = extractClassNameFromAttrs(outerAttrs);
        const outerStyle = extractStyleFromAttrs(outerAttrs);
        const mergedClassName =
          outerClassName + (spanCheck.className ? " " + spanCheck.className : "");
        const lineStart = result.lastIndexOf("\n", outerStart) + 1;
        const indent = result.slice(lineStart, outerStart);

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

          if (
            hasPercentagePosition(innerStyle) ||
            hasPercentagePositionInClassName(innerClassName)
          ) {
            continue;
          }

          if (
            isRelativeAbsolutePattern(outerClassName, outerStyle, innerClassName, innerStyle)
          ) {
            continue;
          }

          const {
            merged: mergedClassName,
            positions: classPositions,
            zIndex,
            width: classWidth,
            height: classHeight,
            positionType: classPositionType,
          } = mergeClassNames(outerClassName, innerClassName);

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
            positionType: stylePositionType,
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

  return result;
}

// ============================================================================
// Main Optimization Function
// ============================================================================

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
}

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
 * Optimize React component content
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

  // 9. Optimize nested divs (aggressive)
  if (opts.aggressive) {
    result = optimizeNestedDivs(result);
  }

  // 10. Final cleanup
  result = result
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n");
  result = result.replace(/\n{3,}/g, "\n\n");

  return result;
}

export default optimizeReactComponent;
