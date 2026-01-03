/**
 * Asset Downloader
 *
 * Downloads SVG and image assets from URLs and saves them to temp folder.
 * Supports extracting asset IDs from Figma JSON and downloading via Figma API.
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

/**
 * Figma API interface (mock - implement as needed)
 * This interface defines the contract for Figma API operations.
 * Pass your own implementation when using the downloader.
 */
export interface FigmaApi {
  /**
   * Get image URLs for given node IDs
   * @param fileKey - Figma file key
   * @param nodeIds - Array of node IDs to get images for
   * @param options - Image export options
   * @returns Map of nodeId to image URL
   */
  getImageUrls(
    fileKey: string,
    nodeIds: string[],
    options?: { format?: 'png' | 'jpg' | 'svg'; scale?: number }
  ): Promise<Map<string, string>>;

  /**
   * Get image fill URLs for given image hashes
   * @param fileKey - Figma file key
   * @param imageHashes - Array of image hashes (imageId from fills)
   * @returns Map of imageHash to image URL
   */
  getImageFillUrls(fileKey: string, imageHashes: string[]): Promise<Map<string, string>>;
}

/**
 * Asset IDs extracted from Figma JSON
 */
export interface ExtractedAssets {
  /** Image fill IDs (from style.fills with type IMAGE) */
  imageIds: string[];
  /** SVG node IDs (nodes that should be exported as SVG) */
  svgNodeIds: string[];
}

/**
 * Options for asset downloader
 */
export interface AssetDownloaderOptions {
  /** Base directory for temp files (default: './temp') */
  tempDir?: string;
  /** Subdirectory for images (default: 'images') */
  imagesSubdir?: string;
  /** Subdirectory for SVGs (default: 'svgs') */
  svgsSubdir?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Custom logger */
  logger?: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
}

/**
 * Asset download task
 */
export interface DownloadTask {
  /** URL to download from */
  url: string;
  /** Local filename to save as (without extension for images) */
  filename: string;
}

/**
 * Download result
 */
export interface DownloadResult {
  /** Successfully downloaded files */
  success: string[];
  /** Failed downloads with error messages */
  failed: Array<{ filename: string; url: string; error: string }>;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<Omit<AssetDownloaderOptions, 'logger'>> = {
  tempDir: './temp',
  imagesSubdir: 'images',
  svgsSubdir: 'svgs',
  timeout: 30000,
};

/**
 * Default logger (console)
 */
const defaultLogger = {
  info: (msg: string) => console.log(`[asset-downloader] ${msg}`),
  warn: (msg: string) => console.warn(`[asset-downloader] ${msg}`),
  error: (msg: string) => console.error(`[asset-downloader] ${msg}`),
};

/**
 * Extract asset IDs from Figma JSON composition
 *
 * @param figmaJson - Figma composition JSON (with children array)
 * @returns Extracted image IDs and SVG node IDs
 */
export function extractAssetIds(figmaJson: any): ExtractedAssets {
  const imageIds = new Set<string>();
  const svgNodeIds = new Set<string>();

  function collectFromNode(node: any): void {
    if (!node || typeof node !== 'object') return;

    // Collect image fill IDs
    const fills = node?.style?.fills;
    if (Array.isArray(fills)) {
      for (const fill of fills) {
        const fillType = String(fill?.type || '').toUpperCase();
        if (fillType === 'IMAGE' && typeof fill?.imageId === 'string') {
          imageIds.add(fill.imageId);
        }
      }
    }

    // Check if node should be exported as SVG
    // SVG nodes typically have svgContent or are vector-like nodes
    if (node.svgContent && typeof node.svgContent === 'string' && node.id) {
      svgNodeIds.add(String(node.id));
    }

    // Also check for nodes marked for SVG export
    const nodeType = String(node.type || '').toUpperCase();
    if (
      (nodeType === 'VECTOR' ||
        nodeType === 'BOOLEAN_OPERATION' ||
        nodeType === 'LINE' ||
        nodeType === 'STAR' ||
        nodeType === 'POLYGON' ||
        nodeType === 'ELLIPSE') &&
      node.id
    ) {
      // Vector nodes without svgContent need to be exported via API
      if (!node.svgContent) {
        svgNodeIds.add(String(node.id));
      }
    }

    // Recurse into children
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        collectFromNode(child);
      }
    }
  }

  // Process composition children
  const children = Array.isArray(figmaJson?.children) ? figmaJson.children : [];
  for (const child of children) {
    collectFromNode(child);
  }

  return {
    imageIds: Array.from(imageIds),
    svgNodeIds: Array.from(svgNodeIds),
  };
}

