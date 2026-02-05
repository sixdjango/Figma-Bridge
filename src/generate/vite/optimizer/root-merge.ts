/**
 * Root Merge Optimization
 *
 * Merges nested div elements into baseClassName/baseStyle pattern.
 * This pattern is used when components have a base className and style
 * that can be extended via props.
 */

import * as recast from "recast";
import { namedTypes as n, builders as b } from "ast-types";
import {
  parseCode,
  printCode,
  isDivElement,
  extractClassName,
  extractStyleEntries,
  getSingleJSXChild,
} from "./ast-utils";
import {
  ParsedStyleEntry,
  CONFLICT_GROUPS,
  SEMANTIC_CONFLICTS,
} from "./types";

/**
 * Get conflict group for a class
 */
function getConflictGroupForClass(className: string): string | null {
  const baseClass = className.replace(/\[.*\]$/, "").replace(/-$/, "");

  for (const group of CONFLICT_GROUPS) {
    if (
      group.includes(className) ||
      group.some((g) => baseClass === g || className.startsWith(g + "-"))
    ) {
      return group.join(",");
    }
  }

  // Handle dynamic classes (width, height, position, etc.)
  const prefixes = [
    "w-", "h-", "min-w-", "max-w-", "min-h-", "max-h-",
    "top-", "bottom-", "left-", "right-", "z-",
    "gap-", "gap-x-", "gap-y-",
    "p-", "px-", "py-", "pt-", "pb-", "pl-", "pr-",
    "m-", "mx-", "my-", "mt-", "mb-", "ml-", "mr-",
    "rounded", "opacity-", "bg-", "leading-", "shadow",
  ];

  for (const prefix of prefixes) {
    if (className.startsWith(prefix) || className === prefix.replace(/-$/, "")) {
      return prefix;
    }
  }

  // Text size vs text color
  if (
    className.startsWith("text-") &&
    !["text-left", "text-center", "text-right", "text-justify"].includes(className)
  ) {
    if (
      /^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)$/.test(className) ||
      /^text-\[.*\]$/.test(className)
    ) {
      return "text-size-";
    }
    return "text-color-";
  }

  return null;
}

/**
 * Check for semantic conflict between parent and child classes
 */
function hasSemanticConflictForMerge(parentClass: string, childClasses: string[]): boolean {
  for (const conflict of SEMANTIC_CONFLICTS) {
    const parentMatches = conflict.parent.some(
      (p) => parentClass === p || parentClass.startsWith(p.replace(/-$/, "") + "-")
    );
    if (parentMatches) {
      const childMatches = childClasses.some((cc) =>
        conflict.child.some((c) => cc === c || cc.startsWith(c.replace(/-$/, "") + "-"))
      );
      if (childMatches) return true;
    }
  }
  return false;
}

/**
 * Merge class lists with conflict resolution (child priority)
 */
function mergeClassesForRoot(parentClasses: string[], childClasses: string[]): string[] {
  const result: string[] = [];
  const childSet = new Set(childClasses);

  const childConflictGroups = new Set<string>();
  for (const cc of childClasses) {
    const group = getConflictGroupForClass(cc);
    if (group) childConflictGroups.add(group);
  }

  for (const pc of parentClasses) {
    if (childSet.has(pc)) continue;

    const parentGroup = getConflictGroupForClass(pc);
    if (parentGroup && childConflictGroups.has(parentGroup)) continue;
    if (hasSemanticConflictForMerge(pc, childClasses)) continue;

    let hasConflict = false;
    for (const cc of childClasses) {
      const pg = getConflictGroupForClass(pc);
      const cg = getConflictGroupForClass(cc);
      if (pg && cg && pg === cg) {
        hasConflict = true;
        break;
      }
    }

    if (!hasConflict) result.push(pc);
  }

  result.push(...childClasses);
  return result;
}

/**
 * Merge style objects (child priority)
 */
