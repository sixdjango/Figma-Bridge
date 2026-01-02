/**
 * React renderer for converting IR nodes to React JSX
 */
import type { RenderNodeIR, LayoutInfo, LayoutCssOmit } from './types';
import type { ResolvedComponent, ImportWay } from '../types/component';
import { CssCollector } from '../utils/cssCollector';
import { buildSharedClasses, generateClassCss } from '../utils/classExtractor';
import { optimizeBoxCss } from '../utils/css-optimizer';
import { layoutToTailwindClasses, cssToTailwindClasses } from '../utils/tailwind-mapper';
import { buildUtilityCssSelective } from '../utils/utility-css';
import { buildBaseStyles } from '../utils/html-builder';
import { splitClassTokens } from '../utils/css-parser';
import { migrateShadowsToOuter } from '../utils/shadow-migrator';
import { getSemanticClassName } from '../utils/class-naming';
import { renderTextSegmentsWithClasses } from '../utils/css';

export type ReactRenderOptions = {
  /** Convert px to rem (100px = 1rem by default) */
  pxToRem?: boolean;
  /** Base px for rem conversion (default: 100) */
  remBase?: number;
  /** Use Tailwind CSS classes */
  useTailwind?: boolean;
  /** Generate CSS-in-JS styles instead of CSS classes */
  cssInJs?: boolean;
};

export type ReactRenderResult = {
  /** The React component JSX content */
  jsx: string;
  /** CSS styles (if not using CSS-in-JS) */
  css: string;
  /** Import statements for components */
  imports: ImportStatement[];
  /** Component name */
  componentName: string;
};

export type ImportStatement = {
  from: string;
  defaultImport?: string;
  namedImports: string[];
};

// Convert px value to rem
function pxToRem(value: number, base: number = 100): string {
  if (value === 0) return '0';
  return `${value / base}rem`;
}

// Convert CSS string px values to rem
function convertCssPxToRem(css: string, base: number = 100): string {
  return css.replace(/(\d+(?:\.\d+)?)\s*px/g, (_, num) => {
    const value = parseFloat(num);
    if (value === 0) return '0';
    return pxToRem(value, base);
  });
}