/**
 * Ensure directory exists
 */
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Download a file from URL
 */
function downloadFile(url: string, destPath: string, timeout: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    const request = protocol.get(url, { timeout }, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          downloadFile(redirectUrl, destPath, timeout).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      const fileStream = fs.createWriteStream(destPath);
      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });

      fileStream.on('error', (err) => {
        fs.unlink(destPath, () => {}); // Delete partial file
        reject(err);
      });
    });

    request.on('error', (err) => {
      reject(err);
    });

    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Asset Downloader class
 */
export class AssetDownloader {
  private options: Required<Omit<AssetDownloaderOptions, 'logger'>>;
  private logger: NonNullable<AssetDownloaderOptions['logger']>;
  private imagesDir: string;
  private svgsDir: string;

  constructor(options: AssetDownloaderOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.logger = options.logger || defaultLogger;
    this.imagesDir = path.join(this.options.tempDir, this.options.imagesSubdir);
    this.svgsDir = path.join(this.options.tempDir, this.options.svgsSubdir);
  }

  /**
   * Initialize directories
   */
  init(): void {
    ensureDir(this.imagesDir);
    ensureDir(this.svgsDir);
    this.logger.info(`Temp directories initialized: ${this.options.tempDir}`);
  }

  /**
   * Get the images directory path
   */
  getImagesDir(): string {
    return this.imagesDir;
  }

  /**
   * Get the SVGs directory path
   */
  getSvgsDir(): string {
    return this.svgsDir;
  }

  /**
   * Download images from URLs
   *
   * @param tasks - Array of download tasks
   * @returns Download result with success and failed lists
   */
  async downloadImages(tasks: DownloadTask[]): Promise<DownloadResult> {
    ensureDir(this.imagesDir);

    const success: string[] = [];
    const failed: DownloadResult['failed'] = [];

    for (const task of tasks) {
      const filename = task.filename.endsWith('.png') ? task.filename : `${task.filename}.png`;
      const destPath = path.join(this.imagesDir, filename);

      // Skip if already exists
      if (fs.existsSync(destPath)) {
        this.logger.info(`Image already exists: ${filename}`);
        success.push(filename);
        continue;
      }

      try {
        this.logger.info(`Downloading image: ${filename}`);
        await downloadFile(task.url, destPath, this.options.timeout);
        success.push(filename);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to download ${filename}: ${errorMsg}`);
        failed.push({ filename, url: task.url, error: errorMsg });
      }
    }

    this.logger.info(`Images: ${success.length} downloaded, ${failed.length} failed`);
    return { success, failed };
  }

  /**
   * Download SVGs from URLs
   *
   * @param tasks - Array of download tasks
   * @returns Download result with success and failed lists
   */
  async downloadSvgs(tasks: DownloadTask[]): Promise<DownloadResult> {
    ensureDir(this.svgsDir);

    const success: string[] = [];
    const failed: DownloadResult['failed'] = [];

    for (const task of tasks) {
      const filename = task.filename.endsWith('.svg') ? task.filename : `${task.filename}.svg`;
      const destPath = path.join(this.svgsDir, filename);

      // Skip if already exists
      if (fs.existsSync(destPath)) {
        this.logger.info(`SVG already exists: ${filename}`);
        success.push(filename);
        continue;
      }

      try {
        this.logger.info(`Downloading SVG: ${filename}`);
        await downloadFile(task.url, destPath, this.options.timeout);
        success.push(filename);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to download ${filename}: ${errorMsg}`);
        failed.push({ filename, url: task.url, error: errorMsg });
      }
    }