function mergeStylesForRoot(
  parentStyles: ParsedStyleEntry[],
  childStyles: ParsedStyleEntry[]
): ParsedStyleEntry[] {
  const result: ParsedStyleEntry[] = [];
  const childKeys = new Set(childStyles.map((s) => s.key));

  for (const ps of parentStyles) {
    if (!childKeys.has(ps.key)) {
      result.push(ps);
    }
  }

  result.push(...childStyles);
  return result;
}

interface RootDivInfo {
  className: string;
  style: ParsedStyleEntry[];
  node: n.JSXElement;
}

/**
 * Analyze nested div chain from root element
 * Returns the chain of divs and the inner content
 */
function analyzeRootDivChain(element: n.JSXElement): {
  chain: RootDivInfo[];
  innerContent: n.JSXElement | n.JSXElement[] | null;
} | null {
  const chain: RootDivInfo[] = [];
  let current: n.JSXElement = element;

  while (true) {
    if (!isDivElement(current)) break;

    const className = extractClassName(current);
    const style = extractStyleEntries(current);

    // Skip if dynamic className or style with spread
    if (className === null || style === null) break;

    chain.push({ className, style, node: current });

    const child = getSingleJSXChild(current);
    if (!child) {
      // No single child, return the remaining children as inner content
      const significantChildren = (current.children || []).filter((c) => {
        if (n.JSXText.check(c)) return c.value.trim().length > 0;
        return true;
      });

      const jsxElements = significantChildren.filter((c) => n.JSXElement.check(c)) as n.JSXElement[];
      if (jsxElements.length > 0) {
        return { chain, innerContent: jsxElements };
      }
      return { chain, innerContent: null };
    }

    if (isDivElement(child)) {
      // Continue traversing
      current = child;
    } else {
      // Non-div child, this is the inner content
      return { chain, innerContent: child };
    }
  }

  return chain.length > 0 ? { chain, innerContent: null } : null;
}

/**
 * Find baseClassName variable declaration
 */
function findBaseClassNameDecl(ast: n.File): {
  value: string;
  decl: n.VariableDeclarator;
} | null {
  let result: { value: string; decl: n.VariableDeclarator } | null = null;

  recast.visit(ast, {
    visitVariableDeclarator(path) {
      const node = path.node;
      if (
        n.Identifier.check(node.id) &&
        node.id.name === "baseClassName" &&
        n.StringLiteral.check(node.init)
      ) {
        result = { value: node.init.value, decl: node };
        return false;
      }
      this.traverse(path);
    },
  });

  return result;
}

/**
 * Find baseStyle variable declaration
 */
function findBaseStyleDecl(ast: n.File): {
  entries: ParsedStyleEntry[];
  decl: n.VariableDeclarator;
} | null {
  let result: { entries: ParsedStyleEntry[]; decl: n.VariableDeclarator } | null = null;

  recast.visit(ast, {
    visitVariableDeclarator(path) {
      const node = path.node;
      if (
        n.Identifier.check(node.id) &&
        node.id.name === "baseStyle" &&
        n.ObjectExpression.check(node.init)
      ) {
        const entries: ParsedStyleEntry[] = [];
        for (const prop of node.init.properties) {
          if (n.ObjectProperty.check(prop)) {
            let key: string | null = null;
            if (n.Identifier.check(prop.key)) {
              key = prop.key.name;
            } else if (n.StringLiteral.check(prop.key)) {
              key = prop.key.value;
            }
            if (key && n.StringLiteral.check(prop.value)) {
              entries.push({ key, value: prop.value.value });
            }
          }
        }
        result = { entries, decl: node };
        return false;
      }
      this.traverse(path);
    },
  });

  return result;
}

/**
 * Find root JSX element with baseClassName pattern
 * Pattern: className={className ? `${baseClassName} ${className}` : baseClassName}
 */
