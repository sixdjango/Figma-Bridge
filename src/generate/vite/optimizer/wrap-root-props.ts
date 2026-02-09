/**
 * Wrap root element with className/style props support.
 *
 * Transforms:
 *   export const Xxx: React.FC = () => (
 *     <div className="a b c" style={{...}}>...</div>
 *   );
 *
 * Into:
 *   const baseClassName = "a b c";
 *   const baseStyle: React.CSSProperties = { ... };
 *   interface XxxProps { className?: string; style?: React.CSSProperties; [key: string]: unknown; }
 *   export const Xxx: React.FC<XxxProps> = ({ className, style, ...props }) => (
 *     <div className={className ? `${baseClassName} ${className}` : baseClassName}
 *          style={{ ...baseStyle, ...style }} {...props}>...</div>
 *   );
 */

import * as recast from "recast";
import { namedTypes as n, builders as b } from "ast-types";
import {
  parseCode,
  printCode,
  extractClassName,
  extractStyleEntries,
  findAttribute,
  removeAttribute,
} from "./ast-utils";

export function wrapRootWithProps(code: string): string {
  const ast = parseCode(code);

  // 1. Find export const Xxx: React.FC = () => (...)
  let componentName = "";
  let varDeclarator: n.VariableDeclarator | null = null;
  let exportDeclPath: any = null;

  recast.visit(ast, {
    visitExportNamedDeclaration(path) {
      const decl = path.node.declaration;
      if (!n.VariableDeclaration.check(decl)) {
        this.traverse(path);
        return;
      }

      const vd = decl.declarations[0];
      if (
        n.VariableDeclarator.check(vd) &&
        n.Identifier.check(vd.id) &&
        n.ArrowFunctionExpression.check(vd.init)
      ) {
        componentName = vd.id.name;
        varDeclarator = vd;
        exportDeclPath = path;
      }
      return false;
    },
  });

  if (!componentName || !varDeclarator) return code;

  // Use local references after null-check to avoid TS narrowing issues
  const theDeclarator = varDeclarator as n.VariableDeclarator;
  const arrowFn = theDeclarator.init as n.ArrowFunctionExpression;

  // 2. Find root JSX element
  let rootRef: n.JSXElement | null = null;

  recast.visit(arrowFn, {
    visitJSXElement(path) {
      rootRef = path.node;
      return false; // Only the first (root) element
    },
  });

  if (!rootRef) return code;

  const rootElement = rootRef as n.JSXElement;

  // 3. Extract className and style from root element
  const className = extractClassName(rootElement);
  const styleEntries = extractStyleEntries(rootElement);

  if (className === null) return code; // Dynamic className, skip

  const baseClassNameValue = className || "";
  const baseStyleEntries = styleEntries || [];

  // 4. Build baseClassName declaration
  const baseClassNameDecl = b.variableDeclaration("const", [
    b.variableDeclarator(
      b.identifier("baseClassName"),
      b.stringLiteral(baseClassNameValue)
    ),
  ]);

  // 5. Build baseStyle declaration
  const styleProps = baseStyleEntries.map((entry) =>
    b.objectProperty(
      b.stringLiteral(entry.key),
      b.stringLiteral(entry.value)
    )
  );
  const baseStyleDecl = b.variableDeclaration("const", [
    b.variableDeclarator(
      b.identifier("baseStyle"),
      b.objectExpression(styleProps)
    ),
  ]);

  // 6. Build Props interface (as raw code since ast-types doesn't handle TS interfaces easily)
  // We'll insert it as a string after printing

  // 7. Replace root element's className attribute
  const opening = rootElement.openingElement;
  removeAttribute(opening, "className");
  removeAttribute(opening, "style");

  // className={className ? `${baseClassName} ${className}` : baseClassName}
  const classNameAttr = b.jsxAttribute(
    b.jsxIdentifier("className"),
    b.jsxExpressionContainer(
      b.conditionalExpression(
        b.identifier("className"),
        b.templateLiteral(
          [
            b.templateElement({ raw: "", cooked: "" }, false),
            b.templateElement({ raw: " ", cooked: " " }, false),
            b.templateElement({ raw: "", cooked: "" }, true),
          ],
          [b.identifier("baseClassName"), b.identifier("className")]
        ),
        b.identifier("baseClassName")
      )
    )
  );

  // style={{ ...baseStyle, ...style }}
  const styleAttr = b.jsxAttribute(
    b.jsxIdentifier("style"),
    b.jsxExpressionContainer(
      b.objectExpression([
        b.spreadElement(b.identifier("baseStyle")),
        b.spreadElement(b.identifier("style")),
      ])
    )
  );

  // {...props}
  const propsSpread = b.jsxSpreadAttribute(b.identifier("props"));

  // Insert new attributes at the beginning
  if (!opening.attributes) opening.attributes = [];
  opening.attributes = [classNameAttr, styleAttr, propsSpread, ...opening.attributes];

  // 8. Change component signature: add ({ className, style, ...props }) parameter
  const classNameProp = b.objectProperty(b.identifier("className"), b.identifier("className"));
  (classNameProp as any).shorthand = true;
  const styleProp = b.objectProperty(b.identifier("style"), b.identifier("style"));
  (styleProp as any).shorthand = true;

  arrowFn.params = [
    b.objectPattern([
      classNameProp,
      styleProp,
      b.restElement(b.identifier("props")),
    ]),
  ];

  // 9. Update type annotation: React.FC → React.FC<XxxProps>
  // We handle this via string replacement after printing since ast-types TS support is limited

  // 10. Insert baseClassName and baseStyle declarations before the export
  const body = ast.program.body;
  const exportIdx = body.indexOf(exportDeclPath.node);
  if (exportIdx >= 0) {
    body.splice(exportIdx, 0, baseClassNameDecl, baseStyleDecl);
  }

  // Print and do remaining string replacements
  let result = printCode(ast);

  // Add Props interface and update React.FC type (easier via string replacement)
  const propsInterface = `\ninterface ${componentName}Props {\n  className?: string;\n  style?: React.CSSProperties;\n  [key: string]: unknown;\n}\n`;

  // Insert interface before the export const
  const exportConst = `export const ${componentName}`;
  const exportIdx2 = result.indexOf(exportConst);
  if (exportIdx2 >= 0) {
    result = result.slice(0, exportIdx2) + propsInterface + "\n" + result.slice(exportIdx2);
  }

  // Update React.FC to React.FC<XxxProps>
  result = result.replace(
    `${componentName}: React.FC`,
    `${componentName}: React.FC<${componentName}Props>`
  );

  // Compact multi-line destructuring into single line:
  // ({ \n  className,\n  style,\n  ...props\n}) => (
  // → ({ className, style, ...props }) => (
  result = result.replace(
    /\(\s*\{\s*\n\s*className,\s*\n\s*style,\s*\n\s*\.\.\.props\s*\}\s*\)\s*=>/,
    "({ className, style, ...props }) =>"
  );

  return result;
}
