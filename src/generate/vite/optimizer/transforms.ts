/**
 * Simple AST-based transforms for React component optimization
 */

import * as recast from "recast";
import { namedTypes as n, builders as b } from "ast-types";
import { parseCode, printCode, findAttribute, extractClassName, removeAttribute } from "./ast-utils";

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
 * Convert inline width/height: "auto" to className markers (w-auto/h-auto).
 * The className markers survive until after nested-div merge, where they
 * block parent dimension propagation, then get cleaned up by removeAutoSizeClasses.
 */
export function removeAutoSizes(code: string): string {
  const ast = parseCode(code);

  // Track which elements need w-auto / h-auto added to className
  const elementsToMark = new Map<n.JSXOpeningElement, Set<string>>();

  recast.visit(ast, {
    visitJSXElement(path) {
      this.traverse(path);
      const opening = path.node.openingElement;
      const styleAttr = findAttribute(opening, "style");
      if (!styleAttr || !n.JSXExpressionContainer.check(styleAttr.value)) return;
      const expr = styleAttr.value.expression;
      if (!n.ObjectExpression.check(expr)) return;

      const toAdd = new Set<string>();
      expr.properties = expr.properties.filter((prop) => {
        if (n.ObjectProperty.check(prop)) {
          const keyName = getPropertyKeyName(prop);
          if (
            keyName === "width" &&
            n.StringLiteral.check(prop.value) &&
            prop.value.value === "auto"
          ) {
            toAdd.add("w-auto");
            return false;
          }
          if (
            keyName === "height" &&
            n.StringLiteral.check(prop.value) &&
            prop.value.value === "auto"
          ) {
            toAdd.add("h-auto");
            return false;
          }
        }
        return true;
      });

      if (toAdd.size > 0) {
        elementsToMark.set(opening, toAdd);
      }
    },
  });

  // Add w-auto/h-auto to className for elements that had inline auto
  elementsToMark.forEach((classes, opening) => {
    const classAttr = findAttribute(opening, "className");
    if (classAttr && n.StringLiteral.check(classAttr.value)) {
      const existing = classAttr.value.value.split(/\s+/).filter(Boolean);
      classes.forEach((cls) => {
        if (!existing.includes(cls)) existing.push(cls);
      });
      classAttr.value.value = existing.join(" ");
    } else if (!classAttr && opening.attributes) {
      opening.attributes.push(
        b.jsxAttribute(
          b.jsxIdentifier("className"),
          b.stringLiteral(Array.from(classes).join(" "))
        )
      );
    }
  });

  return printCode(ast);
}

/**
 * Remove w-auto and h-auto className markers (post-merge cleanup).
 */
