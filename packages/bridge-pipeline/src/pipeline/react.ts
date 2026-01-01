import type { ReactComponentAsset, ReactImport, RenderNodeIR } from './types';
import { htmlToJsx, formatReactComponent } from '../utils/html-to-react';

function dedupeImports(imports: ReactImport[]): ReactImport[] {
  const seen = new Set<string>();
  const out: ReactImport[] = [];
  for (const im of imports) {
    if (!im?.name || !im?.path) continue;
    const key = `${im.path}::${im.name}::${im.importKind || (im as any).kind || 'default'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(im);
  }
  return out;
}

export function collectCustomComponentImports(nodes: RenderNodeIR[]): ReactImport[] {
  const result: ReactImport[] = [];
  const stack: RenderNodeIR[] = [...nodes];
  while (stack.length) {
    const n = stack.pop();
    if (!n) continue;
    if (n.customComponent && n.customComponent.fromLib) {
      const way = n.customComponent.importWay || 'DEFAULT';
      result.push({
        name: n.customComponent.type,
        path: n.customComponent.fromLib,
        importKind: way === 'NAMED' ? 'named' : 'default',
      });
    }
    if (n.content && n.content.type === 'children') {
      stack.push(...n.content.nodes);
    }
  }
  return dedupeImports(result);
}

export function buildReactComponentAsset(
  componentName: string,
  bodyHtml: string,
  cssText: string,
  imports: ReactImport[] = [],
  cssPath?: string
): ReactComponentAsset {
  const jsxBody = htmlToJsx(bodyHtml);
  const source = formatReactComponent(componentName, jsxBody, imports, cssPath || `./${componentName}.css`);
  return { name: componentName, jsx: source, css: cssText, imports: dedupeImports(imports) };
}