function findRootJSXElement(ast: n.File): n.JSXElement | null {
  let result: n.JSXElement | null = null;

  recast.visit(ast, {
    visitJSXElement(path) {
      if (result) return false;

      const node = path.node;
      const opening = node.openingElement;

      // Look for className attribute with baseClassName pattern
      const attrs = opening.attributes || [];
      for (const attr of attrs) {
        if (
          n.JSXAttribute.check(attr) &&
          n.JSXIdentifier.check(attr.name) &&
          attr.name.name === "className" &&
          n.JSXExpressionContainer.check(attr.value)
        ) {
          const expr = attr.value.expression;
          // Check for conditional expression with baseClassName
          if (n.ConditionalExpression.check(expr)) {
            const consequent = expr.consequent;
            if (
              n.TemplateLiteral.check(consequent) &&
              consequent.expressions.some(
                (e) => n.Identifier.check(e) && e.name === "baseClassName"
              )
            ) {
              result = node;
              return false;
            }
          }
        }
      }

      this.traverse(path);
    },
  });

  return result;
}

/**
 * Update baseClassName declaration value
 */
function updateBaseClassName(decl: n.VariableDeclarator, newValue: string): void {
  decl.init = b.stringLiteral(newValue);
}

/**
 * Update baseStyle declaration value
 */
function updateBaseStyle(decl: n.VariableDeclarator, entries: ParsedStyleEntry[]): void {
  const properties = entries.map((entry) =>
    b.objectProperty(b.identifier(entry.key), b.stringLiteral(entry.value))
  );
  decl.init = b.objectExpression(properties);
}

/**
 * Replace children of a JSX element
 */
function replaceChildren(element: n.JSXElement, newChildren: (n.JSXElement | n.JSXText)[]): void {
  element.children = newChildren;
}

/**
 * Optimize root merge - merge nested divs into baseClassName/baseStyle
 */
export function optimizeRootMerge(code: string): string {
  const ast = parseCode(code);

  // Find baseClassName and baseStyle declarations
  const baseClassNameInfo = findBaseClassNameDecl(ast);
  const baseStyleInfo = findBaseStyleDecl(ast);

  if (!baseClassNameInfo || !baseStyleInfo) {
    return code; // No pattern found
  }

  // Find root JSX element with baseClassName pattern
  const rootElement = findRootJSXElement(ast);
  if (!rootElement) {
    return code;
  }

  // Analyze nested div chain inside root element
  const singleChild = getSingleJSXChild(rootElement);
  if (!singleChild || !isDivElement(singleChild)) {
    return code; // No nested div to merge
  }

  const analysis = analyzeRootDivChain(singleChild);
  if (!analysis || analysis.chain.length === 0) {
    return code;
  }

  // Merge all classes and styles
  let mergedClasses = baseClassNameInfo.value.split(/\s+/).filter(Boolean);
  let mergedStyles = [...baseStyleInfo.entries];

  for (const div of analysis.chain) {
    const divClasses = div.className.split(/\s+/).filter(Boolean);
    mergedClasses = mergeClassesForRoot(mergedClasses, divClasses);
    mergedStyles = mergeStylesForRoot(mergedStyles, div.style);
  }

  // Update baseClassName and baseStyle declarations
  updateBaseClassName(baseClassNameInfo.decl, mergedClasses.join(" "));
  updateBaseStyle(baseStyleInfo.decl, mergedStyles);

  // Replace root element's children with inner content
  if (analysis.innerContent) {
    if (Array.isArray(analysis.innerContent)) {
      const newChildren: (n.JSXElement | n.JSXText)[] = [];
      for (const child of analysis.innerContent) {
        newChildren.push(b.jsxText("\n    "));
        newChildren.push(child);
      }
      newChildren.push(b.jsxText("\n  "));
      replaceChildren(rootElement, newChildren);
    } else {
      replaceChildren(rootElement, [
        b.jsxText("\n    "),
        analysis.innerContent,
        b.jsxText("\n  "),
      ]);
    }
  }

  return printCode(ast);
}
