import { parseHTML } from 'linkedom';

type ReactifyOptions = {
  indent?: number;
  componentTags?: Map<string, string>;
};

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

function toCamelCase(prop: string): string {
  if (!prop) return '';
  if (prop.startsWith('--')) return prop;
  return prop.replace(/-([a-z0-9])/gi, (_m, c: string) => c.toUpperCase());
}

function styleToObjectLiteral(style: string): string {
  const entries = (style || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
  const kvs = entries
    .map((entry) => {
      const idx = entry.indexOf(':');
      if (idx <= 0) return '';
      const rawKey = entry.slice(0, idx).trim();
      const rawVal = entry.slice(idx + 1).trim();
      if (!rawKey) return '';
      const key = toCamelCase(rawKey);
      return `'${key}': ${JSON.stringify(rawVal)}`;
    })
    .filter(Boolean);
  return `{ ${kvs.join(', ')} }`;
}

function indentLines(str: string, level: number): string {
  const pad = ' '.repeat(level);
  return str
    .split('\n')
    .map((line) => (line ? pad + line : pad))
    .join('\n');
}

function escText(text: string): string {
  if (!text) return '';
  return `{${JSON.stringify(text)}}`;
}

function nodeToJsx(node: any, depth: number, options: ReactifyOptions): string {
  const indent = ' '.repeat(depth);
  if (node.nodeType === 3) {
    const txt = node.textContent ?? '';
    if (!txt.trim()) return '';
    return indent + escText(txt);
  }
  if (node.nodeType !== 1) return '';

  const rawTag = (node.localName || node.tagName || '').toString();
  const tagLookup = options.componentTags?.get(rawTag.toLowerCase());
  const tagName = tagLookup || rawTag;

  const attrParts: string[] = [];
  for (const attr of node.getAttributeNames()) {
    let name = attr;
    if (name === 'class') name = 'className';
    else if (name === 'for') name = 'htmlFor';
    else if (name.toLowerCase() === 'onclick') name = 'onClick';
    const val = node.getAttribute(attr) ?? '';
    if (name === 'style') {
      attrParts.push(`style={${styleToObjectLiteral(val)}}`);
    } else {
      attrParts.push(`${name}=${JSON.stringify(val)}`);
    }
  }
  const attrStr = attrParts.length ? ' ' + attrParts.join(' ') : '';
  const children = Array.from(node.childNodes || [])
    .map((ch: any) => nodeToJsx(ch, depth + (options.indent || 2), options))
    .filter(Boolean);
  const childStr = children.join('\n');

  if (!childStr) {
    const voidish = VOID_ELEMENTS.has(tagName.toLowerCase());
    const self = `${indent}<${tagName}${attrStr}${voidish ? ' />' : '></' + tagName + '>'}`;
    return self;
  }

  const open = `${indent}<${tagName}${attrStr}>`;
  const close = `${indent}</${tagName}>`;
  return `${open}\n${childStr}\n${close}`;
}

export function htmlFragmentToJsx(html: string, options: ReactifyOptions = {}): string {
  const parsed = parseHTML(html || '');
  const roots = Array.from((parsed?.document?.body?.childNodes || []) as any[]);
  const children = roots
    .map((n) => nodeToJsx(n, options.indent ?? 2, options))
    .filter(Boolean);
  if (children.length === 1) return children[0];
  const inner = children.join('\n');
  const fragIndent = ' '.repeat(options.indent ?? 2);
  return `${fragIndent}<>\n${inner}\n${fragIndent}</>`;
}

export function buildReactComponentSource(
  componentName: string,
  jsxBody: string,
  cssText: string,
  imports: string[] = [],
  exportDefault: boolean = true
): string {
  const importSet = new Set<string>();
  importSet.add("import React from 'react';");
  imports.filter(Boolean).forEach((imp) => importSet.add(imp));
  const importSection = Array.from(importSet).join('\n');
  const cssLiteral = JSON.stringify(cssText || '');
  const indentedJsx = indentLines(jsxBody, 4);
  const lines = [
    importSection,
    '',
    `export const ${componentName} = () => (`,
    '  <>',
    `    <style dangerouslySetInnerHTML={{ __html: ${cssLiteral} }} />`,
    indentedJsx,
    '  </>',
    ');',
  ];
  if (exportDefault) {
    lines.push('', `export default ${componentName};`);
  }
  return lines.join('\n');
}