    this.logger.info(`SVGs: ${success.length} downloaded, ${failed.length} failed`);
    return { success, failed };
  }

  /**
   * Save SVG content directly (not from URL)
   *
   * @param filename - SVG filename
   * @param content - SVG content string
   * @returns true if saved successfully
   */
  saveSvgContent(filename: string, content: string): boolean {
    ensureDir(this.svgsDir);

    const svgFilename = filename.endsWith('.svg') ? filename : `${filename}.svg`;
    const destPath = path.join(this.svgsDir, svgFilename);

    try {
      fs.writeFileSync(destPath, content, 'utf8');
      this.logger.info(`Saved SVG: ${svgFilename}`);
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to save ${svgFilename}: ${errorMsg}`);
      return false;
    }
  }

  /**
   * Save image content directly (from buffer)
   *
   * @param filename - Image filename
   * @param buffer - Image buffer
   * @returns true if saved successfully
   */
  saveImageBuffer(filename: string, buffer: Buffer): boolean {
    ensureDir(this.imagesDir);

    const imgFilename = filename.endsWith('.png') ? filename : `${filename}.png`;
    const destPath = path.join(this.imagesDir, imgFilename);

    try {
      fs.writeFileSync(destPath, buffer);
      this.logger.info(`Saved image: ${imgFilename}`);
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to save ${imgFilename}: ${errorMsg}`);
      return false;
    }
  }

  /**
   * Check if an image exists in temp folder
   */
  imageExists(filename: string): boolean {
    const imgFilename = filename.endsWith('.png') ? filename : `${filename}.png`;
    return fs.existsSync(path.join(this.imagesDir, imgFilename));
  }

  /**
   * Check if a SVG exists in temp folder
   */
  svgExists(filename: string): boolean {
    const svgFilename = filename.endsWith('.svg') ? filename : `${filename}.svg`;
    return fs.existsSync(path.join(this.svgsDir, svgFilename));
  }

  /**
   * List all images in temp folder
   */
  listImages(): string[] {
    if (!fs.existsSync(this.imagesDir)) return [];
    return fs.readdirSync(this.imagesDir).filter((f) => f.endsWith('.png'));
  }

  /**
   * List all SVGs in temp folder
   */
  listSvgs(): string[] {
    if (!fs.existsSync(this.svgsDir)) return [];
    return fs.readdirSync(this.svgsDir).filter((f) => f.endsWith('.svg'));
  }

  /**
   * Download assets from Figma JSON using Figma API
   *
   * @param figmaJson - Figma composition JSON
   * @param fileKey - Figma file key
   * @param figmaApi - Figma API instance (implement FigmaApi interface)
   * @param options - Download options
   * @returns Download result with success and failed lists
   */
  async downloadFromFigmaJson(
    figmaJson: any,
    fileKey: string,
    figmaApi: FigmaApi,
    options?: { scale?: number }
  ): Promise<{ images: DownloadResult; svgs: DownloadResult }> {
    const extracted = extractAssetIds(figmaJson);
    this.logger.info(
      `Extracted ${extracted.imageIds.length} images and ${extracted.svgNodeIds.length} SVG nodes`
    );

    const imageResult = await this.downloadImagesFromFigma(
      extracted.imageIds,
      fileKey,
      figmaApi
    );

    const svgResult = await this.downloadSvgsFromFigma(
      extracted.svgNodeIds,
      fileKey,
      figmaApi
    );

    return { images: imageResult, svgs: svgResult };
  }

  /**
   * Download image fills from Figma using API
   *
   * @param imageIds - Array of image fill IDs (imageId from fills)
   * @param fileKey - Figma file key
   * @param figmaApi - Figma API instance
   * @returns Download result
   */
  async downloadImagesFromFigma(
    imageIds: string[],
    fileKey: string,
    figmaApi: FigmaApi
  ): Promise<DownloadResult> {
    if (!imageIds.length) {
      return { success: [], failed: [] };
    }

    ensureDir(this.imagesDir);
    const success: string[] = [];
    const failed: DownloadResult['failed'] = [];

    try {
      // Get URLs for all image fills
      this.logger.info(`Fetching URLs for ${imageIds.length} image fills...`);
      const urlMap = await figmaApi.getImageFillUrls(fileKey, imageIds);

      // Download each image
      for (const imageId of imageIds) {
        const filename = `${imageId}.png`;
        const destPath = path.join(this.imagesDir, filename);

        // Skip if already exists
        if (fs.existsSync(destPath)) {
          this.logger.info(`Image already exists: ${filename}`);
          success.push(imageId);
          continue;
        }

        const url = urlMap.get(imageId);
        if (!url) {
          this.logger.warn(`No URL found for image: ${imageId}`);
          failed.push({ filename, url: '', error: 'No URL returned from Figma API' });
          continue;
        }

        try {
          this.logger.info(`Downloading image: ${imageId}`);
          await downloadFile(url, destPath, this.options.timeout);
          success.push(imageId);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          this.logger.error(`Failed to download ${imageId}: ${errorMsg}`);
          failed.push({ filename, url, error: errorMsg });
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to fetch image URLs: ${errorMsg}`);
      for (const imageId of imageIds) {
        if (!success.includes(imageId)) {
          failed.push({ filename: `${imageId}.png`, url: '', error: errorMsg });
        }
      }
    }

    this.logger.info(`Images: ${success.length} downloaded, ${failed.length} failed`);
    return { success, failed };
  }

  /**
   * Download SVGs from Figma using API
   *
   * @param svgNodeIds - Array of node IDs to export as SVG
   * @param fileKey - Figma file key
   * @param figmaApi - Figma API instance
   * @returns Download result
   */
  async downloadSvgsFromFigma(
    svgNodeIds: string[],
    fileKey: string,
    figmaApi: FigmaApi
  ): Promise<DownloadResult> {
    if (!svgNodeIds.length) {
      return { success: [], failed: [] };
    }

    ensureDir(this.svgsDir);
    const success: string[] = [];
    const failed: DownloadResult['failed'] = [];

    try {
      // Get SVG URLs for all nodes
      this.logger.info(`Fetching URLs for ${svgNodeIds.length} SVG nodes...`);
      const urlMap = await figmaApi.getImageUrls(fileKey, svgNodeIds, { format: 'svg' });

      // Download each SVG
      for (const nodeId of svgNodeIds) {
        // Sanitize nodeId for filename (replace : with -)
        const safeNodeId = nodeId.replace(/:/g, '-');
        const filename = `${safeNodeId}.svg`;
        const destPath = path.join(this.svgsDir, filename);

        // Skip if already exists
        if (fs.existsSync(destPath)) {
          this.logger.info(`SVG already exists: ${filename}`);
          success.push(filename);
          continue;
        }

        const url = urlMap.get(nodeId);
        if (!url) {
          this.logger.warn(`No URL found for SVG node: ${nodeId}`);
          failed.push({ filename, url: '', error: 'No URL returned from Figma API' });
          continue;
        }

        try {
          this.logger.info(`Downloading SVG: ${nodeId}`);
          await downloadFile(url, destPath, this.options.timeout);
          success.push(filename);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          this.logger.error(`Failed to download ${nodeId}: ${errorMsg}`);
          failed.push({ filename, url, error: errorMsg });
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to fetch SVG URLs: ${errorMsg}`);
      for (const nodeId of svgNodeIds) {
        const safeNodeId = nodeId.replace(/:/g, '-');
        const filename = `${safeNodeId}.svg`;
        if (!success.includes(filename)) {
          failed.push({ filename, url: '', error: errorMsg });
        }
      }
    }

    this.logger.info(`SVGs: ${success.length} downloaded, ${failed.length} failed`);
    return { success, failed };
  }

  /**
   * Clean temp directories
   */
  clean(): void {
    if (fs.existsSync(this.imagesDir)) {
      fs.rmSync(this.imagesDir, { recursive: true });
    }
    if (fs.existsSync(this.svgsDir)) {
      fs.rmSync(this.svgsDir, { recursive: true });
    }
    this.logger.info('Temp directories cleaned');
  }
}

