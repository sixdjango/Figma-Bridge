/**
 * Tailwind to LESS module converter
 *
 * Converts Tailwind CSS classes to LESS module format
 */

/**
 * Mapping of Tailwind classes to CSS properties
 * This is a subset of common Tailwind utilities
 */
const TAILWIND_TO_CSS: Record<string, (value: string) => string> = {
  // Position
  'absolute': () => 'position: absolute;',
  'relative': () => 'position: relative;',
  'fixed': () => 'position: fixed;',
  'sticky': () => 'position: sticky;',

  // Display
  'flex': () => 'display: flex;',
  'block': () => 'display: block;',
  'inline': () => 'display: inline;',
  'inline-block': () => 'display: inline-block;',
  'inline-flex': () => 'display: inline-flex;',
  'hidden': () => 'display: none;',
  'grid': () => 'display: grid;',

  // Flex direction
  'flex-row': () => 'flex-direction: row;',
  'flex-col': () => 'flex-direction: column;',
  'flex-row-reverse': () => 'flex-direction: row-reverse;',
  'flex-col-reverse': () => 'flex-direction: column-reverse;',

  // Flex wrap
  'flex-wrap': () => 'flex-wrap: wrap;',
  'flex-nowrap': () => 'flex-wrap: nowrap;',
  'flex-wrap-reverse': () => 'flex-wrap: wrap-reverse;',

  // Justify content
  'justify-start': () => 'justify-content: flex-start;',
  'justify-end': () => 'justify-content: flex-end;',
  'justify-center': () => 'justify-content: center;',
  'justify-between': () => 'justify-content: space-between;',
  'justify-around': () => 'justify-content: space-around;',
  'justify-evenly': () => 'justify-content: space-evenly;',

  // Align items
  'items-start': () => 'align-items: flex-start;',
  'items-end': () => 'align-items: flex-end;',
  'items-center': () => 'align-items: center;',
  'items-baseline': () => 'align-items: baseline;',
  'items-stretch': () => 'align-items: stretch;',

  // Align self
  'self-auto': () => 'align-self: auto;',
  'self-start': () => 'align-self: flex-start;',
  'self-end': () => 'align-self: flex-end;',
  'self-center': () => 'align-self: center;',
  'self-stretch': () => 'align-self: stretch;',

  // Flex grow/shrink
  'grow': () => 'flex-grow: 1;',
  'grow-0': () => 'flex-grow: 0;',
  'shrink': () => 'flex-shrink: 1;',
  'shrink-0': () => 'flex-shrink: 0;',

  // Overflow
  'overflow-hidden': () => 'overflow: hidden;',
  'overflow-auto': () => 'overflow: auto;',
  'overflow-scroll': () => 'overflow: scroll;',
  'overflow-visible': () => 'overflow: visible;',
  'overflow-x-hidden': () => 'overflow-x: hidden;',
  'overflow-y-hidden': () => 'overflow-y: hidden;',
  'overflow-x-auto': () => 'overflow-x: auto;',
  'overflow-y-auto': () => 'overflow-y: auto;',

  // Text alignment
  'text-left': () => 'text-align: left;',
  'text-center': () => 'text-align: center;',
  'text-right': () => 'text-align: right;',
  'text-justify': () => 'text-align: justify;',

  // Font weight
  'font-thin': () => 'font-weight: 100;',
  'font-extralight': () => 'font-weight: 200;',
  'font-light': () => 'font-weight: 300;',
  'font-normal': () => 'font-weight: 400;',
  'font-medium': () => 'font-weight: 500;',
  'font-semibold': () => 'font-weight: 600;',
  'font-bold': () => 'font-weight: 700;',
  'font-extrabold': () => 'font-weight: 800;',
  'font-black': () => 'font-weight: 900;',

  // Whitespace
  'whitespace-normal': () => 'white-space: normal;',
  'whitespace-nowrap': () => 'white-space: nowrap;',
  'whitespace-pre': () => 'white-space: pre;',
  'whitespace-pre-line': () => 'white-space: pre-line;',
  'whitespace-pre-wrap': () => 'white-space: pre-wrap;',

  // Object fit
  'object-contain': () => 'object-fit: contain;',
  'object-cover': () => 'object-fit: cover;',
  'object-fill': () => 'object-fit: fill;',
  'object-none': () => 'object-fit: none;',
  'object-scale-down': () => 'object-fit: scale-down;',

  // Pointer events
  'pointer-events-none': () => 'pointer-events: none;',
  'pointer-events-auto': () => 'pointer-events: auto;',

  // Cursor
  'cursor-pointer': () => 'cursor: pointer;',
  'cursor-default': () => 'cursor: default;',
  'cursor-not-allowed': () => 'cursor: not-allowed;',
};

