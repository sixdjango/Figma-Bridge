/**
 * Simple AST-based transforms for React component optimization
 */

import * as recast from "recast";
import { namedTypes as n, builders as b } from "ast-types";
import { parseCode, printCode, findAttribute } from "./ast-utils";

/**
 * Check if a matrix transform is essentially an identity matrix
 */
function isIdentityMatrix(value: string): boolean {
  const match = value.match(
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
 * Get property key name from ObjectProperty
 */
function getPropertyKeyName(prop: n.ObjectProperty | n.ObjectMethod): string | null {
  if (n.Identifier.check(prop.key)) {
    return prop.key.name;
  }
  if (n.StringLiteral.check(prop.key)) {
    return prop.key.value;
  }
  return null;
}

/**
 * Remove identity transforms from style objects
 */
export function removeIdentityTransforms(code: string): string {
  const ast = parseCode(code);
  let modified = false;

  recast.visit(ast, {
    visitObjectProperty(path) {
      const node = path.node;
      const keyName = getPropertyKeyName(node);

      if (keyName === "transform") {
        if (n.StringLiteral.check(node.value) && isIdentityMatrix(node.value.value)) {
          path.prune();
          modified = true;
          return false;
        }
      }

      this.traverse(path);
    },
  });

  // Second pass: remove orphaned transformOrigin
  if (modified) {
    recast.visit(ast, {
      visitObjectExpression(path) {
        const props = path.node.properties;
        const hasTransform = props.some((p) => {
          if (n.ObjectProperty.check(p)) {
            return getPropertyKeyName(p) === "transform";
          }
          return false;
        });

        if (!hasTransform) {
          path.node.properties = props.filter((p) => {
            if (n.ObjectProperty.check(p)) {
              return getPropertyKeyName(p) !== "transformOrigin";
            }
            return true;
          });
        }

        this.traverse(path);
      },
    });
  }

  return printCode(ast);
}

/**
 * Remove redundant width/height: "auto" from style objects
 */
export function removeAutoSizes(code: string): string {
  const ast = parseCode(code);

  recast.visit(ast, {
    visitObjectProperty(path) {
      const node = path.node;
      const keyName = getPropertyKeyName(node);

      if (
        (keyName === "width" || keyName === "height") &&
        n.StringLiteral.check(node.value) &&
        node.value.value === "auto"
      ) {
        path.prune();
        return false;
      }

      this.traverse(path);
    },
  });

  // Also remove w-auto and h-auto from className
  recast.visit(ast, {
    visitJSXAttribute(path) {
      const node = path.node;
      if (n.JSXIdentifier.check(node.name) && node.name.name === "className") {
        if (n.StringLiteral.check(node.value)) {
          const newValue = node.value.value
            .split(/\s+/)
            .filter((cls) => cls !== "w-auto" && cls !== "h-auto")
            .join(" ");
          node.value.value = newValue;
        }
      }
      this.traverse(path);
    },
  });

  return printCode(ast);
}

/**
 * Remove duplicate position: absolute when className already has 'absolute'
 */
export function removeDuplicateAbsolute(code: string): string {
  const ast = parseCode(code);

  recast.visit(ast, {
    visitJSXElement(path) {
      const opening = path.node.openingElement;
      const classAttr = findAttribute(opening, "className");
      const styleAttr = findAttribute(opening, "style");

      if (!classAttr || !styleAttr) {
        this.traverse(path);
        return;
      }

      // Check if className contains "absolute"
      let hasAbsoluteClass = false;
      if (n.StringLiteral.check(classAttr.value)) {
        hasAbsoluteClass = classAttr.value.value.split(/\s+/).includes("absolute");
      }

      if (hasAbsoluteClass && n.JSXExpressionContainer.check(styleAttr.value)) {
        const expr = styleAttr.value.expression;
        if (n.ObjectExpression.check(expr)) {
          // Remove position: "absolute" from style
          expr.properties = expr.properties.filter((prop) => {
            if (n.ObjectProperty.check(prop)) {
              const keyName = getPropertyKeyName(prop);
              if (
                keyName === "position" &&
                n.StringLiteral.check(prop.value) &&
                prop.value.value === "absolute"
              ) {
                return false;
              }
            }
            return true;
          });
        }
      }

      this.traverse(path);
    },
  });

  return printCode(ast);
}

/**
 * Remove outline debug styles from className and style
 */
export function removeOutlineStyles(code: string): string {
  const ast = parseCode(code);

  // Remove outline classes from className
  recast.visit(ast, {
    visitJSXAttribute(path) {
      const node = path.node;
      if (n.JSXIdentifier.check(node.name) && node.name.name === "className") {
        if (n.StringLiteral.check(node.value)) {
          const classes = node.value.value.split(/\s+/);
          const filtered = classes.filter((cls) => {
            if (/^outline-\d+$/.test(cls)) return false;
            if (/^outline-\[rgb\([^)]+\)\]$/.test(cls)) return false;
            return true;
          });
          node.value.value = filtered.join(" ");
        }
      }
      this.traverse(path);
    },
  });

  // Remove outlineOffset from style objects
  recast.visit(ast, {
    visitObjectProperty(path) {
      const node = path.node;
      const keyName = getPropertyKeyName(node);

      if (keyName === "outlineOffset") {
        path.prune();
        return false;
      }

      this.traverse(path);
    },
  });

  return printCode(ast);
}

/**
 * Simplify common color values in className
 */
export function simplifyColors(code: string): string {
  const ast = parseCode(code);

  const colorReplacements: [RegExp, string][] = [
    [/text-\[rgb\(0,\s*0,\s*0\)\]/g, "text-black"],
    [/bg-\[rgb\(0,\s*0,\s*0\)\]/g, "bg-black"],
    [/text-\[rgb\(255,\s*255,\s*255\)\]/g, "text-white"],
    [/bg-\[rgb\(255,\s*255,\s*255\)\]/g, "bg-white"],
  ];

  recast.visit(ast, {
    visitJSXAttribute(path) {
      const node = path.node;
      if (n.JSXIdentifier.check(node.name) && node.name.name === "className") {
        if (n.StringLiteral.check(node.value)) {
          let value = node.value.value;
          for (const [pattern, replacement] of colorReplacements) {
            value = value.replace(pattern, replacement);
          }
          node.value.value = value;
        }
      }
      this.traverse(path);
    },
  });

  return printCode(ast);
}

/**
 * Remove unnecessary JSX string wrappers: {"text"} -> text
 */
export function simplifyJsxStrings(code: string): string {
  const ast = parseCode(code);

  recast.visit(ast, {
    visitJSXExpressionContainer(path) {
      const node = path.node;

      // Only simplify if expression is a simple string literal
      if (n.StringLiteral.check(node.expression)) {
        const value = node.expression.value;
        // Don't simplify if contains special characters that need escaping
        if (!/[{}<>]/.test(value)) {
          // Replace with JSXText
          path.replace(b.jsxText(value));
          return false;
        }
      }

      this.traverse(path);
    },
  });

  return printCode(ast);
}

/**
 * Clean up empty style objects: style={{}} -> remove
 */
export function cleanupEmptyStyles(code: string): string {
  const ast = parseCode(code);

  recast.visit(ast, {
    visitJSXAttribute(path) {
      const node = path.node;
      if (n.JSXIdentifier.check(node.name) && node.name.name === "style") {
        if (n.JSXExpressionContainer.check(node.value)) {
          const expr = node.value.expression;
          if (n.ObjectExpression.check(expr) && expr.properties.length === 0) {
            path.prune();
            return false;
          }
        }
      }
      this.traverse(path);
    },
  });

  return printCode(ast);
}
