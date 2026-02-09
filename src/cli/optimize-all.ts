#!/usr/bin/env ts-node
/**
 * Comprehensive optimization pipeline for Figma-generated React components
 *
 * This script runs multiple optimization passes using the optimizer module:
 * 1. Clean redundant code (identity transforms, auto sizes, empty divs, etc.)
 * 2. Merge single-child nested divs
 * 3. Final cleanup
 *
 * Usage: npm run optimize-all -- <path-to-tsx-file> [options]
 */

import * as fs from "fs";
import * as path from "path";
import { optimizeReactComponent } from "../generate/vite/optimizer";

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

// Parse args
const args = process.argv.slice(2);

if (args.length === 0 || args.includes("--help")) {
  console.log(`
Comprehensive Figma Component Optimizer

Usage: npm run optimize-all -- <path-to-tsx-file> [options]

Options:
  --remove-debug-classes  Remove debug class names (frame, shape, etc.)
  --in-place              Overwrite the original file
  --help                  Show this help message

This runs the full optimization pipeline:
  1. Clean redundant code (identity transforms, auto sizes, etc.)
  2. Merge nested single-child divs
  3. Final formatting cleanup

Example:
  npm run optimize-all -- examples/vite/src/generated/Layout/index.tsx
`);
  process.exit(0);
}

const filePath = args.find((arg) => !arg.startsWith("--"));
if (!filePath) {
  console.error("Error: No file path provided");
  process.exit(1);
}

const resolvedPath = path.resolve(filePath);
if (!fs.existsSync(resolvedPath)) {
  console.error(`Error: File not found: ${resolvedPath}`);
  process.exit(1);
}

const hasDebugFlag = args.includes("--remove-debug-classes");
const inPlace = args.includes("--in-place");

console.log("=".repeat(60));
console.log("Figma Component Optimization Pipeline");
console.log("=".repeat(60));
console.log(`\nInput: ${resolvedPath}\n`);

const originalContent = fs.readFileSync(resolvedPath, "utf-8");
const originalLines = originalContent.split("\n").length;
const originalSize = originalContent.length;

// Step 1 & 2: Run main optimizer (includes nested div merging when aggressive=true)
console.log("Step 1-2: Cleaning and merging nested divs...");
console.log("-".repeat(40));

let optimized = optimizeReactComponent(originalContent, {
  aggressive: true,
  removeAutoSizes: true,
  convertToTailwind: false,
  removeIdentityTransforms: true,
  simplifyColors: true,
  simplifyJsxStrings: true,
  removeOutlineStyles: true,
  wrapWithProps: true,
  baseFontSize: 100
});

// Handle debug classes removal
if (hasDebugFlag) {
  optimized = removeDebugClasses(optimized, DEBUG_CLASS_NAMES);
  console.log("  ✓ Removed debug class names");
}

console.log("  ✓ Basic optimizations complete");

// Step 3: Final cleanup
console.log("\nStep 3: Final cleanup...");
console.log("-".repeat(40));

// Remove empty lines left by removed divs
optimized = optimized.replace(/\n\s*\n\s*\n/g, "\n\n");

// Ensure consistent formatting
optimized = optimized
  .split("\n")
  .map((line) => line.replace(/\s+$/, ""))
  .join("\n");

console.log("  ✓ Formatting cleanup complete");

// Write output
const outputPath = inPlace ? resolvedPath : resolvedPath.replace(/\.tsx$/, ".optimized.tsx");
fs.writeFileSync(outputPath, optimized);

// Summary
const finalLines = optimized.split("\n").length;
const finalSize = optimized.length;

console.log("\n" + "=".repeat(60));
console.log("Optimization Summary");
console.log("=".repeat(60));
console.log(`
Lines:  ${originalLines} → ${finalLines} (${originalLines - finalLines} removed, ${((1 - finalLines / originalLines) * 100).toFixed(1)}% reduction)
Size:   ${originalSize} → ${finalSize} bytes (${originalSize - finalSize} bytes saved, ${((1 - finalSize / originalSize) * 100).toFixed(1)}% reduction)

Output: ${outputPath}
`);

// Handle --in-place message
if (inPlace) {
  console.log(`Original file updated: ${resolvedPath}`);
}

console.log("Done!");
