/**
 * Common AST utility functions for JSX/TSX parsing and manipulation
 */

import * as recast from "recast";
import * as babelParser from "recast/parsers/babel-ts";
import { namedTypes as n, builders as b } from "ast-types";
import type { ParsedStyleEntry, ParsedClassName } from "./types";

/**
 * Parse TypeScript/JSX code into AST
 */
export function parseCode(code: string): n.File {
  return recast.parse(code, {
    parser: babelParser,
  });
}

/**
 * Print AST back to code string
 */
export function printCode(ast: n.File): string {
  return recast.print(ast).code;
}

/**
 * Check if a JSX element is a div
 */
export function isDivElement(node: n.JSXElement): boolean {
  const opening = node.openingElement;
  return n.JSXIdentifier.check(opening.name) && opening.name.name === "div";
}

/**
 * Check if a JSX element is a span
 */
export function isSpanElement(node: n.JSXElement): boolean {
  const opening = node.openingElement;
  return n.JSXIdentifier.check(opening.name) && opening.name.name === "span";
}

/**
 * Check if a JSX element is a React component (starts with uppercase)
 */
export function isComponent(node: n.JSXElement): boolean {
  const opening = node.openingElement;
  if (n.JSXIdentifier.check(opening.name)) {
    return /^[A-Z]/.test(opening.name.name);
  }
  return n.JSXMemberExpression.check(opening.name);
}

/**
 * Get element tag name
 */
export function getTagName(node: n.JSXElement): string | null {
  const opening = node.openingElement;
  if (n.JSXIdentifier.check(opening.name)) {
    return opening.name.name;
  }
  if (n.JSXMemberExpression.check(opening.name)) {
    const parts: string[] = [];
    let current: n.JSXMemberExpression | n.JSXIdentifier = opening.name;
    while (n.JSXMemberExpression.check(current)) {
      parts.unshift(current.property.name);
      current = current.object as n.JSXMemberExpression | n.JSXIdentifier;
    }
    if (n.JSXIdentifier.check(current)) {
      parts.unshift(current.name);
    }
    return parts.join(".");
  }
  return null;
}

/**
 * Find a specific attribute in a JSX opening element
 */
export function findAttribute(
  opening: n.JSXOpeningElement,
  name: string
): n.JSXAttribute | null {
  const attrs = opening.attributes || [];
  for (const attr of attrs) {
    if (n.JSXAttribute.check(attr) && n.JSXIdentifier.check(attr.name) && attr.name.name === name) {
      return attr;
    }
  }
  return null;
}

/**
 * Check if attributes contain spread elements
 */
export function hasSpreadAttribute(opening: n.JSXOpeningElement): boolean {
  const attrs = opening.attributes || [];
  return attrs.some((attr) => n.JSXSpreadAttribute.check(attr));
}

/**
 * Extract className string from JSX element
 * Returns null if className is dynamic (contains expressions)
 */
export function extractClassName(node: n.JSXElement): string | null {
  const attr = findAttribute(node.openingElement, "className");
  if (!attr) return "";

  // Simple string literal: className="..."
  if (n.StringLiteral.check(attr.value)) {
    return attr.value.value;
  }

  // Template literal without expressions: className={`...`}
  if (n.JSXExpressionContainer.check(attr.value)) {
    const expr = attr.value.expression;
    if (n.TemplateLiteral.check(expr) && expr.expressions.length === 0) {
      return expr.quasis[0].value.raw;
    }
    // Any other expression is dynamic
    return null;
  }

  return "";
}

/**
 * Extract style entries from JSX element
 * Returns null if style has spread or dynamic values
 */
export function extractStyleEntries(node: n.JSXElement): ParsedStyleEntry[] | null {
  const attr = findAttribute(node.openingElement, "style");
  if (!attr) return [];

  if (!n.JSXExpressionContainer.check(attr.value)) return null;

  const expr = attr.value.expression;
  if (!n.ObjectExpression.check(expr)) return null;

  const entries: ParsedStyleEntry[] = [];

  for (const prop of expr.properties) {
    // Spread element means we can't safely optimize
    if (n.SpreadElement.check(prop) || n.SpreadProperty.check(prop)) return null;

    if (n.ObjectProperty.check(prop)) {
      // Get key
      let key: string | null = null;
      if (n.Identifier.check(prop.key)) {
        key = prop.key.name;
      } else if (n.StringLiteral.check(prop.key)) {
        key = prop.key.value;
      }

      if (!key) continue;

      // Only handle string literal values
      if (n.StringLiteral.check(prop.value)) {
        entries.push({
          key,
          value: prop.value.value,
        });
      }
    }
  }

  return entries;
}

/**
 * Get single JSX child element (ignoring whitespace text)
 */
export function getSingleJSXChild(node: n.JSXElement): n.JSXElement | null {
  const children = node.children || [];
  const significantChildren = children.filter((child) => {
    if (n.JSXText.check(child)) {
      return child.value.trim().length > 0;
    }
    return true;
  });

  if (significantChildren.length !== 1) return null;

  const child = significantChildren[0];
  if (n.JSXElement.check(child)) {
    return child;
  }

  return null;
}

