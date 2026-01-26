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

  // Font size
  { pattern: /^text-\[(.+)\]$/, toCSS: (m) => `font-size: ${m[1]};` },
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
 * Generate a valid CSS class name from semantic classes
 */
export function generateClassName(semanticClasses: string[], index: number): string {
  // Use semantic classes to create meaningful name
  const meaningful = semanticClasses.filter(c =>
    !['frame', 'text', 'shape', 'rect', 'svg-container'].includes(c)
  );

  if (meaningful.length > 0) {
    // Convert to camelCase
    return meaningful
      .map((c, i) => i === 0 ? c : c.charAt(0).toUpperCase() + c.slice(1))
      .join('')
      .replace(/[^a-zA-Z0-9]/g, '');
  }

  // Fallback: use element type + index
  const type = semanticClasses.find(c => ['frame', 'text', 'shape'].includes(c)) || 'element';
  return `${type}${index}`;
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
 * Convert JSX with Tailwind classes to LESS module format
 */
export function convertToLessModule(jsx: string, componentName: string): LessConversionResult {
  const classMap = new Map<string, string>();
  const lessRules: string[] = [];
  let elementIndex = 0;

  // Match className="..." or className={"..."}
  const classNamePattern = /className=(?:"([^"]+)"|{["']([^"']+)["']})/g;

  const modifiedJsx = jsx.replace(classNamePattern, (match, quoted, braced) => {
    const originalClassName = quoted || braced;
    if (!originalClassName) return match;

    // Check if already processed
    if (classMap.has(originalClassName)) {
      const newClassName = classMap.get(originalClassName)!;
      return `className={styles.${newClassName}}`;
    }

    const { tailwind, semantic } = extractClasses(originalClassName);

    // If no Tailwind classes, keep as is (might be custom component classes)
    if (tailwind.length === 0) {
      return match;
    }

    // Generate new class name
    elementIndex++;
    const newClassName = generateClassName(semantic, elementIndex);
    classMap.set(originalClassName, newClassName);

    // Generate CSS rules
    const cssRules = tailwindClassesToCSS(tailwind);
    if (cssRules) {
      lessRules.push(`.${newClassName} {\n  ${cssRules}\n}`);
    }

    return `className={styles.${newClassName}}`;
  });

  // Generate LESS content
  const lessContent = `// Auto-generated LESS module for ${componentName}
// Converted from Tailwind CSS classes

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
