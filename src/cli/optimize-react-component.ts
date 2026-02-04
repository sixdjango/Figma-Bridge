#!/usr/bin/env ts-node
/**
 * Comprehensive React Component Optimizer for Figma-generated code
 *
 * Optimizations:
 * 1. Remove empty placeholder divs (shape rect with no children)
 * 2. Remove identity transform matrices
 * 3. Remove redundant width/height: "auto"
 * 4. Remove zero position values (left: 0, top: 0)
 * 5. Remove duplicate position: absolute (when className has 'absolute')
 * 6. Remove debug class names (optional)
 * 7. Simplify SVG wrapper styles
 * 8. Remove outline debug styles
 * 9. Convert all inline styles to Tailwind classes
 *
 * Usage: npm run optimize-component -- <path-to-tsx-file> [options]
 * Options:
 *   --remove-debug-classes  Remove debug class names like 'frame', 'shape', etc.
 *   --aggressive            Enable all aggressive optimizations
 */

import * as fs from "fs";
import * as path from "path";

interface OptimizeOptions {
  removeDebugClasses: boolean;
  aggressive: boolean;
  inPlace: boolean;
}

const DEBUG_CLASS_NAMES = [
  "frame",
  "shape",
  "svg-container",
  "content-layer",
  "text",
  "rect",
];

/**
 * Check if a transform is essentially an identity matrix
 */
function isIdentityMatrix(transform: string): boolean {
  if (!transform) return false;
  const match = transform.match(/matrix\s*\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/);
  if (!match) return false;

  const [, a, b, c, d, tx, ty] = match.map((v) => parseFloat(v));
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
 * Remove identity transform from style string
 */
function removeIdentityTransform(content: string): string {
  let result = content;

  const transformPattern = /transform\s*:\s*\n?\s*["']?matrix\([^)]+\)["']?\s*,?/g;

  result = result.replace(transformPattern, (match) => {
    const matrixMatch = match.match(/matrix\(([^)]+)\)/);
    if (matrixMatch) {
      const values = matrixMatch[1].split(",").map((v) => parseFloat(v.trim()));
      const [a, b, c, d, tx, ty] = values;
      const epsilon = 1e-10;

      if (
        Math.abs(a - 1) < epsilon &&
        Math.abs(b) < epsilon &&
        Math.abs(c) < epsilon &&
        Math.abs(d - 1) < epsilon &&
        Math.abs(tx) < epsilon &&
        Math.abs(ty) < epsilon
      ) {
        return "";
      }
    }
    return match;
  });

  result = result.replace(/transformOrigin\s*:\s*["'][^"']+["']\s*,?\s*(?=\n\s*(?:width|height|}\s*>))/g, "");

  return result;
}

/**
 * Remove redundant width/height: "auto"
 */
