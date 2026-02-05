#!/usr/bin/env ts-node
/**
 * CLI wrapper for Nested Layers Optimizer
 *
 * This script uses the optimizer module to merge nested single-child div elements.
 *
 * Usage: npm run optimize-layers -- <path-to-tsx-file>
 */

import * as fs from "fs";
import * as path from "path";
import { optimizeNestedDivs } from "../generate/vite/optimizer";

/**
 * Main function
 */
function optimizeFile(filePath: string): void {
  console.log(`Optimizing: ${filePath}`);

  const content = fs.readFileSync(filePath, "utf-8");
  const originalContent = content;

  let optimized = optimizeNestedDivs(content);
  optimized = optimized
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n");

  if (optimized === originalContent) {
    console.log("No optimizations found.");
    return;
  }

  const outputPath = filePath.replace(/\.tsx$/, ".optimized.tsx");
  fs.writeFileSync(outputPath, optimized);
  console.log(`Optimized file written to: ${outputPath}`);

  const originalLines = originalContent.split("\n").length;
  const optimizedLines = optimized.split("\n").length;
  console.log(`Lines: ${originalLines} -> ${optimizedLines} (${originalLines - optimizedLines} reduced)`);
}

// Main entry point
const args = process.argv.slice(2);

if (args.length === 0 || args.includes("--help")) {
  console.log(`
Nested Layers Optimizer for React Components

Usage: npm run optimize-layers -- <path-to-tsx-file>

This script merges multi-level nested single-child div elements into a single element,
combining their classNames and styles appropriately.

Rules:
1. Merge from the last node upward
2. If the last node is a component (uppercase), don't modify it, merge parents above
3. Position values (left, top, right, bottom) are summed when merging
4. Handle both Tailwind format (top-[5px]) and style format ({top: "5px"})
5. Child styles have higher priority for same-domain properties (except positions which sum)
6. Preserve the outermost z-index

Example:
  npm run optimize-layers -- examples/vite/src/generated/Layout/index.tsx
`);
  process.exit(0);
}

const targetPath = path.resolve(args[0]);

if (!fs.existsSync(targetPath)) {
  console.error(`File not found: ${targetPath}`);
  process.exit(1);
}

optimizeFile(targetPath);
