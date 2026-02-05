#!/usr/bin/env ts-node
/**
 * CLI wrapper for React Component Optimizer
 *
 * This script uses the optimizer module to optimize Figma-generated React components.
 *
 * Usage: npm run optimize-component -- <path-to-tsx-file> [options]
 */

import * as fs from "fs";
import * as path from "path";
// Use AST-based optimizer
import { optimizeReactComponent } from "../generate/vite/optimizer";
import type { OptimizeOptions } from "../generate/vite/optimizer";

interface CliOptions extends OptimizeOptions {
  removeDebugClasses?: boolean;
  inPlace?: boolean;
}

const DEBUG_CLASS_NAMES = [
  "frame",
  "shape",
  "svg-container",
  "content-layer",
  "text",
  "rect",
];

/**
 * Remove debug class names from content
 */
function removeDebugClasses(content: string, classNames: string[]): string {
  let result = content;

  for (const className of classNames) {
    result = result.replace(/className="([^"]+)"/g, (match, classes) => {
      const filtered = classes
        .split(/\s+/)
        .filter((c: string) => !classNames.includes(c))
        .join(" ");
      return `className="${filtered}"`;
    });
  }

  result = result.replace(/className=""\s*/g, "");
  result = result.replace(/className="\s+"/g, 'className=""');

  return result;
}

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): { filePath: string; options: CliOptions } {
  const options: CliOptions = {
    aggressive: false,
    removeDebugClasses: false,
    inPlace: false,
  };

  let filePath = "";

  for (const arg of args) {
    if (arg === "--remove-debug-classes") {
      options.removeDebugClasses = true;
    } else if (arg === "--aggressive") {
      options.aggressive = true;
    } else if (arg === "--in-place") {
      options.inPlace = true;
    } else if (!arg.startsWith("--")) {
      filePath = arg;
    }
  }

  return { filePath, options };
}

/**
 * Generate optimization report
 */
function generateReport(original: string, optimized: string): void {
  console.log("\n=== Optimization Report ===\n");

  const countPattern = (content: string, pattern: RegExp) => (content.match(pattern) || []).length;

  const stats = [
    {
      name: "Identity transforms",
      original: countPattern(original, /matrix\s*\(\s*1\s*,/g),
      optimized: countPattern(optimized, /matrix\s*\(\s*1\s*,/g),
    },
    {
      name: 'width/height: "auto"',
      original: countPattern(original, /(?:width|height)\s*:\s*["']auto["']/g),
      optimized: countPattern(optimized, /(?:width|height)\s*:\s*["']auto["']/g),
    },
    {
      name: "Empty shape divs",
      original: countPattern(original, /<div[^>]*shape\s+rect[^>]*>\s*<\/div>/g),
      optimized: countPattern(optimized, /<div[^>]*shape\s+rect[^>]*>\s*<\/div>/g),
    },
    {
      name: "Duplicate absolute",
      original: countPattern(original, /absolute[^>]*position\s*:\s*["']absolute["']/g),
      optimized: countPattern(optimized, /absolute[^>]*position\s*:\s*["']absolute["']/g),
    },
    {
      name: "Outline styles",
      original: countPattern(original, /outline-\[/g),
      optimized: countPattern(optimized, /outline-\[/g),
    },
  ];

  console.log("Pattern                    Original  Optimized  Removed");
  console.log("─".repeat(55));

  for (const stat of stats) {
    const removed = stat.original - stat.optimized;
    console.log(
      `${stat.name.padEnd(25)} ${stat.original.toString().padStart(8)}  ${stat.optimized.toString().padStart(9)}  ${removed > 0 ? `-${removed}` : "0"}`
    );
  }

  console.log("─".repeat(55));

  const originalLines = original.split("\n").length;
  const optimizedLines = optimized.split("\n").length;
  console.log(`\nLines: ${originalLines} → ${optimizedLines} (${originalLines - optimizedLines} removed)`);
}

// Main entry point
const args = process.argv.slice(2);

if (args.length === 0 || args.includes("--help")) {
  console.log(`
React Component Optimizer for Figma-generated code

Usage: npm run optimize-component -- <path-to-tsx-file> [options]

Options:
  --remove-debug-classes  Remove debug class names (frame, shape, svg-container, etc.)
  --aggressive            Enable aggressive optimizations (remove empty divs, merge nested layers)
  --in-place              Overwrite the original file instead of creating .optimized.tsx
  --help                  Show this help message

Examples:
  npm run optimize-component -- src/components/Layout.tsx
  npm run optimize-component -- src/components/Layout.tsx --aggressive
  npm run optimize-component -- src/components/Layout.tsx --remove-debug-classes --aggressive
`);
  process.exit(0);
}

const { filePath, options } = parseArgs(args);

if (!filePath) {
  console.error("Error: No file path provided");
  process.exit(1);
}

const resolvedPath = path.resolve(filePath);

if (!fs.existsSync(resolvedPath)) {
  console.error(`Error: File not found: ${resolvedPath}`);
  process.exit(1);
}

console.log(`Optimizing: ${resolvedPath}`);
console.log(`Options: ${JSON.stringify(options)}\n`);

const content = fs.readFileSync(resolvedPath, "utf-8");

// Use the optimizer module
let optimized = optimizeReactComponent(content, {
  aggressive: options.aggressive,
  removeAutoSizes: true,
  convertToTailwind: true,
  removeIdentityTransforms: true,
  simplifyColors: true,
  simplifyJsxStrings: true,
  removeOutlineStyles: true,
});

// Handle debug classes removal (not part of optimizer module)
if (options.removeDebugClasses) {
  const beforeDebug = optimized.length;
  optimized = removeDebugClasses(optimized, DEBUG_CLASS_NAMES);
  if (optimized.length < beforeDebug) {
    console.log("  ✓ Removed debug class names");
  }
}

generateReport(content, optimized);

const outputPath = options.inPlace ? resolvedPath : resolvedPath.replace(/\.tsx$/, ".optimized.tsx");
fs.writeFileSync(outputPath, optimized);
console.log(`\nOutput written to: ${outputPath}`);
