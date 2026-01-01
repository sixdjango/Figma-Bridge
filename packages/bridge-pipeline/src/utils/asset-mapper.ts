import type { RenderNodeIR } from '../pipeline/types';

export type AssetType = 'image' | 'svg';
export type AssetUrlProvider = (id: string, type: AssetType, data?: string) => string;

export function applyAssetUrlProvider(
  htmlOrFragment: string,
  cssText: string,
  nodes: RenderNodeIR[],
  provider?: AssetUrlProvider
): { html: string; cssText: string; htmlFragment?: string } {
  if (!provider) return { html: htmlOrFragment, cssText };
  let outHtml = htmlOrFragment;
  let outCss = cssText;
  let isFragment = false;

  if (!/<!doctype html>/i.test(htmlOrFragment) && !/<html\b/i.test(htmlOrFragment)) {
    isFragment = true;
    outHtml = htmlOrFragment;
  } else {
    outHtml = htmlOrFragment;
  }

  const svgMap = new Map<string, string>();
  const stack: RenderNodeIR[] = [...nodes];
  while (stack.length) {
    const n = stack.pop()!;
    if (n && n.svgFile && n.svgContent) svgMap.set(n.svgFile, n.svgContent);
    if (n && n.content && n.content.type === 'children') stack.push(...n.content.nodes);
  }

  const imgRe = /(["'\(])(?:\/)?images\/([a-zA-Z0-9_-]+)\.png(["'\)])/g;
  outCss = outCss.replace(imgRe, (_m: string, p1: string, id: string, p3: string) => {
    const url = provider(String(id), 'image');
    return `${p1}${url}${p3}`;
  });
  outHtml = outHtml.replace(imgRe, (_m: string, p1: string, id: string, p3: string) => {
    const url = provider(String(id), 'image');
    return `${p1}${url}${p3}`;
  });

  const svgRe = /(src=\")(?:[^\"]*\/)?svgs\/([^\"]+)(\")/g;
  outHtml = outHtml.replace(svgRe, (_m: string, p1: string, file: string, p3: string) => {
    const data = svgMap.get(String(file));
    const url = provider(String(file), 'svg', data);
    return `${p1}${url}${p3}`;
  });

  return isFragment ? { html: outHtml, cssText: outCss, htmlFragment: outHtml } : { html: outHtml, cssText: outCss };
}
