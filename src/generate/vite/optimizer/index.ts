/**
 * AST-based React Component Optimizer
 *
 * This module provides optimization functions for Figma-generated React components
 * using AST parsing for robust code transformation.
 */

export * from "./types";
export * from "./ast-utils";
export * from "./transforms";
export * from "./tailwind-converter";
export * from "./nested-divs";
export * from "./root-merge";
export { optimizeReactComponent, default } from "./main";