function removeAutoSizes(content: string): string {
  let result = content;
  // Remove from style
  result = result.replace(/width\s*:\s*["']auto["']\s*,?\s*/g, "");
  result = result.replace(/height\s*:\s*["']auto["']\s*,?\s*/g, "");
  result = result.replace(/'width'\s*:\s*["']auto["']\s*,?\s*/g, "");
  result = result.replace(/'height'\s*:\s*["']auto["']\s*,?\s*/g, "");
  // Remove from className
  result = result.replace(/\s+w-auto/g, "");
  result = result.replace(/\s+h-auto/g, "");
  result = result.replace(/w-auto\s+/g, "");
  result = result.replace(/h-auto\s+/g, "");
  return result;
}

/**
 * Remove zero position values that are redundant
 */
function removeZeroPositions(content: string): string {
  let result = content;
  result = result.replace(/left\s*:\s*["']0px["']\s*,?\s*/g, "");
  result = result.replace(/top\s*:\s*["']0px["']\s*,?\s*/g, "");
  result = result.replace(/\s+left-\[0px\]/g, "");
  result = result.replace(/\s+top-\[0px\]/g, "");
  return result;
}

/**
 * Remove duplicate position: absolute when className already has 'absolute'
 */
function removeDuplicateAbsolute(content: string): string {
  let result = content;
  const pattern = /(className="[^"]*\babsolute\b[^"]*"[^>]*style=\{\{[^}]*)(position\s*:\s*["']absolute["']\s*,?\s*)([^}]*\}\})/g;

  result = result.replace(pattern, (match, before, _pos, after) => {
    return before + after;
  });

  return result;
}

/**
 * Check if a style string contains visual properties
 * These properties make an element visually meaningful even without children
 */
function hasVisualStyles(styleStr: string): boolean {
  const lowerStyle = styleStr.toLowerCase();

  // Background properties
  const backgroundProps = [
    "background",
    "backgroundcolor",
    "backgroundimage",
    "backgroundgradient",
    "linear-gradient",
    "radial-gradient",
    "conic-gradient",
    "repeating-linear-gradient",
    "repeating-radial-gradient",
  ];

  // Border properties
  const borderProps = [
    "border",
    "borderwidth",
    "bordercolor",
    "borderstyle",
    "bordertop",
    "borderright",
    "borderbottom",
    "borderleft",
    "borderradius",
    "outline",        // Could be visual, not just debug
    "outlinecolor",
    "outlinewidth",
  ];

  // Shadow properties
  const shadowProps = [
    "boxshadow",
    "textshadow",
    "dropshadow",
  ];

  // Opacity and visibility
  const visibilityProps = [
    "opacity",
    "visibility",
  ];

  // Filter and effects
  const filterProps = [
    "filter",
    "backdropfilter",
    "webkitbackdropfilter",
    "mixblendmode",
    "backgroundblendmode",
    "isolation",
  ];

  // Clip and mask
  const clipProps = [
    "clippath",
    "clip",
    "mask",
    "maskimage",
    "webkitmaskimage",
  ];

  // SVG properties (if used in style)
  const svgProps = [
    "fill",
    "stroke",
    "strokewidth",
  ];

  // Color indicators (might appear in values)
  const colorIndicators = [
    "rgba(",
    "rgb(",
    "hsla(",
    "hsl(",
    "url(",           // Background image
    "#",              // Hex color (be careful, might match other things)
  ];

  // Image and content
  const contentProps = [
    "content",
    "backgroundimage",
    "listStyleImage",
  ];

  // Combine all visual properties
  const allVisualProps = [
    ...backgroundProps,
    ...borderProps,
    ...shadowProps,
    ...visibilityProps,
    ...filterProps,
    ...clipProps,
    ...svgProps,
    ...contentProps,
  ];

  // Check property names
  if (allVisualProps.some(prop => lowerStyle.includes(prop))) {
    return true;
  }

  // Check color value indicators (more careful matching)
  for (const indicator of colorIndicators) {
    if (indicator === "#") {
      // Match hex colors like #fff, #ffffff, #fff000
      if (/[:#]\s*#[0-9a-f]{3,8}/i.test(styleStr)) {
        return true;
      }
    } else if (lowerStyle.includes(indicator)) {
      return true;
    }
  }

  return false;
}

/**
 * Remove empty placeholder divs
 */
function removeEmptyPlaceholders(content: string): string {
  let result = content;
  let changed = true;

  while (changed) {
    changed = false;

    const emptyDivPattern = /<div\s+className="[^"]*\bshape\s+rect\b[^"]*"[^>]*style=\{\{([^}]*)\}\}[^>]*>\s*<\/div>/g;

    const newResult = result.replace(emptyDivPattern, (match, styleContent) => {
      if (hasVisualStyles(styleContent)) {
        return match;
      }
      return "";
    });

    if (newResult !== result) {
      result = newResult;
      changed = true;
    }

    const emptyDivNoStyle = /<div\s+className="[^"]*\bshape\s+rect\b[^"]*"\s*>\s*<\/div>/g;
    const newResult2 = result.replace(emptyDivNoStyle, "");

    if (newResult2 !== result) {
      result = newResult2;
      changed = true;
    }
  }

  return result;
}

/**
 * Remove debug class names
 */
function removeDebugClasses(content: string, classNames: string[]): string {
  let result = content;

  for (const className of classNames) {
    result = result.replace(/className="([^"]+)"/g, (match, classes) => {
      const filtered = classes
        .split(/\s+/)
        .filter((c: string) => !classNames.includes(c))
        .join(" ");
      return `className="${filtered}"`;
    });
  }

  result = result.replace(/className=""\s*/g, "");
  result = result.replace(/className="\s+"/g, 'className=""');

  return result;
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
 * Check if a matrix transform is essentially an identity matrix
 * Handles scientific notation like 1.6081230200044232e-16
 */
function isIdentityMatrixValue(matrixStr: string): boolean {
  const match = matrixStr.match(/matrix\s*\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/);
  if (!match) return false;

  const values = match.slice(1).map(v => parseFloat(v.trim()));
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
  // Pattern: 'transform': "matrix(...)" or transform: "matrix(...)"
  const transformPattern = /['"]?transform['"]?\s*:\s*["']matrix\([^)]+\)["']\s*,?\s*/g;

  result = result.replace(transformPattern, (match) => {
    if (isIdentityMatrixValue(match)) {
      return "";
    }
    return match;
  });

  // Remove transformOrigin if no transform remains in the same style block
  // This is a simplified approach - remove transformOrigin that appears alone
  result = result.replace(/['"]?transformOrigin['"]?\s*:\s*["'][^"']+["']\s*,?\s*(?=\s*\}\})/g, "");

  // Also handle cases where transformOrigin is followed by only whitespace and closing
  result = result.replace(/style=\{\{\s*['"]?transformOrigin['"]?\s*:\s*["'][^"']+["']\s*\}\}/g, "");

  return result;
}

/**
 * Simplify common color values
 */
function simplifyColors(content: string): string {
  let result = content;

  // rgb(0,0,0) -> black
  result = result.replace(/text-\[rgb\(0,\s*0,\s*0\)\]/g, "text-black");
  result = result.replace(/bg-\[rgb\(0,\s*0,\s*0\)\]/g, "bg-black");

  // rgb(255,255,255) -> white
  result = result.replace(/text-\[rgb\(255,\s*255,\s*255\)\]/g, "text-white");
  result = result.replace(/bg-\[rgb\(255,\s*255,\s*255\)\]/g, "bg-white");

  return result;
}

/**
 * Remove unnecessary JSX string wrappers like {"text"} -> text
 */
function simplifyJsxStrings(content: string): string {
  // Replace {" ... "} with just the text (for simple text content)
  // Only for content that doesn't contain special characters
  return content.replace(/\{"([^"{}]+)"\}/g, "$1");
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
 * Parse style object content into key-value pairs
 * Handles both quoted and unquoted keys: { 'key': "value" } or { key: "value" }
 */
function parseStyleContent(styleContent: string): Array<{ key: string; value: string }> {
  const result: Array<{ key: string; value: string }> = [];
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
      "block": "block",
      "flex": "flex",
      "inline": "inline",
      "inline-block": "inline-block",
      "inline-flex": "inline-flex",
      "grid": "grid",
      "hidden": "hidden",
      "none": "hidden",
    };
    if (displayMap[value] && !existingClasses.includes(displayMap[value])) {
      return displayMap[value];
    }
    return "";
  }

  // overflow
  if (key === "overflow") {
    const overflowMap: Record<string, string> = {
      "hidden": "overflow-hidden",
      "auto": "overflow-auto",
      "scroll": "overflow-scroll",
      "visible": "overflow-visible",
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
      "center": "items-center",
      "baseline": "items-baseline",
      "stretch": "items-stretch",
    };
    if (alignMap[value]) return alignMap[value];
  }
  if (key === "justifyContent") {
    const justifyMap: Record<string, string> = {
      "flex-start": "justify-start",
      "flex-end": "justify-end",
      "center": "justify-center",
      "space-between": "justify-between",
      "space-around": "justify-around",
      "space-evenly": "justify-evenly",
    };
    if (justifyMap[value]) return justifyMap[value];
  }
  if (key === "alignSelf") {
    const selfMap: Record<string, string> = {
      "auto": "self-auto",
      "flex-start": "self-start",
      "flex-end": "self-end",
      "center": "self-center",
      "stretch": "self-stretch",
      "baseline": "self-baseline",
    };
    if (selfMap[value]) return selfMap[value];
  }

  // text properties
  if (key === "textAlign") {
    const textAlignMap: Record<string, string> = {
      "left": "text-left",
      "center": "text-center",
      "right": "text-right",
      "justify": "text-justify",
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
      "normal": "whitespace-normal",
      "nowrap": "whitespace-nowrap",
      "pre": "whitespace-pre",
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
  const elementPattern = /(<(?:div|span|button|a|[A-Z][a-zA-Z0-9]*)\s+)([^>]*className="([^"]*)"[^>]*style=\{\{)([\s\S]*?)(\}\}[^>]*\/?[^>]*>)/g;

  result = result.replace(elementPattern, (match, tagStart, attrsBeforeStyle, existingClasses, styleContent, attrsAfterStyle) => {
    const tailwindClasses: string[] = [];
    const remainingStyles: Array<{ key: string; value: string }> = [];

    const styleProps = parseStyleContent(styleContent);

    for (const { key, value } of styleProps) {
      const twClass = styleToTailwind(key, value, existingClasses);
      if (twClass === null) {
        remainingStyles.push({ key, value });
      } else if (twClass !== "") {
        tailwindClasses.push(twClass);
      }
    }

    const newClasses = existingClasses + (tailwindClasses.length > 0 ? " " + tailwindClasses.join(" ") : "");
    const extraAttrs = attrsAfterStyle.replace(/^\}\}\s*/, "").replace(/>$/, "").replace(/\/>$/, "").trim();
    const isSelfClosing = attrsAfterStyle.trim().endsWith("/>");

    let newElement: string;

    if (remainingStyles.length === 0) {
      if (extraAttrs) {
        newElement = tagStart + `className="${newClasses}" ${extraAttrs}${isSelfClosing ? "/>" : ">"}`;
      } else {
        newElement = tagStart + `className="${newClasses}"${isSelfClosing ? "/>" : ">"}`;
      }
    } else {
      const styleStr = remainingStyles.map(({ key, value }) => `${key}: "${value}"`).join(", ");
      if (extraAttrs) {
        newElement = tagStart + `className="${newClasses}" style={{ ${styleStr} }} ${extraAttrs}${isSelfClosing ? "/>" : ">"}`;
      } else {
        newElement = tagStart + `className="${newClasses}" style={{ ${styleStr} }}${isSelfClosing ? "/>" : ">"}`;
      }
    }

    return newElement;
  });

  // Pattern for elements with style but no className (PascalCase components)
  const styleOnlyPattern = /(<(?:[A-Z][a-zA-Z0-9]*)\s+)style=\{\{([\s\S]*?)\}\}(\s*\/?>)/g;

  result = result.replace(styleOnlyPattern, (match, tagStart, styleContent, tagEnd) => {
    const tailwindClasses: string[] = [];
    const remainingStyles: Array<{ key: string; value: string }> = [];

    const styleProps = parseStyleContent(styleContent);

    for (const { key, value } of styleProps) {
      const twClass = styleToTailwind(key, value, "");
      if (twClass === null) {
        remainingStyles.push({ key, value });
      } else if (twClass !== "") {
        tailwindClasses.push(twClass);
      }
    }

    if (tailwindClasses.length === 0 && remainingStyles.length === styleProps.length) {
      return match;
    }

    let newElement: string;
    const classNameAttr = tailwindClasses.length > 0 ? `className="${tailwindClasses.join(" ")}"` : "";

    if (remainingStyles.length === 0) {
      newElement = tagStart + classNameAttr + tagEnd;
    } else {
      const styleStr = remainingStyles.map(({ key, value }) => `${key}: "${value}"`).join(", ");
      if (classNameAttr) {
        newElement = tagStart + classNameAttr + ` style={{ ${styleStr} }}` + tagEnd;
      } else {
        newElement = tagStart + `style={{ ${styleStr} }}` + tagEnd;
      }
    }

    return newElement;
  });

  return result;
}

/**
 * Main optimization function
 */
function optimizeComponent(content: string, options: OptimizeOptions): string {
  let result = content;
  const originalLength = content.length;

  console.log("Running optimizations...");

  // 1. Remove identity transforms
  const beforeTransform = result.length;
  result = removeIdentityTransform(result);
  if (result.length < beforeTransform) {
    console.log("  ✓ Removed identity transforms");
  }

  // 2. Remove redundant auto sizes
  const beforeAuto = result.length;
  result = removeAutoSizes(result);
  if (result.length < beforeAuto) {
    console.log("  ✓ Removed redundant width/height: auto");
  }

  // 3. Remove zero positions (only if aggressive)
  if (options.aggressive) {
    const beforeZero = result.length;
    result = removeZeroPositions(result);
    if (result.length < beforeZero) {
      console.log("  ✓ Removed zero position values");
    }
  }

  // 4. Remove duplicate position: absolute
  const beforeDupAbs = result.length;
  result = removeDuplicateAbsolute(result);
  if (result.length < beforeDupAbs) {
    console.log("  ✓ Removed duplicate position: absolute");
  }

  // 5. Remove empty placeholders
  if (options.aggressive) {
    const beforeEmpty = result.length;
    result = removeEmptyPlaceholders(result);
    if (result.length < beforeEmpty) {
      console.log("  ✓ Removed empty placeholder divs");
    }
  }

  // 6. Remove debug classes (optional)
  if (options.removeDebugClasses) {
    const beforeDebug = result.length;
    result = removeDebugClasses(result, DEBUG_CLASS_NAMES);
    if (result.length < beforeDebug) {
      console.log("  ✓ Removed debug class names");
    }
  }

  // 7. Remove outline styles
  const beforeOutline = result.length;
  result = removeOutlineStyles(result);
  if (result.length < beforeOutline) {
    console.log("  ✓ Removed outline debug styles");
  }

  // 8. Remove identity transforms
  const beforeTransforms = result.length;
  result = removeIdentityTransforms(result);
  if (result.length < beforeTransforms) {
    console.log("  ✓ Removed identity transforms");
  }

  // 9. Convert inline styles to Tailwind
  const beforeTailwind = result.length;
  result = convertStylesToTailwind(result);
  if (result.length !== beforeTailwind) {
    console.log("  ✓ Converted inline styles to Tailwind classes");
  }

  // 10. Simplify colors
  const beforeColors = result.length;
  result = simplifyColors(result);
  if (result.length < beforeColors) {
    console.log("  ✓ Simplified color values");
  }

  // 11. Simplify JSX strings
  const beforeJsx = result.length;
  result = simplifyJsxStrings(result);
  if (result.length < beforeJsx) {
    console.log("  ✓ Simplified JSX string wrappers");
  }

  // 12. Clean up empty styles
  result = cleanupEmptyStyles(result);

  const reduction = originalLength - result.length;
  const percentage = ((reduction / originalLength) * 100).toFixed(1);
  console.log(`\nTotal size reduction: ${reduction} bytes (${percentage}%)`);

  return result;
}

/**
 * Generate optimization report
 */
function generateReport(original: string, optimized: string): void {
  console.log("\n=== Optimization Report ===\n");

  const countPattern = (content: string, pattern: RegExp) => (content.match(pattern) || []).length;

  const stats = [
    {
      name: "Identity transforms",
      original: countPattern(original, /matrix\s*\(\s*1\s*,/g),
      optimized: countPattern(optimized, /matrix\s*\(\s*1\s*,/g),
    },
    {
      name: 'width/height: "auto"',
      original: countPattern(original, /(?:width|height)\s*:\s*["']auto["']/g),
      optimized: countPattern(optimized, /(?:width|height)\s*:\s*["']auto["']/g),
    },
    {
      name: "Empty shape divs",
      original: countPattern(original, /<div[^>]*shape\s+rect[^>]*>\s*<\/div>/g),
      optimized: countPattern(optimized, /<div[^>]*shape\s+rect[^>]*>\s*<\/div>/g),
    },
    {
      name: "Duplicate absolute",
      original: countPattern(original, /absolute[^>]*position\s*:\s*["']absolute["']/g),
      optimized: countPattern(optimized, /absolute[^>]*position\s*:\s*["']absolute["']/g),
    },
    {
      name: "Outline styles",
      original: countPattern(original, /outline-\[/g),
      optimized: countPattern(optimized, /outline-\[/g),
    },
  ];

  console.log("Pattern                    Original  Optimized  Removed");
  console.log("─".repeat(55));

  for (const stat of stats) {
    const removed = stat.original - stat.optimized;
    console.log(
      `${stat.name.padEnd(25)} ${stat.original.toString().padStart(8)}  ${stat.optimized.toString().padStart(9)}  ${removed > 0 ? `-${removed}` : "0"}`
    );
  }

  console.log("─".repeat(55));

  const originalLines = original.split("\n").length;
  const optimizedLines = optimized.split("\n").length;
  console.log(`\nLines: ${originalLines} → ${optimizedLines} (${originalLines - optimizedLines} removed)`);
}

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): { filePath: string; options: OptimizeOptions } {
  const options: OptimizeOptions = {
    removeDebugClasses: false,
    aggressive: false,
    inPlace: false,
  };

  let filePath = "";

  for (const arg of args) {
    if (arg === "--remove-debug-classes") {
      options.removeDebugClasses = true;
    } else if (arg === "--aggressive") {
      options.aggressive = true;
    } else if (arg === "--in-place") {
      options.inPlace = true;
    } else if (!arg.startsWith("--")) {
      filePath = arg;
    }
  }

  return { filePath, options };
}

// Main entry point
const args = process.argv.slice(2);

if (args.length === 0 || args.includes("--help")) {
  console.log(`
React Component Optimizer for Figma-generated code

Usage: npm run optimize-component -- <path-to-tsx-file> [options]

Options:
  --remove-debug-classes  Remove debug class names (frame, shape, svg-container, etc.)
  --aggressive            Enable aggressive optimizations (remove empty divs, zero positions)
  --in-place              Overwrite the original file instead of creating .optimized.tsx
  --help                  Show this help message

Examples:
  npm run optimize-component -- src/components/Layout.tsx
  npm run optimize-component -- src/components/Layout.tsx --aggressive
  npm run optimize-component -- src/components/Layout.tsx --remove-debug-classes --aggressive
`);
  process.exit(0);
}

const { filePath, options } = parseArgs(args);

if (!filePath) {
  console.error("Error: No file path provided");
  process.exit(1);
}

const resolvedPath = path.resolve(filePath);

if (!fs.existsSync(resolvedPath)) {
  console.error(`Error: File not found: ${resolvedPath}`);
  process.exit(1);
}

console.log(`Optimizing: ${resolvedPath}`);
console.log(`Options: ${JSON.stringify(options)}\n`);

const content = fs.readFileSync(resolvedPath, "utf-8");
const optimized = optimizeComponent(content, options);

generateReport(content, optimized);

const outputPath = options.inPlace ? resolvedPath : resolvedPath.replace(/\.tsx$/, ".optimized.tsx");
fs.writeFileSync(outputPath, optimized);
console.log(`\nOutput written to: ${outputPath}`);