// Escape JSX attribute value
function escapeJsxAttr(val: string): string {
  return val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Convert HTML to JSX
function htmlToJsx(html: string): string {
  return html
    .replace(/class="/g, 'className="')
    .replace(/for="/g, 'htmlFor="')
    .replace(/tabindex="/g, 'tabIndex="')
    .replace(/readonly/g, 'readOnly')
    .replace(/autocomplete="/g, 'autoComplete="')
    .replace(/autofocus/g, 'autoFocus')
    // Self-closing tags
    .replace(/<(img|br|hr|input|meta|link)([^>]*?)>/g, '<$1$2 />')
    // Style attribute to object
    .replace(/style="([^"]*)"/g, (_, styleStr) => {
      const styleObj = cssStringToJsxStyle(styleStr);
      return `style={${JSON.stringify(styleObj)}}`;
    });
}

// Convert CSS style string to JSX style object
function cssStringToJsxStyle(css: string): Record<string, string> {
  const result: Record<string, string> = {};
  const declarations = css.split(';').filter(d => d.trim());

  for (const decl of declarations) {
    const colonIndex = decl.indexOf(':');
    if (colonIndex === -1) continue;

    const prop = decl.slice(0, colonIndex).trim();
    const value = decl.slice(colonIndex + 1).trim();

    // Convert kebab-case to camelCase
    const camelProp = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    result[camelProp] = value;
  }

  return result;
}

// Format px value
function fmtPx(n: number, options?: ReactRenderOptions): string {
  if (!isFinite(n)) return '0';
  const v = Math.round(n * 100) / 100;
  const s = String(v);
  const px = (s.replace(/\.00$/, '').replace(/\.0$/, '')) + 'px';

  if (options?.pxToRem) {
    return pxToRem(v, options.remBase || 100);
  }
  return px;
}

// Generate layout CSS
function layoutToCss(layout: LayoutInfo, omit?: LayoutCssOmit, options?: ReactRenderOptions): {
  containerCss: string;
  positioningCss: string;
  sizingCss: string;
  transformCss: string;
} {
  const partsContainer: string[] = [];
  if (layout.display === 'flex') {
    partsContainer.push('display:flex;');
    if (layout.flexDirection) partsContainer.push(`flex-direction:${layout.flexDirection};`);
    if (typeof layout.gap === 'number') partsContainer.push(`gap:${fmtPx(layout.gap, options)};`);
    if (layout.flexWrap === 'wrap') partsContainer.push('flex-wrap:wrap;');
    if (typeof layout.rowGap === 'number') partsContainer.push(`row-gap:${fmtPx(layout.rowGap, options)};`);
    if (typeof layout.columnGap === 'number') partsContainer.push(`column-gap:${fmtPx(layout.columnGap, options)};`);
    if (layout.justifyContent) partsContainer.push(`justify-content:${layout.justifyContent};`);
    if (layout.alignItems) partsContainer.push(`align-items:${layout.alignItems};`);
  } else {
    partsContainer.push('display:block;');
  }
  if (layout.padding) {
    const { t, r, b, l } = layout.padding;
    if (t || r || b || l) {
      partsContainer.push(`padding:${fmtPx(t || 0, options)} ${fmtPx(r || 0, options)} ${fmtPx(b || 0, options)} ${fmtPx(l || 0, options)};`);
    }
  }
  if (layout.boxSizing) partsContainer.push(`box-sizing:${layout.boxSizing};`);
  if (layout.overflow && layout.overflow !== 'visible') partsContainer.push('overflow:hidden;');

  const partsPos: string[] = [];
  const pos = layout.position || 'absolute';
  if (!omit?.position) partsPos.push(`position:${pos};`);
  if (pos === 'absolute') {
    const left = typeof layout.left === 'number' ? layout.left : 0;
    const top = typeof layout.top === 'number' ? layout.top : 0;
    if (!omit?.left) partsPos.push(`left:${fmtPx(left, options)};`);
    if (!omit?.top) partsPos.push(`top:${fmtPx(top, options)};`);
  }

  const partsSize: string[] = [];
  const w = layout.width;
  const h = layout.height;
  const cssWidth = layout.cssWidth;
  const cssHeight = layout.cssHeight;
  let wCss = cssWidth !== undefined
    ? cssWidth
    : (typeof w === 'number' ? fmtPx(w, options) : undefined);
  let hCss = cssHeight !== undefined
    ? cssHeight
    : (typeof h === 'number' ? fmtPx(h, options) : undefined);

  // Convert cssWidth/cssHeight px to rem if needed
  if (options?.pxToRem) {
    if (wCss && wCss.endsWith('px')) {
      const num = parseFloat(wCss);
      if (!isNaN(num)) wCss = pxToRem(num, options.remBase || 100);
    }
    if (hCss && hCss.endsWith('px')) {
      const num = parseFloat(hCss);
      if (!isNaN(num)) hCss = pxToRem(num, options.remBase || 100);
    }
  }

  if (!omit?.width && wCss !== undefined) partsSize.push(`width:${wCss};`);
  if (!omit?.height && hCss !== undefined) partsSize.push(`height:${hCss};`);
  if (typeof layout.flexGrow === 'number' && layout.flexGrow > 0) {
    if (!omit?.flexGrow) partsSize.push(`flex-grow:${layout.flexGrow};`);
    if (!omit?.flexShrink && typeof layout.flexShrink === 'number' && layout.flexShrink === 0) partsSize.push('flex-shrink:0;');
    if (!omit?.flexBasis) {
      partsSize.push(`flex-basis:${typeof layout.flexBasis === 'number' ? fmtPx(layout.flexBasis, options) : (layout.flexBasis || '0')};`);
    }
    if (!omit?.minWidth) partsSize.push('min-width:0;');
    if (!omit?.minHeight) partsSize.push('min-height:0;');
  } else if (typeof layout.flexShrink === 'number' && layout.flexShrink === 0) {
    if (!omit?.flexShrink) partsSize.push('flex-shrink:0;');
  }
  if (!omit?.alignSelf && layout.alignSelf && layout.alignSelf !== 'auto') partsSize.push(`align-self:${layout.alignSelf};`);

  const t2 = layout.transform2x2;
  const isIdentity = t2.a === 1 && t2.b === 0 && t2.c === 0 && t2.d === 1;
  const partsXf: string[] = [];
  if (!isIdentity) {
    partsXf.push(`transform-origin:${layout.origin};`);
    partsXf.push(`transform:matrix(${t2.a},${t2.b},${t2.c},${t2.d},0,0);`);
  } else {
    partsXf.push(`transform-origin:${layout.origin};`);
  }

  return {
    containerCss: partsContainer.join(''),
    positioningCss: partsPos.join(''),
    sizingCss: partsSize.join(''),
    transformCss: partsXf.join(''),
  };
}

type ReactRenderContext = {
  options: ReactRenderOptions;
  imports: Map<string, { defaultImport?: string; namedImports: Set<string> }>;
  usedClasses: Set<string>;
  indent: number;
};

function addIndent(ctx: ReactRenderContext): string {
  return '  '.repeat(ctx.indent);
}

// Render a component node
function renderComponentNode(
  node: RenderNodeIR,
  component: ResolvedComponent,
  ctx: ReactRenderContext
): string {
  const indent = addIndent(ctx);
  const tagName = component.tagName;

  // Add import
  const importKey = component.importInfo.from;
  if (!ctx.imports.has(importKey)) {
    ctx.imports.set(importKey, { namedImports: new Set() });
  }
  const importEntry = ctx.imports.get(importKey)!;
  if (component.importInfo.importWay === 'DEFAULT') {
    importEntry.defaultImport = tagName;
  } else {
    importEntry.namedImports.add(tagName);
  }

  // Build props string
  const propsEntries = Object.entries(component.props);
  let propsStr = '';
  if (propsEntries.length > 0) {
    propsStr = ' ' + propsEntries.map(([key, value]) => {
      if (typeof value === 'string') {
        return `${key}="${escapeJsxAttr(value)}"`;
      } else if (typeof value === 'boolean') {
        return value ? key : `${key}={false}`;
      } else {
        return `${key}={${JSON.stringify(value)}}`;
      }
    }).join(' ');
  }

  // For slice components, render self-closing
  if (component.isSlice) {
    return `${indent}<${tagName}${propsStr} />`;
  }

  // For normal components with children
  let childrenJsx = '';
  if (node.content.type === 'children' && node.content.nodes.length > 0) {
    ctx.indent++;
    const childParts = node.content.nodes.map(child => renderNodeToJsx(child, ctx));
    ctx.indent--;
    childrenJsx = '\n' + childParts.join('\n') + '\n' + indent;
  }

  if (childrenJsx) {
    return `${indent}<${tagName}${propsStr}>${childrenJsx}</${tagName}>`;
  }
  return `${indent}<${tagName}${propsStr} />`;
}

// Render a regular node to JSX
async function renderRegularNode(
  node: RenderNodeIR,
  ctx: ReactRenderContext
): Promise<string> {
  const indent = addIndent(ctx);

  // Get class name
  const semantic = getSemanticClassName(node.name || '', node.kind);
  const classNames: string[] = [node.kind];
  if (semantic && semantic !== node.kind) classNames.push(semantic);

  // Get styles
  let boxCss = node.style?.boxCss || '';
  if (ctx.options.pxToRem) {
    boxCss = convertCssPxToRem(boxCss, ctx.options.remBase || 100);
  }

  // Build layout CSS
  const layoutCssParts = layoutToCss(node.layout, undefined, ctx.options);
  let inlineStyle = layoutCssParts.positioningCss + layoutCssParts.sizingCss + layoutCssParts.containerCss + layoutCssParts.transformCss + boxCss;

  // Optimize CSS
  const cssCtx = {
    position: node.layout.position,
    hasRotateOrScale: !(node.layout.transform2x2.a === 1 && node.layout.transform2x2.b === 0 && node.layout.transform2x2.c === 0 && node.layout.transform2x2.d === 1),
    display: node.layout.display,
    flexDirection: node.layout.flexDirection,
    isText: node.kind === 'text',
  };
  inlineStyle = optimizeBoxCss(inlineStyle, cssCtx);

  // Convert to Tailwind classes if enabled
  if (ctx.options.useTailwind) {
    const util = await cssToTailwindClasses(inlineStyle);
    if (util.classNames.length) {
      classNames.push(...util.classNames);
      util.classNames.forEach(c => ctx.usedClasses.add(c));
    }
    inlineStyle = util.remainingCss;
  }

  // Build style object for JSX
  const styleObj = cssStringToJsxStyle(inlineStyle);
  const hasStyle = Object.keys(styleObj).length > 0;

  // Build attributes
  const attrs: string[] = [];
  if (classNames.length > 0) {
    attrs.push(`className="${classNames.join(' ')}"`);
  }
  if (hasStyle) {
    attrs.push(`style={${JSON.stringify(styleObj)}}`);
  }

  const attrsStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';

  // Render content
  let innerContent = '';
  if (node.kind === 'text' && node.content.type === 'text') {
    innerContent = htmlToJsx(node.content.html);
  } else if (node.kind === 'svg') {
    if (node.svgFile) {
      innerContent = `<img src="./svgs/${node.svgFile}" alt="" style={{display: 'block', width: '100%', height: '100%'}} />`;
    }
  } else if (node.content.type === 'children' && node.content.nodes.length > 0) {
    ctx.indent++;
    const childParts = await Promise.all(node.content.nodes.map(child => renderNodeToJsx(child, ctx)));
    ctx.indent--;
    innerContent = '\n' + childParts.join('\n') + '\n' + indent;
  }

  if (innerContent) {
    return `${indent}<div${attrsStr}>${innerContent}</div>`;
  }
  return `${indent}<div${attrsStr} />`;
}

// Main render function for a node
async function renderNodeToJsx(node: RenderNodeIR, ctx: ReactRenderContext): Promise<string> {
  // Check if this node has a component mapping
  if (node.component) {
    return renderComponentNode(node, node.component, ctx);
  }

  return renderRegularNode(node, ctx);
}

// Generate import statements
function generateImports(imports: Map<string, { defaultImport?: string; namedImports: Set<string> }>): ImportStatement[] {
  const result: ImportStatement[] = [];

  for (const [from, { defaultImport, namedImports }] of imports) {
    result.push({
      from,
      defaultImport,
      namedImports: Array.from(namedImports),
    });
  }

  return result;
}

// Format import statements as code
function formatImports(imports: ImportStatement[]): string {
  return imports.map(imp => {
    const parts: string[] = [];
    if (imp.defaultImport) {
      parts.push(imp.defaultImport);
    }
    if (imp.namedImports.length > 0) {
      parts.push(`{ ${imp.namedImports.join(', ')} }`);
    }
    return `import ${parts.join(', ')} from '${imp.from}';`;
  }).join('\n');
}

/**
 * Render IR nodes to React component
 */
export async function renderToReact(
  nodes: RenderNodeIR[],
  componentName: string,
  options: ReactRenderOptions = {}
): Promise<ReactRenderResult> {
  const ctx: ReactRenderContext = {
    options,
    imports: new Map(),
    usedClasses: new Set(),
    indent: 2, // Start with indent for component body
  };

  // Render nodes
  const jsxParts = await Promise.all(nodes.map(node => renderNodeToJsx(node, ctx)));
  const jsxContent = jsxParts.join('\n');

  // Generate imports
  const imports = generateImports(ctx.imports);

  // Generate CSS
  let css = buildBaseStyles();
  if (options.useTailwind) {
    css += '\n' + buildUtilityCssSelective(ctx.usedClasses);
  }
  if (options.pxToRem) {
    css = convertCssPxToRem(css, options.remBase || 100);
  }

  // Build component JSX
  const jsx = `export function ${componentName}() {
  return (
    <div className="figma-component">
${jsxContent}
    </div>
  );
}`;

  return {
    jsx,
    css,
    imports,
    componentName,
  };
}

/**
 * Generate full React component file
 */
export function generateReactComponent(result: ReactRenderResult): string {
  const importStatements = formatImports(result.imports);

  const parts: string[] = [];

  // Add React import
  parts.push(`import React from 'react';`);

  // Add component imports
  if (importStatements) {
    parts.push(importStatements);
  }

  // Add CSS import (assuming styles.css)
  parts.push(`import './styles.css';`);

  parts.push('');
  parts.push(result.jsx);
  parts.push('');
  parts.push(`export default ${result.componentName};`);

  return parts.join('\n');
}
