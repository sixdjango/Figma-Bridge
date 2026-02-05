/**
 * AST-based Tailwind converter - converts inline styles to Tailwind classes
 */

import * as recast from "recast";
import { namedTypes as n, builders as b } from "ast-types";
import { parseCode, printCode, findAttribute } from "./ast-utils";
import type { ParsedStyleEntry } from "./types";

/**
 * Convert a single style property to Tailwind class
 * Returns null if cannot convert, empty string if should be skipped
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
 * Get property key name from ObjectProperty
 */
function getPropertyKeyName(prop: n.ObjectProperty): string | null {
  if (n.Identifier.check(prop.key)) {
    return prop.key.name;
  }
  if (n.StringLiteral.check(prop.key)) {
    return prop.key.value;
  }
  return null;
}

/**
 * Check if style object has spread or dynamic values
 */
function hasSpreadOrDynamic(styleExpr: n.ObjectExpression): boolean {
  for (const prop of styleExpr.properties) {
    if (n.SpreadElement.check(prop) || n.SpreadProperty.check(prop)) {
      return true;
    }
    if (n.ObjectProperty.check(prop)) {
      // Dynamic value (not a string literal)
      if (!n.StringLiteral.check(prop.value)) {
        // Check if it's a variable reference
        if (n.Identifier.check(prop.value)) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Convert inline styles to Tailwind classes
 */
export function convertStylesToTailwind(code: string): string {
  const ast = parseCode(code);

  recast.visit(ast, {
    visitJSXElement(path) {
      this.traverse(path);

      const opening = path.node.openingElement;
      const classAttr = findAttribute(opening, "className");
      const styleAttr = findAttribute(opening, "style");

      // Need both className and style to convert
      if (!classAttr || !styleAttr) return;

      // className must be a simple string
      if (!n.StringLiteral.check(classAttr.value)) return;

      // style must be an expression container with object
      if (!n.JSXExpressionContainer.check(styleAttr.value)) return;
      const styleExpr = styleAttr.value.expression;
      if (!n.ObjectExpression.check(styleExpr)) return;

      // Skip if has spread or dynamic values
      if (hasSpreadOrDynamic(styleExpr)) return;

      const existingClasses = classAttr.value.value;
      const tailwindClasses: string[] = [];
      const remainingProps: typeof styleExpr.properties = [];

      for (const prop of styleExpr.properties) {
        if (!n.ObjectProperty.check(prop)) {
          remainingProps.push(prop);
          continue;
        }

        const keyName = getPropertyKeyName(prop);
        if (!keyName) {
          remainingProps.push(prop);
          continue;
        }

        // Only convert string literal values
        if (!n.StringLiteral.check(prop.value)) {
          remainingProps.push(prop);
          continue;
        }

        const twClass = styleToTailwind(keyName, prop.value.value, existingClasses);
        if (twClass === null) {
          // Cannot convert, keep in style
          remainingProps.push(prop);
        } else if (twClass !== "") {
          // Converted to Tailwind class
          tailwindClasses.push(twClass);
        }
        // If twClass is "", skip (duplicate or not needed)
      }

      // Update className
      if (tailwindClasses.length > 0) {
        const newClasses = existingClasses + " " + tailwindClasses.join(" ");
        classAttr.value.value = newClasses;
      }

      // Update or remove style
      if (remainingProps.length === 0) {
        // Remove style attribute entirely
        const attrs = opening.attributes || [];
        opening.attributes = attrs.filter((attr) => attr !== styleAttr);
      } else {
        // Keep remaining style properties
        styleExpr.properties = remainingProps;
      }
    },
  });

  return printCode(ast);
}