/**
 * Check if element is a text-only span
 */
export function isTextOnlySpan(node: n.JSXElement): { isMatch: boolean; text: string } {
  if (!isSpanElement(node)) {
    return { isMatch: false, text: "" };
  }

  const children = node.children || [];
  let textContent = "";
  for (const child of children) {
    if (n.JSXText.check(child)) {
      textContent += child.value;
    } else if (n.JSXExpressionContainer.check(child) && n.StringLiteral.check(child.expression)) {
      textContent += child.expression.value;
    } else {
      return { isMatch: false, text: "" };
    }
  }

  return { isMatch: true, text: textContent.trim() };
}

/**
 * Check if style has percentage-based positioning
 */
export function hasPercentagePosition(entries: ParsedStyleEntry[]): boolean {
  const positionProps = ["left", "top", "right", "bottom"];
  for (const entry of entries) {
    if (positionProps.includes(entry.key) && entry.value.includes("%")) {
      return true;
    }
  }
  return false;
}

/**
 * Check if className has percentage-based positioning
 */
export function hasPercentagePositionInClassName(className: string): boolean {
  const positionProps = ["left", "top", "right", "bottom"];
  for (const prop of positionProps) {
    const pattern = new RegExp(`${prop}-\\[[^\\]]*%[^\\]]*\\]`);
    if (pattern.test(className)) {
      return true;
    }
  }
  return false;
}

/**
 * Extract px value from string like "10px"
 */
export function extractPxValue(value: string): number | null {
  const match = value.match(/^(-?[\d.]+)px$/);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Parse className string into structured data
 */
export function parseClassName(className: string): ParsedClassName {
  const classes = className.split(/\s+/).filter(Boolean);
  const positions: Record<string, number> = {};
  let zIndex: number | null = null;
  let width: string | null = null;
  let height: string | null = null;
  let positionType: string | null = null;

  const nonPositionClasses: string[] = [];
  const positionProps = ["left", "top", "right", "bottom"];
  const positionTypes = ["absolute", "relative", "fixed", "sticky"];

  for (const cls of classes) {
    let isPositionClass = false;

    for (const prop of positionProps) {
      const match = cls.match(new RegExp(`^${prop}-\\[(-?[\\d.]+)px\\]$`));
      if (match) {
        positions[prop] = parseFloat(match[1]);
        isPositionClass = true;
        break;
      }
    }

    if (positionTypes.includes(cls)) {
      positionType = cls;
      isPositionClass = true;
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

  return { classes: nonPositionClasses, positions, zIndex, width, height, positionType };
}

/**
 * Create JSX string literal attribute
 */
export function createStringAttribute(name: string, value: string): n.JSXAttribute {
  return b.jsxAttribute(b.jsxIdentifier(name), b.stringLiteral(value));
}

/**
 * Create JSX style attribute from entries
 */
export function createStyleAttribute(entries: ParsedStyleEntry[]): n.JSXAttribute | null {
  if (entries.length === 0) return null;

  const properties = entries.map((entry) =>
    b.objectProperty(b.identifier(entry.key), b.stringLiteral(entry.value))
  );

  return b.jsxAttribute(
    b.jsxIdentifier("style"),
    b.jsxExpressionContainer(b.objectExpression(properties))
  );
}

/**
 * Remove an attribute from JSX opening element
 */
export function removeAttribute(opening: n.JSXOpeningElement, name: string): void {
  const attrs = opening.attributes || [];
  opening.attributes = attrs.filter((attr) => {
    if (n.JSXAttribute.check(attr) && n.JSXIdentifier.check(attr.name)) {
      return attr.name.name !== name;
    }
    return true;
  });
}

/**
 * Update or create className attribute
 */
export function setClassName(opening: n.JSXOpeningElement, value: string): void {
  const attr = findAttribute(opening, "className");
  if (attr && n.StringLiteral.check(attr.value)) {
    attr.value.value = value;
  } else if (attr) {
    attr.value = b.stringLiteral(value);
  } else {
    if (!opening.attributes) {
      opening.attributes = [];
    }
    opening.attributes.push(createStringAttribute("className", value));
  }
}

/**
 * Check if this is a relative+absolute centering pattern that shouldn't be merged
 */
export function isRelativeAbsolutePattern(
  outerClassName: string,
  outerStyle: ParsedStyleEntry[],
  innerClassName: string,
  innerStyle: ParsedStyleEntry[]
): boolean {
  const outerHasRelative =
    outerClassName.includes("relative") ||
    outerStyle.some((s) => s.key === "position" && s.value === "relative");
  const innerHasAbsolute =
    innerClassName.includes("absolute") ||
    innerStyle.some((s) => s.key === "position" && s.value === "absolute");

  if (outerHasRelative && innerHasAbsolute) {
    if (hasPercentagePosition(innerStyle) || hasPercentagePositionInClassName(innerClassName)) {
      return true;
    }
    if (
      outerStyle.some((s) => s.key === "height" && (s.value === "0px" || s.value === "0")) ||
      outerClassName.includes("h-[0px]") ||
      outerClassName.includes("h-0")
    ) {
      return true;
    }
  }

  return false;
}