/**
 * Create an asset downloader instance
 */
export function createAssetDownloader(options?: AssetDownloaderOptions): AssetDownloader {
  return new AssetDownloader(options);
}

/**
 * Quick download function for images
 */
export async function downloadImages(
  tasks: DownloadTask[],
  options?: AssetDownloaderOptions
): Promise<DownloadResult> {
  const downloader = new AssetDownloader(options);
  return downloader.downloadImages(tasks);
}

/**
 * Quick download function for SVGs
 */
export async function downloadSvgs(
  tasks: DownloadTask[],
  options?: AssetDownloaderOptions
): Promise<DownloadResult> {
  const downloader = new AssetDownloader(options);
  return downloader.downloadSvgs(tasks);
}

/**
 * Quick download function from Figma JSON
 *
 * @param figmaJson - Figma composition JSON
 * @param fileKey - Figma file key
 * @param figmaApi - Figma API instance (implement FigmaApi interface)
 * @param options - Downloader options
 * @returns Download results for images and SVGs
 *
 * @example
 * ```typescript
 * // Create a mock Figma API implementation
 * const mockFigmaApi: FigmaApi = {
 *   async getImageUrls(fileKey, nodeIds, options) {
 *     // Call Figma REST API: GET /v1/images/:file_key?ids=:nodeIds&format=svg
 *     return new Map([['1:23', 'https://...']]);
 *   },
 *   async getImageFillUrls(fileKey, imageHashes) {
 *     // Call Figma REST API: GET /v1/files/:file_key/images
 *     return new Map([['abc123', 'https://...']]);
 *   },
 * };
 *
 * const result = await downloadFromFigmaJson(figmaJson, 'file-key', mockFigmaApi);
 * console.log(result.images.success); // Downloaded image IDs
 * console.log(result.svgs.success);   // Downloaded SVG filenames
 * ```
 */
export async function downloadFromFigmaJson(
  figmaJson: any,
  fileKey: string,
  figmaApi: FigmaApi,
  options?: AssetDownloaderOptions
): Promise<{ images: DownloadResult; svgs: DownloadResult }> {
  const downloader = new AssetDownloader(options);
  return downloader.downloadFromFigmaJson(figmaJson, fileKey, figmaApi);
}