export function removeAutoSizeClasses(code: string): string {
  const ast = parseCode(code);

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

const NON_STRETCH_ALIGNMENTS = ["items-center", "items-start", "items-end", "items-baseline"];

/**
 * Resolve top-level const string variables (e.g., const baseClassName = "...").
 */
function resolveStringConsts(ast: n.File): Record<string, string> {
  const consts: Record<string, string> = {};
  recast.visit(ast, {
    visitVariableDeclaration(path) {
      if (path.node.kind === "const") {
        for (const decl of path.node.declarations) {
          if (
            n.VariableDeclarator.check(decl) &&
            n.Identifier.check(decl.id) &&
            decl.init &&
            n.StringLiteral.check(decl.init)
          ) {
            consts[decl.id.name] = decl.init.value;
          }
        }
      }
      return false; // top-level only
    },
  });
  return consts;
}

/**
 * Resolve effective className classes for a JSX element, including
 * references to module-level string constants (e.g., baseClassName).
 */
function resolveElementClasses(
  node: n.JSXElement,
  consts: Record<string, string>
): string[] | null {
  // Fast path: literal className
  const literal = extractClassName(node);
  if (literal !== null) return literal.split(/\s+/).filter(Boolean);

  // Dynamic path: look for template literal with const references
  const attr = findAttribute(node.openingElement, "className");
  if (!attr) return [];
  if (!n.JSXExpressionContainer.check(attr.value)) return null;

  const expr = attr.value.expression;

  // Handle: className={className ? `${baseClassName} ${className}` : baseClassName}
  // Both branches reference baseClassName, so resolve that.
  if (n.ConditionalExpression.check(expr)) {
    const classes = new Set<string>();
    for (const branch of [expr.consequent, expr.alternate]) {
      if (n.TemplateLiteral.check(branch)) {
        for (const e of branch.expressions) {
          if (n.Identifier.check(e) && consts[e.name]) {
            consts[e.name].split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
          }
        }
        for (const q of branch.quasis) {
          q.value.raw.split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
        }
      } else if (n.Identifier.check(branch) && consts[branch.name]) {
        consts[branch.name].split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
      }
    }
    if (classes.size > 0) return Array.from(classes);
  }

  return null;
}

/**
 * Remove self-stretch from children when parent has non-stretch alignment
 * (items-center, items-start, items-end, items-baseline).
 */
export function removeSelfStretchConflicts(code: string): string {
  const ast = parseCode(code);
  const consts = resolveStringConsts(ast);

  recast.visit(ast, {
    visitJSXElement(path) {
      this.traverse(path);
      const node = path.node;

      const parentClasses = resolveElementClasses(node, consts);
      if (!parentClasses) return;

      const hasNonStretchAlign = parentClasses.some((c) => NON_STRETCH_ALIGNMENTS.includes(c));
      if (!hasNonStretchAlign) return;

      // Remove self-stretch from direct children
      for (const child of node.children || []) {
        if (!n.JSXElement.check(child)) continue;
        const childAttr = findAttribute(child.openingElement, "className");
        if (!childAttr) continue;

        if (n.StringLiteral.check(childAttr.value)) {
          const classes = childAttr.value.value.split(/\s+/);
          if (classes.includes("self-stretch")) {
            const filtered = classes.filter((c) => c !== "self-stretch").join(" ");
            if (filtered) {
              childAttr.value.value = filtered;
            } else {
              removeAttribute(child.openingElement, "className");
            }
          }
        }
      }
    },
  });

  return printCode(ast);
}

// Classes that imply flex-grow > 0
const GROW_CLASSES = ["grow", "flex-1", "flex-auto"];
// Classes that should be removed alongside grow (only when grow is removed)
const GROW_RELATED_CLASSES = ["shrink", "shrink-0"];

function hasExplicitWidth(cls: string): boolean {
  return /^w-\[.+\]$/.test(cls) || cls === "w-full" || cls === "w-screen"
    || /^w-\d+\/\d+$/.test(cls) || /^w-\d+$/.test(cls);
}

function hasExplicitHeight(cls: string): boolean {
  return /^h-\[.+\]$/.test(cls) || cls === "h-full" || cls === "h-screen"
    || /^h-\d+\/\d+$/.test(cls) || /^h-\d+$/.test(cls);
}

function isFlexColumn(classes: string[]): boolean {
  return classes.includes("flex-col") || classes.includes("flex-col-reverse");
}

function isFlexContainer(classes: string[]): boolean {
  return classes.includes("flex") || classes.includes("inline-flex");
}

/**
 * Remove grow/flex-1 from children when it conflicts with explicit dimensions.
 * - Parent flex-row + child has grow + explicit width → remove grow
 * - Parent flex-col + child has grow + explicit height → remove grow
 */
export function removeGrowConflicts(code: string): string {
  const ast = parseCode(code);
  const consts = resolveStringConsts(ast);

  recast.visit(ast, {
    visitJSXElement(path) {
      this.traverse(path);
      const node = path.node;

      const parentClasses = resolveElementClasses(node, consts);
      if (!parentClasses || !isFlexContainer(parentClasses)) return;

      const isCol = isFlexColumn(parentClasses);

      for (const child of node.children || []) {
        if (!n.JSXElement.check(child)) continue;
        const childAttr = findAttribute(child.openingElement, "className");
        if (!childAttr || !n.StringLiteral.check(childAttr.value)) continue;

        const classes = childAttr.value.value.split(/\s+/);
        const hasGrow = classes.some((c) => GROW_CLASSES.includes(c));
        if (!hasGrow) continue;

        // Check for conflicting explicit dimension on main axis
        const hasMainDim = isCol
          ? classes.some(hasExplicitHeight)
          : classes.some(hasExplicitWidth);

        if (!hasMainDim) continue;

        // Remove grow and related flex-item classes
        const filtered = classes
          .filter((c) => !GROW_CLASSES.includes(c) && !GROW_RELATED_CLASSES.includes(c)
            && !/^basis-/.test(c))
          .join(" ");

        if (filtered) {
          childAttr.value.value = filtered;
        } else {
          removeAttribute(child.openingElement, "className");
        }
      }
    },
  });

  return printCode(ast);
}
