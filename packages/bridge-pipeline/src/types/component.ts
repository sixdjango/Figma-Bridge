/**
 * Component mapping types for custom component rendering
 */

/** Import method for component */
export type ImportWay = 'DEFAULT' | 'NAMED';

/** Component type */
export type ComponentType = 'NORMAL' | 'SLICE';

/**
 * Component mapping configuration
 * Maps a Figma node ID to a custom component
 */
export interface ComponentMapping {
  /** The Figma node ID this component maps to */
  nodeID: string;
  /** Component tag name, e.g., "Tab" renders as <Tab> */
  type: string;
  /** NORMAL: from component library, SLICE: slice component for splitting large designs */
  componentType: ComponentType;
  /** Props to pass to the component */
  props: Record<string, unknown>;
  /** Library to import from, e.g., "@/components/ui" */
  fromLib: string;
  /** Import method: DEFAULT or NAMED */
  importWay: ImportWay;
}

/**
 * Slice configuration for splitting large Figma designs
 */
export interface SliceConfig {
  /** Components in this slice */
  components: ComponentMapping[];
  /** The Figma composition data for this slice */
  figmaJson: unknown;
}

/**
 * Layout configuration containing the main layout and slices
 */
export interface LayoutConfig {
  /** The main layout configuration */
  layout: {
    /** Components and slice references in the layout */
    components: ComponentMapping[];
    /** The Figma composition data for the layout */
    figmaJson: unknown;
  };
  /** Slices that the layout references */
  slices: SliceConfig[];
}

/**
 * Resolved component info attached to RenderNodeIR
 */
export interface ResolvedComponent {
  /** Component tag name */
  tagName: string;
  /** Component props */
  props: Record<string, unknown>;
  /** Whether this is a slice component */
  isSlice: boolean;
  /** Import info */
  importInfo: {
    from: string;
    importWay: ImportWay;
  };
}
