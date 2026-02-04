#!/usr/bin/env ts-node
/**
 * Comprehensive optimization pipeline for Figma-generated React components
 *
 * This script runs multiple optimization passes:
 * 1. Clean redundant code (identity transforms, auto sizes, empty divs, etc.)
 * 2. Merge single-child nested divs
 * 3. Final cleanup
 *
 * Usage: npm run optimize-all -- <path-to-tsx-file> [options]
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

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
  1. optimize-component --aggressive (clean redundant code)
  2. optimize-layers (merge nested single-child divs)
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

// Step 1: Run optimize-component
console.log("Step 1: Cleaning redundant code...");
console.log("-".repeat(40));

const componentOpts = hasDebugFlag ? "--aggressive --remove-debug-classes" : "--aggressive";
const projectRoot = path.resolve(__dirname, "../..");

try {
  execSync(`npm run optimize-component -- "${resolvedPath}" ${componentOpts}`, {
    stdio: "inherit",
    cwd: projectRoot,
  });
} catch (e) {
  console.error("Step 1 failed");
  process.exit(1);
}

// Step 2: Run optimize-layers on the result
const step1Output = resolvedPath.replace(/\.tsx$/, ".optimized.tsx");
if (!fs.existsSync(step1Output)) {
  console.error("Step 1 output not found");
  process.exit(1);
}

console.log("\nStep 2: Merging nested single-child divs...");
console.log("-".repeat(40));

try {
  execSync(`npm run optimize-layers -- "${step1Output}"`, {
    stdio: "inherit",
    cwd: projectRoot,
  });
} catch (e) {
  // optimize-layers might not find anything to optimize, that's OK
  console.log("  (No additional nesting optimizations found)");
}

// Determine final output
let finalOutput = step1Output;
const step2Output = step1Output.replace(/\.tsx$/, ".optimized.tsx");
if (fs.existsSync(step2Output)) {
  // Step 2 produced output, use it
  fs.unlinkSync(step1Output); // Remove intermediate file
  fs.renameSync(step2Output, step1Output); // Rename to expected output
  finalOutput = step1Output;
}

// Step 3: Final cleanup - format the file
console.log("\nStep 3: Final cleanup...");
console.log("-".repeat(40));

let finalContent = fs.readFileSync(finalOutput, "utf-8");

// Remove empty lines left by removed divs
finalContent = finalContent.replace(/\n\s*\n\s*\n/g, "\n\n");

// Ensure consistent formatting
finalContent = finalContent
  .split("\n")
  .map((line) => line.replace(/\s+$/, ""))
  .join("\n");

fs.writeFileSync(finalOutput, finalContent);

// Summary
const finalLines = finalContent.split("\n").length;
const finalSize = finalContent.length;

console.log("\n" + "=".repeat(60));
console.log("Optimization Summary");
console.log("=".repeat(60));
console.log(`
Lines:  ${originalLines} → ${finalLines} (${originalLines - finalLines} removed, ${((1 - finalLines / originalLines) * 100).toFixed(1)}% reduction)
Size:   ${originalSize} → ${finalSize} bytes (${originalSize - finalSize} bytes saved, ${((1 - finalSize / originalSize) * 100).toFixed(1)}% reduction)

Output: ${finalOutput}
`);

// Handle --in-place flag
if (inPlace) {
  fs.copyFileSync(finalOutput, resolvedPath);
  fs.unlinkSync(finalOutput);
  console.log(`Original file updated: ${resolvedPath}`);
}

console.log("Done!");