/**
 * Patterns for dynamic Tailwind classes
 */
const DYNAMIC_PATTERNS: Array<{
  pattern: RegExp;
  toCSS: (match: RegExpMatchArray) => string | null;
}> = [
  // Width: w-[100px], w-full, w-auto, w-screen
  { pattern: /^w-\[(.+)\]$/, toCSS: (m) => `width: ${m[1]};` },
  { pattern: /^w-full$/, toCSS: () => 'width: 100%;' },
  { pattern: /^w-auto$/, toCSS: () => 'width: auto;' },
  { pattern: /^w-screen$/, toCSS: () => 'width: 100vw;' },
  { pattern: /^w-(\d+)$/, toCSS: (m) => `width: ${parseInt(m[1]) * 0.25}rem;` },

  // Height: h-[100px], h-full, h-auto, h-screen
  { pattern: /^h-\[(.+)\]$/, toCSS: (m) => `height: ${m[1]};` },
  { pattern: /^h-full$/, toCSS: () => 'height: 100%;' },
  { pattern: /^h-auto$/, toCSS: () => 'height: auto;' },
  { pattern: /^h-screen$/, toCSS: () => 'height: 100vh;' },
  { pattern: /^h-(\d+)$/, toCSS: (m) => `height: ${parseInt(m[1]) * 0.25}rem;` },

  // Min/Max width/height
  { pattern: /^min-w-\[(.+)\]$/, toCSS: (m) => `min-width: ${m[1]};` },
  { pattern: /^max-w-\[(.+)\]$/, toCSS: (m) => `max-width: ${m[1]};` },
  { pattern: /^min-h-\[(.+)\]$/, toCSS: (m) => `min-height: ${m[1]};` },
  { pattern: /^max-h-\[(.+)\]$/, toCSS: (m) => `max-height: ${m[1]};` },

  // Position: top, right, bottom, left
  { pattern: /^top-\[(.+)\]$/, toCSS: (m) => `top: ${m[1]};` },
  { pattern: /^right-\[(.+)\]$/, toCSS: (m) => `right: ${m[1]};` },
  { pattern: /^bottom-\[(.+)\]$/, toCSS: (m) => `bottom: ${m[1]};` },
  { pattern: /^left-\[(.+)\]$/, toCSS: (m) => `left: ${m[1]};` },
  { pattern: /^inset-\[(.+)\]$/, toCSS: (m) => `inset: ${m[1]};` },

  // Margin: m-[10px], mx-auto, mt-4, etc.
  { pattern: /^m-\[(.+)\]$/, toCSS: (m) => `margin: ${m[1]};` },
  { pattern: /^mx-\[(.+)\]$/, toCSS: (m) => `margin-left: ${m[1]}; margin-right: ${m[1]};` },
  { pattern: /^my-\[(.+)\]$/, toCSS: (m) => `margin-top: ${m[1]}; margin-bottom: ${m[1]};` },
  { pattern: /^mt-\[(.+)\]$/, toCSS: (m) => `margin-top: ${m[1]};` },
  { pattern: /^mr-\[(.+)\]$/, toCSS: (m) => `margin-right: ${m[1]};` },
  { pattern: /^mb-\[(.+)\]$/, toCSS: (m) => `margin-bottom: ${m[1]};` },
  { pattern: /^ml-\[(.+)\]$/, toCSS: (m) => `margin-left: ${m[1]};` },
  { pattern: /^mx-auto$/, toCSS: () => 'margin-left: auto; margin-right: auto;' },

  // Padding: p-[10px], px-4, pt-2, etc.
  { pattern: /^p-\[(.+)\]$/, toCSS: (m) => `padding: ${m[1]};` },
  { pattern: /^px-\[(.+)\]$/, toCSS: (m) => `padding-left: ${m[1]}; padding-right: ${m[1]};` },
  { pattern: /^py-\[(.+)\]$/, toCSS: (m) => `padding-top: ${m[1]}; padding-bottom: ${m[1]};` },
  { pattern: /^pt-\[(.+)\]$/, toCSS: (m) => `padding-top: ${m[1]};` },
  { pattern: /^pr-\[(.+)\]$/, toCSS: (m) => `padding-right: ${m[1]};` },
  { pattern: /^pb-\[(.+)\]$/, toCSS: (m) => `padding-bottom: ${m[1]};` },
  { pattern: /^pl-\[(.+)\]$/, toCSS: (m) => `padding-left: ${m[1]};` },

  // Gap
  { pattern: /^gap-\[(.+)\]$/, toCSS: (m) => `gap: ${m[1]};` },
  { pattern: /^gap-x-\[(.+)\]$/, toCSS: (m) => `column-gap: ${m[1]};` },
  { pattern: /^gap-y-\[(.+)\]$/, toCSS: (m) => `row-gap: ${m[1]};` },
  { pattern: /^gap-(\d+)$/, toCSS: (m) => `gap: ${parseInt(m[1]) * 0.25}rem;` },

  // Border radius
  { pattern: /^rounded-\[(.+)\]$/, toCSS: (m) => `border-radius: ${m[1]};` },
  { pattern: /^rounded$/, toCSS: () => 'border-radius: 0.25rem;' },
  { pattern: /^rounded-none$/, toCSS: () => 'border-radius: 0;' },
  { pattern: /^rounded-sm$/, toCSS: () => 'border-radius: 0.125rem;' },
  { pattern: /^rounded-md$/, toCSS: () => 'border-radius: 0.375rem;' },
  { pattern: /^rounded-lg$/, toCSS: () => 'border-radius: 0.5rem;' },
  { pattern: /^rounded-xl$/, toCSS: () => 'border-radius: 0.75rem;' },
  { pattern: /^rounded-2xl$/, toCSS: () => 'border-radius: 1rem;' },
  { pattern: /^rounded-3xl$/, toCSS: () => 'border-radius: 1.5rem;' },
  { pattern: /^rounded-full$/, toCSS: () => 'border-radius: 9999px;' },

  // Opacity
  { pattern: /^opacity-\[(.+)\]$/, toCSS: (m) => `opacity: ${m[1]};` },
  { pattern: /^opacity-(\d+)$/, toCSS: (m) => `opacity: ${parseInt(m[1]) / 100};` },

  // Z-index
  { pattern: /^z-\[(.+)\]$/, toCSS: (m) => `z-index: ${m[1]};` },
  { pattern: /^z-(\d+)$/, toCSS: (m) => `z-index: ${m[1]};` },
  { pattern: /^z-auto$/, toCSS: () => 'z-index: auto;' },

  // Font size (only match size values, not colors)
  { pattern: /^text-\[(\d+(?:\.\d+)?(?:px|rem|em|%|vw|vh))\]$/, toCSS: (m) => `font-size: ${m[1]};` },

  // Text color with arbitrary value
  { pattern: /^text-\[(rgb[a]?\([^)]+\))\]$/, toCSS: (m) => `color: ${m[1]};` },
  { pattern: /^text-\[(#[a-fA-F0-9]{3,8})\]$/, toCSS: (m) => `color: ${m[1]};` },
  { pattern: /^text-\[(hsl[a]?\([^)]+\))\]$/, toCSS: (m) => `color: ${m[1]};` },
  { pattern: /^text-xs$/, toCSS: () => 'font-size: 0.75rem; line-height: 1rem;' },
  { pattern: /^text-sm$/, toCSS: () => 'font-size: 0.875rem; line-height: 1.25rem;' },
  { pattern: /^text-base$/, toCSS: () => 'font-size: 1rem; line-height: 1.5rem;' },
  { pattern: /^text-lg$/, toCSS: () => 'font-size: 1.125rem; line-height: 1.75rem;' },
  { pattern: /^text-xl$/, toCSS: () => 'font-size: 1.25rem; line-height: 1.75rem;' },
  { pattern: /^text-2xl$/, toCSS: () => 'font-size: 1.5rem; line-height: 2rem;' },

  // Line height
  { pattern: /^leading-\[(.+)\]$/, toCSS: (m) => `line-height: ${m[1]};` },
  { pattern: /^leading-none$/, toCSS: () => 'line-height: 1;' },
  { pattern: /^leading-tight$/, toCSS: () => 'line-height: 1.25;' },
  { pattern: /^leading-normal$/, toCSS: () => 'line-height: 1.5;' },
  { pattern: /^leading-loose$/, toCSS: () => 'line-height: 2;' },

  // Background color (arbitrary value)
  { pattern: /^bg-\[(.+)\]$/, toCSS: (m) => `background: ${m[1]};` },

  // Text color (arbitrary value)
  { pattern: /^text-\[color:(.+)\]$/, toCSS: (m) => `color: ${m[1]};` },

  // Border
  { pattern: /^border-\[(.+)\]$/, toCSS: (m) => `border: ${m[1]};` },
  { pattern: /^border$/, toCSS: () => 'border-width: 1px;' },
  { pattern: /^border-(\d+)$/, toCSS: (m) => `border-width: ${m[1]}px;` },

  // Box shadow (arbitrary value)
  { pattern: /^shadow-\[(.+)\]$/, toCSS: (m) => `box-shadow: ${m[1]};` },

  // Transform
  { pattern: /^rotate-\[(.+)\]$/, toCSS: (m) => `transform: rotate(${m[1]});` },
  { pattern: /^scale-\[(.+)\]$/, toCSS: (m) => `transform: scale(${m[1]});` },
  { pattern: /^translate-x-\[(.+)\]$/, toCSS: (m) => `transform: translateX(${m[1]});` },
  { pattern: /^translate-y-\[(.+)\]$/, toCSS: (m) => `transform: translateY(${m[1]});` },
];

/**
 * Convert a single Tailwind class to CSS
 */
export function tailwindClassToCSS(className: string): string | null {
  // Check static mappings first
  if (TAILWIND_TO_CSS[className]) {
    return TAILWIND_TO_CSS[className](className);
  }

  // Check dynamic patterns
  for (const { pattern, toCSS } of DYNAMIC_PATTERNS) {
    const match = className.match(pattern);
    if (match) {
      return toCSS(match);
    }
  }

  return null;
}

/**
 * Convert multiple Tailwind classes to CSS rules
 */
export function tailwindClassesToCSS(classes: string[]): string {
  const cssRules: string[] = [];

  for (const cls of classes) {
    const css = tailwindClassToCSS(cls);
    if (css) {
      // Split multiple rules (e.g., "margin-left: auto; margin-right: auto;")
      const rules = css.split(';').filter(r => r.trim());
      for (const rule of rules) {
        cssRules.push(rule.trim() + ';');
      }
    }
  }

  return cssRules.join('\n  ');
}

/**
 * Element style info for LESS conversion
 */
export interface ElementStyleInfo {
  /** Unique class name for this element */
  className: string;
  /** Original Tailwind classes */
  tailwindClasses: string[];
  /** Non-Tailwind classes (semantic classes like 'frame', 'text', etc.) */
  semanticClasses: string[];
  /** Converted CSS rules */
  cssRules: string;
}

/**
 * Extract Tailwind and semantic classes from a className string
 */
export function extractClasses(className: string): { tailwind: string[]; semantic: string[] } {
  const classes = className.split(/\s+/).filter(Boolean);
  const tailwind: string[] = [];
  const semantic: string[] = [];

  for (const cls of classes) {
    if (tailwindClassToCSS(cls)) {
      tailwind.push(cls);
    } else {
      semantic.push(cls);
    }
  }

  return { tailwind, semantic };
}

/**
 * Ensure class name is valid (doesn't start with a number)
 * If it starts with numbers, move them to the end
 */
export function ensureValidClassName(name: string): string {
  if (!name) return 'element';

  // Check if starts with digit
  const match = name.match(/^(\d+)(.*)$/);
  if (match) {
    const [, leadingDigits, rest] = match;
    // Move digits to the end, ensure rest is not empty
    const validName = rest ? `${rest}${leadingDigits}` : `element${leadingDigits}`;
    return validName;
  }

  return name;
}

/**
 * Generate a valid CSS class name from semantic classes
 */
export function generateClassName(semanticClasses: string[], index: number): string {
  // Use semantic classes to create meaningful name
  const meaningful = semanticClasses.filter(c =>
    !['frame', 'text', 'shape', 'rect', 'svg-container'].includes(c)
  );

  let className: string;
  if (meaningful.length > 0) {
    // Convert to camelCase
    className = meaningful
      .map((c, i) => i === 0 ? c : c.charAt(0).toUpperCase() + c.slice(1))
      .join('')
      .replace(/[^a-zA-Z0-9]/g, '');
  } else {
    // Fallback: use element type + index
    const type = semanticClasses.find(c => ['frame', 'text', 'shape'].includes(c)) || 'element';
    className = `${type}${index}`;
  }

  // Ensure class name doesn't start with a number
  return ensureValidClassName(className);
}

/**
 * Result of converting JSX to LESS module format
 */
export interface LessConversionResult {
  /** Modified JSX with CSS module class references */
  jsx: string;
  /** Generated LESS content */
  less: string;
  /** Map of original className to new module class name */
  classMap: Map<string, string>;
}

/**
 * Parse inline style object from JSX style attribute
 * Handles both style={{ ... }} and style={...} formats
 */
function parseInlineStyle(styleStr: string): Map<string, { value: string; important: boolean }> {
  const styles = new Map<string, { value: string; important: boolean }>();
  if (!styleStr) return styles;

  // Remove outer braces if present
  let content = styleStr.trim();
  if (content.startsWith('{') && content.endsWith('}')) {
    content = content.slice(1, -1).trim();
  }
  if (content.startsWith('{') && content.endsWith('}')) {
    content = content.slice(1, -1).trim();
  }

  // Match property: value pairs (handles both 'prop': "value" and prop: "value")
  // Also handles expressions like 'fontFamily': "Poppins, sans-serif"
  const propPattern = /['"]?([a-zA-Z-]+)['"]?\s*:\s*(?:"([^"]+)"|'([^']+)'|([^,}]+))/g;
  let match;

  while ((match = propPattern.exec(content)) !== null) {
    let prop = match[1];
    let value = (match[2] || match[3] || match[4] || '').trim();

    // Convert camelCase to kebab-case
    prop = prop.replace(/([A-Z])/g, '-$1').toLowerCase();

    // Check if value starts with ! (highest priority)
    const important = value.startsWith('!');
    if (important) {
      value = value.slice(1).trim();
    }

    // Clean up value - remove quotes if wrapped
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (prop && value) {
      styles.set(prop, { value, important });
    }
  }

  return styles;
}

/**
 * Extract style attribute content from element string
 * Returns the full style object content including braces
 */
function extractStyleFromElement(element: string): string {
  // Match style={{ ... }} - need to handle nested braces
  const styleStart = element.indexOf('style={');
  if (styleStart === -1) return '';

  let braceCount = 0;
  let start = -1;
  let end = -1;

  for (let i = styleStart + 6; i < element.length; i++) {
    if (element[i] === '{') {
      if (braceCount === 0) start = i;
      braceCount++;
    } else if (element[i] === '}') {
      braceCount--;
      if (braceCount === 0) {
        end = i + 1;
        break;
      }
    }
  }

  if (start !== -1 && end !== -1) {
    return element.slice(start, end);
  }
  return '';
}

/**
 * Remove style attribute from element string
 */
function removeStyleFromElement(element: string): string {
  const styleStart = element.indexOf('style={');
  if (styleStart === -1) return element;

  // Find the end of style attribute
  let braceCount = 0;
  let end = -1;

  for (let i = styleStart + 6; i < element.length; i++) {
    if (element[i] === '{') {
      braceCount++;
    } else if (element[i] === '}') {
      braceCount--;
      if (braceCount === 0) {
        end = i + 1;
        break;
      }
    }
  }

  if (end !== -1) {
    // Remove the style attribute and any trailing/leading whitespace
    const before = element.slice(0, styleStart).replace(/\s+$/, ' ');
    const after = element.slice(end).replace(/^\s+/, '');
    return before + after;
  }

  return element;
}

/**
 * Convert camelCase style property to kebab-case CSS property
 */
function camelToKebab(str: string): string {
  return str.replace(/([A-Z])/g, '-$1').toLowerCase();
}

/**
 * Merge CSS rules from className and inline styles
 * Inline styles have higher priority, except ! prefix which is highest
 */
function mergeCssRules(
  tailwindRules: string,
  inlineStyles: Map<string, { value: string; important: boolean }>
): string {
  // Parse existing tailwind rules into a map
  const rulesMap = new Map<string, { value: string; important: boolean }>();

  // Parse tailwind CSS rules
  const rulePattern = /([a-z-]+)\s*:\s*([^;]+);?/gi;
  let match;
  while ((match = rulePattern.exec(tailwindRules)) !== null) {
    const prop = match[1].trim();
    const value = match[2].trim();
    rulesMap.set(prop, { value, important: false });
  }

  // Merge inline styles (higher priority)
  for (const [prop, { value, important }] of inlineStyles) {
    const existing = rulesMap.get(prop);
    // Important styles always win, otherwise inline overwrites
    if (!existing || !existing.important || important) {
      rulesMap.set(prop, { value, important });
    }
  }

  // Generate merged CSS
  const mergedRules: string[] = [];
  for (const [prop, { value, important }] of rulesMap) {
    if (important) {
      mergedRules.push(`${prop}: ${value} !important;`);
    } else {
      mergedRules.push(`${prop}: ${value};`);
    }
  }

  return mergedRules.join('\n  ');
}

/**
 * Find the style attribute in a substring starting from a className match
 * Looks for style={{ ... }} that belongs to the same element
 */
function findStyleNearClassName(jsx: string, classNameEnd: number): {
  styleStr: string;
  styleStart: number;
  styleEnd: number;
} | null {
  // Search forward for style attribute within the same element (before >)
  let searchEnd = classNameEnd;
  let braceDepth = 0;

  // Find the end of current element (the > that closes the opening tag)
  for (let i = classNameEnd; i < jsx.length; i++) {
    const char = jsx[i];
    if (char === '{') braceDepth++;
    else if (char === '}') braceDepth--;
    else if (char === '>' && braceDepth === 0) {
      searchEnd = i;
      break;
    }
  }

  // Look for style attribute between className and element end
  const searchRegion = jsx.slice(classNameEnd, searchEnd);
  const styleMatch = searchRegion.match(/\s+style=\{/);

  if (!styleMatch) {
    // Also search backwards from className
    let searchStart = classNameEnd;
    for (let i = classNameEnd - 1; i >= 0; i--) {
      if (jsx[i] === '<') {
        searchStart = i;
        break;
      }
    }
    const backwardRegion = jsx.slice(searchStart, classNameEnd);
    const backwardMatch = backwardRegion.match(/\s+style=\{/);
    if (!backwardMatch) return null;

    // Found style before className
    const styleStart = searchStart + backwardMatch.index!;
    const styleContent = extractStyleFromElement(jsx.slice(styleStart, searchEnd + 1));
    if (!styleContent) return null;

    // Find the end of style attribute
    const styleFullMatch = jsx.slice(styleStart).match(/\s*style=\{[^}]*\}\}/);
    if (!styleFullMatch) return null;

    return {
      styleStr: styleContent,
      styleStart,
      styleEnd: styleStart + styleFullMatch[0].length,
    };
  }

  // Found style after className
  const styleStart = classNameEnd + styleMatch.index!;
  const styleContent = extractStyleFromElement(jsx.slice(styleStart, searchEnd + 1));
  if (!styleContent) return null;

  // Find the end of style attribute using brace matching
  let start = jsx.indexOf('{', styleStart);
  let depth = 0;
  let end = start;
  for (let i = start; i < jsx.length; i++) {
    if (jsx[i] === '{') depth++;
    else if (jsx[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  return {
    styleStr: styleContent,
    styleStart,
    styleEnd: end,
  };
}

/**
 * Find all style attributes and their positions in JSX
 */
function findAllStyleAttributes(jsx: string): Array<{
  start: number;
  end: number;
  content: string;
}> {
  const styles: Array<{ start: number; end: number; content: string }> = [];

  // Find all style={ patterns
  let searchStart = 0;
  while (true) {
    const styleIdx = jsx.indexOf('style={', searchStart);
    if (styleIdx === -1) break;

    // Find matching closing brace using brace counting
    let braceCount = 0;
    let start = styleIdx + 6; // position of first {
    let end = start;

    for (let i = start; i < jsx.length; i++) {
      if (jsx[i] === '{') braceCount++;
      else if (jsx[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          end = i + 1;
          break;
        }
      }
    }

    if (end > start) {
      // Include any preceding whitespace
      let fullStart = styleIdx;
      while (fullStart > 0 && (jsx[fullStart - 1] === ' ' || jsx[fullStart - 1] === '\t')) {
        fullStart--;
      }

      styles.push({
        start: fullStart,
        end,
        content: jsx.slice(styleIdx + 7, end - 1), // content inside style={{ }}
      });
    }

    searchStart = end;
  }

  return styles;
}

/**
 * Check if a position is inside an element that has been converted (has styles.xxx)
 */
function isInsideConvertedElement(jsx: string, position: number): boolean {
  // Look backwards for className={styles.
  let tagStart = position;
  while (tagStart > 0 && jsx[tagStart] !== '<') {
    tagStart--;
  }

  // Look forward for > (end of opening tag)
  let tagEnd = position;
  let braceDepth = 0;
  for (let i = position; i < jsx.length; i++) {
    if (jsx[i] === '{') braceDepth++;
    else if (jsx[i] === '}') braceDepth--;
    else if (jsx[i] === '>' && braceDepth === 0) {
      tagEnd = i;
      break;
    }
  }

  const elementTag = jsx.slice(tagStart, tagEnd + 1);
  return elementTag.includes('className={styles.');
}

/**
 * Convert JSX with Tailwind classes to LESS module format
 * This is designed to be the final step in the generation pipeline
 */
export function convertToLessModule(jsx: string, componentName: string): LessConversionResult {
  const classMap = new Map<string, string>();
  const lessRules: string[] = [];
  let elementIndex = 0;

  // Step 1: Find all className attributes and their associated styles
  interface ClassNameInfo {
    originalClassName: string;
    classNameStart: number;
    classNameEnd: number;
    styleContent: string;
  }
  const classNames: ClassNameInfo[] = [];

  // First, find all style attributes for reference
  const allStyles = findAllStyleAttributes(jsx);

  // Find all className attributes
  const classNamePattern = /className=(?:"([^"]+)"|{["']([^"']+)["']})/g;
  let match;

  while ((match = classNamePattern.exec(jsx)) !== null) {
    const originalClassName = match[1] || match[2];
    const classNameStart = match.index;
    const classNameEnd = match.index + match[0].length;

    // Find the element boundaries
    let elemStart = classNameStart;
    while (elemStart > 0 && jsx[elemStart] !== '<') elemStart--;

    let elemEnd = classNameEnd;
    let braceDepth = 0;
    for (let i = classNameEnd; i < jsx.length; i++) {
      if (jsx[i] === '{') braceDepth++;
      else if (jsx[i] === '}') braceDepth--;
      else if (jsx[i] === '>' && braceDepth === 0) {
        elemEnd = i + 1;
        break;
      }
    }

    // Find style attribute within this element's opening tag
    let styleContent = '';
    for (const style of allStyles) {
      if (style.start >= elemStart && style.end <= elemEnd) {
        styleContent = style.content;
        break;
      }
    }

    classNames.push({
      originalClassName,
      classNameStart,
      classNameEnd,
      styleContent,
    });
  }

  // Step 2: Process each className and generate LESS rules
  const classNameReplacements: Array<{ start: number; end: number; newText: string }> = [];

  for (const info of classNames) {
    const { originalClassName, classNameStart, classNameEnd, styleContent } = info;

    let newClassName: string;

    if (classMap.has(originalClassName)) {
      newClassName = classMap.get(originalClassName)!;
    } else {
      const { tailwind, semantic } = extractClasses(originalClassName);
      const inlineStyles = parseInlineStyle(styleContent);

      // Skip if no Tailwind classes and no inline styles
      if (tailwind.length === 0 && inlineStyles.size === 0) {
        continue;
      }

      elementIndex++;
      newClassName = generateClassName(semantic, elementIndex);
      classMap.set(originalClassName, newClassName);

      const tailwindCssRules = tailwindClassesToCSS(tailwind);
      const mergedRules = mergeCssRules(tailwindCssRules, inlineStyles);

      if (mergedRules) {
        lessRules.push(`.${newClassName} {\n  ${mergedRules}\n}`);
      }
    }

    classNameReplacements.push({
      start: classNameStart,
      end: classNameEnd,
      newText: `className={styles.${newClassName}}`,
    });
  }

  // Sort and apply className replacements (from end to start)
  classNameReplacements.sort((a, b) => b.start - a.start);

  let modifiedJsx = jsx;
  for (const r of classNameReplacements) {
    modifiedJsx = modifiedJsx.slice(0, r.start) + r.newText + modifiedJsx.slice(r.end);
  }

  // Step 3: Remove style attributes from converted elements
  // Re-find all style attributes in modified JSX
  const stylesInModified = findAllStyleAttributes(modifiedJsx);

  // Filter to only styles inside converted elements and sort descending
  const stylesToRemove = stylesInModified
    .filter(s => isInsideConvertedElement(modifiedJsx, s.start))
    .sort((a, b) => b.start - a.start);

  // Remove styles from end to start
  for (const style of stylesToRemove) {
    modifiedJsx = modifiedJsx.slice(0, style.start) + modifiedJsx.slice(style.end);
  }

  // Generate LESS content
  const lessContent = `// Auto-generated LESS module for ${componentName}
// Converted from Tailwind CSS classes and inline styles

${lessRules.join('\n\n')}
`;

  return {
    jsx: modifiedJsx,
    less: lessContent,
    classMap,
  };
}

/**
 * Generate import statement for LESS module
 */
export function generateLessImport(lessFileName: string): string {
  return `import styles from './${lessFileName}';`;
}
