import { parseHTML } from 'linkedom';

const SELF_CLOSING = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

function kebabToCamel(str: string): string {
  return str.replace(/-([a-z0-9])/gi, (_m, g1) => g1.toUpperCase());
}

function normalizeAttrName(name: string): string {
  if (!name) return '';
  if (name === 'class') return 'className';
  if (name === 'for') return 'htmlFor';
  if (/^(data|aria)-/i.test(name)) return name;
  return kebabToCamel(name);
}

function parseStyle(styleText: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!styleText) return out;
  const entries = styleText.split(';').map((s) => s.trim()).filter(Boolean);
  for (const entry of entries) {
    const [rawK, ...rest] = entry.split(':');
    const v = rest.join(':').trim();
    if (!rawK || !v) continue;
    const k = kebabToCamel(rawK.trim());
    out[k] = v;
  }
  return out;
}

function serializeStyleObject(styleObj: Record<string, string>): string {
  return JSON.stringify(styleObj);
}

function serializeAttribute(name: string, value: string): string {
  return `${name}=${JSON.stringify(value)}`;
}

function escapeText(text: string): string {
  return `{${JSON.stringify(text)}}`;
}

function indent(text: string, depth: number): string {
  const pad = '  '.repeat(depth);
  return text
    .split(/\r?\n/)
    .map((line) => (line ? pad + line : line))
    .join('\n');
}

function renderAttributes(el: any): string {
  const attrs: string[] = [];
  for (const attr of Array.from(el.attributes)) {
    const name = normalizeAttrName((attr as any).name);
    if (!name) continue;
    if (name === 'style') {
      const styleObj = parseStyle((attr as any).value || '');
      attrs.push(`style={${serializeStyleObject(styleObj)}}`);
      continue;
    }
    attrs.push(serializeAttribute(name, (attr as any).value));
  }
  return attrs.join(' ');
}

function renderNode(node: any, depth: number): string {
  const pad = '  '.repeat(depth);
  if (node.nodeType === 3) {
    const text = node.textContent ?? '';
    if (!text) return '';
    return pad + escapeText(text);
  }
  if (node.nodeType !== 1) return '';
  const el = node as any;
  const tagName = el.tagName.toLowerCase();
  const attrStr = renderAttributes(el);
  const children = Array.from(el.childNodes);
  if (children.length === 0 && SELF_CLOSING.has(tagName)) {
    return `${pad}<${tagName}${attrStr ? ' ' + attrStr : ''} />`;
  }
  const renderedChildren = children
    .map((child) => renderNode(child, depth + 1))
    .filter(Boolean)
    .join('\n');
  if (!renderedChildren) {
    return `${pad}<${tagName}${attrStr ? ' ' + attrStr : ''}></${tagName}>`;
  }
  const childBlock = renderedChildren.includes('\n') ? `\n${renderedChildren}\n${pad}` : renderedChildren;
  return `${pad}<${tagName}${attrStr ? ' ' + attrStr : ''}>${childBlock}</${tagName}>`;
}

export function htmlToJsx(html: string): string {
  const safeHtml = html && html.trim() ? html : '<div />';
  const { document } = parseHTML(`<body>${safeHtml}</body>`);
  const parts = Array.from(document.body.childNodes)
    .map((node) => renderNode(node, 0))
    .filter(Boolean);
  if (parts.length === 0) return '<></>';
  if (parts.length === 1) return parts[0];
  const wrapped = parts.map((p) => indent(p, 1)).join('\n');
  return `<>
${wrapped}
</>`;
}

export function formatReactComponent(
  componentName: string,
  jsxBody: string,
  imports: { name: string; path: string; kind?: 'default' | 'named' }[] = [],
  cssPath?: string
): string {
  const importLines: string[] = ['import React from "react";'];
  if (cssPath) {
    importLines.push(`import ${JSON.stringify(cssPath)};`);
  }
  for (const im of imports) {
    if (!im?.name || !im?.path) continue;
    const kind = ((im as any).importKind || im.kind || 'default').toUpperCase();
    if (kind === 'NAMED') importLines.push(`import { ${im.name} } from ${JSON.stringify(im.path)};`);
    else importLines.push(`import ${im.name} from ${JSON.stringify(im.path)};`);
  }
  const bodyIndented = indent(jsxBody, 2);
  const lines = [
    ...importLines,
    '',
    `const ${componentName}: React.FC = () => {`,
    '  return (',
    bodyIndented.includes('\n') ? bodyIndented : `    ${bodyIndented}`,
    '  );',
    '};',
    '',
    `export default ${componentName};`,
  ];
  return lines.join('\n');
}
