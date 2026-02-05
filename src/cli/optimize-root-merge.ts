#!/usr/bin/env ts-node
/**
 * CLI wrapper for Root Merge Optimizer
 *
 * This script uses the optimizer module to merge nested divs into baseClassName/baseStyle.
 *
 * Usage: npm run optimize-root -- <path-to-tsx-file>
 */

import * as fs from "fs";
import * as path from "path";
import { optimizeRootMerge } from "../generate/vite/optimizer";

// Main entry point
const args = process.argv.slice(2);

if (args.length === 0 || args.includes("--help")) {
  console.log(`
Root Merge Optimization for React Components

Usage: npm run optimize-root -- <path-to-tsx-file>

This script detects components using baseClassName/baseStyle pattern
and merges nested div classes/styles into the base constants.

Features:
- Detects baseClassName/baseStyle spread pattern
- Merges nested div chains into base constants
- Resolves conflicting classes (child priority)
- Preserves layout semantics

Example:
  npm run optimize-root -- examples/vite/src/generated/Layout/index.tsx
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

console.log(`Optimizing: ${resolvedPath}`);

const content = fs.readFileSync(resolvedPath, "utf-8");
const optimized = optimizeRootMerge(content);

if (optimized === content) {
  console.log("No changes made");
  process.exit(0);
}

const outputPath = resolvedPath.replace(/\.tsx$/, ".merged.tsx");
fs.writeFileSync(outputPath, optimized);
console.log(`\nOutput written to: ${outputPath}`);

const originalLines = content.split("\n").length;
const optimizedLines = optimized.split("\n").length;
console.log(`Lines: ${originalLines} → ${optimizedLines} (${originalLines - optimizedLines} removed)`);
