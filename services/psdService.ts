import { readPsd, writePsd, Psd, ReadOptions, WriteOptions, Layer } from 'ag-psd';
import { TemplateMetadata, ContainerDefinition, DesignValidationReport, ValidationIssue, SerializableLayer, ContainerContext, TransformedPayload, TransformedLayer } from '../types';

// --- Procedural Palette & Theme Logic ---

interface PaletteTheme {
  name: string;
  border: string;
  bg: string;
  text: string;
  dot: string; // Added for UI elements requiring a solid accent
}

export const CONTAINER_PALETTE: PaletteTheme[] = [
  // 1. Purple (Legacy: BG)
  { name: 'Purple', border: 'border-purple-500', bg: 'bg-purple-500/20', text: 'text-purple-200', dot: 'bg-purple-400' },
  // 2. Orange (Legacy: SYMBOLS)
  { name: 'Orange', border: 'border-orange-500', bg: 'bg-orange-500/20', text: 'text-orange-200', dot: 'bg-orange-400' },
  // 3. Blue (Legacy: COUNTERS)
  { name: 'Blue', border: 'border-blue-500', bg: 'bg-blue-500/20', text: 'text-blue-200', dot: 'bg-blue-400' },
  // 4. Pink
  { name: 'Pink', border: 'border-pink-500', bg: 'bg-pink-500/20', text: 'text-pink-200', dot: 'bg-pink-400' },
  // 5. Teal
  { name: 'Teal', border: 'border-teal-500', bg: 'bg-teal-500/20', text: 'text-teal-200', dot: 'bg-teal-400' },
  // 6. Amber
  { name: 'Amber', border: 'border-amber-500', bg: 'bg-amber-500/20', text: 'text-amber-200', dot: 'bg-amber-400' },
  // 7. Rose
  { name: 'Rose', border: 'border-rose-500', bg: 'bg-rose-500/20', text: 'text-rose-200', dot: 'bg-rose-400' },
  // 8. Indigo
  { name: 'Indigo', border: 'border-indigo-500', bg: 'bg-indigo-500/20', text: 'text-indigo-200', dot: 'bg-indigo-400' },
];

/**
 * Returns a consistent Tailwind theme string based on container name or index.
 * Prioritizes semantic naming conventions (BG, SYMBOLS) before falling back to index-based rotation.
 * 
 * @param name The container name (e.g., "BG Layer")
 * @param index The deterministic index of the container
 * @returns A string of tailwind classes (border, bg, text)
 */
export const getSemanticTheme = (name: string, index: number): string => {
  const upperName = name.toUpperCase();
  let theme: PaletteTheme | undefined;

  // 1. Semantic Matching (Legacy/Priority)
  if (upperName.includes('BG')) {
    theme = CONTAINER_PALETTE.find(t => t.name === 'Purple');
  } else if (upperName.includes('SYMBOL')) {
    theme = CONTAINER_PALETTE.find(t => t.name === 'Orange');
  } else if (upperName.includes('COUNTER')) {
    theme = CONTAINER_PALETTE.find(t => t.name === 'Blue');
  }

  // 2. Index Fallback (Procedural)
  if (!theme) {
    const paletteIndex = index % CONTAINER_PALETTE.length;
    theme = CONTAINER_PALETTE[paletteIndex];
  }

  // 3. Return constructed class string
  // Default fallback if something goes wrong (shouldn't happen with math)
  const safeTheme = theme || CONTAINER_PALETTE[0];
  
  return `${safeTheme.border} ${safeTheme.bg} ${safeTheme.text}`;
};

/**
 * Retrieves the full theme object if structured access (like dot color) is needed.
 */
export const getSemanticThemeObject = (name: string, index: number): PaletteTheme => {
    const upperName = name.toUpperCase();
    let theme: PaletteTheme | undefined;
  
    if (upperName.includes('BG')) {
      theme = CONTAINER_PALETTE.find(t => t.name === 'Purple');
    } else if (upperName.includes('SYMBOL')) {
      theme = CONTAINER_PALETTE.find(t => t.name === 'Orange');
    } else if (upperName.includes('COUNTER')) {
      theme = CONTAINER_PALETTE.find(t => t.name === 'Blue');
    }
  
    if (!theme) {
      const paletteIndex = index % CONTAINER_PALETTE.length;
      theme = CONTAINER_PALETTE[paletteIndex];
    }
  
    return theme || CONTAINER_PALETTE[0];
};

export interface PSDParseOptions {
  /**
   * Whether to skip parsing layer image data.
   * Defaults to false (we need image data for procedural generation).
   */
  skipLayerImageData?: boolean;
  /**
   * Whether to skip parsing the thumbnail.
   * Defaults to true to save resources.
   */
  skipThumbnail?: boolean;
}

/**
 * Parses a PSD file using ag-psd with enhanced error handling and configuration.
 * @param file The File object to parse.
 * @param options Configuration options for parsing.
 * @returns A Promise resolving to the parsed Psd object.
 */
export const parsePsdFile = async (file: File, options: PSDParseOptions = {}): Promise<Psd> => {
  return new Promise((resolve, reject) => {
    // Input validation
    if (!file) {
      reject(new Error('No file provided for parsing.'));
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const arrayBuffer = reader.result;

      // Ensure we have a valid ArrayBuffer
      if (!arrayBuffer || !(arrayBuffer instanceof ArrayBuffer)) {
        reject(new Error('FileReader failed to produce a valid ArrayBuffer.'));
        return;
      }

      if (arrayBuffer.byteLength === 0) {
        reject(new Error('The provided file is empty.'));
        return;
      }

      try {
        // Configure parsing options
        const readOptions: ReadOptions = {
          skipLayerImageData: options.skipLayerImageData ?? false,
          skipThumbnail: options.skipThumbnail ?? true,
        };

        // Attempt to parse the PSD
        const psd = readPsd(arrayBuffer, readOptions);
        resolve(psd);

      } catch (error: any) {
        console.error("PSD Parsing Logic Error:", error);

        // Distinguish between different types of errors
        let errorMessage = 'Failed to parse PSD structure.';
        
        if (error instanceof Error) {
          // Check for common ag-psd or format errors
          if (error.message.includes('Invalid signature') || error.message.includes('Signature not found')) {
            errorMessage = 'Invalid file format. The file does not appear to be a valid Adobe Photoshop file.';
          } else if (error.message.includes('RangeError') || error.message.includes('Out of bounds')) {
             errorMessage = 'The PSD file appears to be corrupted or truncated (Buffer out of bounds).';
          } else {
             errorMessage = `PSD Parsing Error: ${error.message}`;
          }
        }

        reject(new Error(errorMessage));
      }
    };

    reader.onerror = () => {
      const msg = reader.error ? reader.error.message : 'Unknown IO error';
      console.error("FileReader Error:", reader.error);
      reject(new Error(`Failed to read file from disk: ${msg}`));
    };

    // Start reading
    reader.readAsArrayBuffer(file);
  });
};

/**
 * Extracts metadata for the procedural logic engine from the parsed PSD.
 * Looks for a top-level group named '!!TEMPLATE' and extracts its children as containers.
 */
export const extractTemplateMetadata = (psd: Psd): TemplateMetadata => {
  // Default to 1 to avoid division by zero if undefined, though PSDs usually have dims.
  const canvasWidth = psd.width || 1;
  const canvasHeight = psd.height || 1;

  const containers: ContainerDefinition[] = [];

  // Find the !!TEMPLATE group
  const templateGroup = psd.children?.find(child => child.name === '!!TEMPLATE');

  if (templateGroup && templateGroup.children) {
    templateGroup.children.forEach((child, index) => {
      // Skip invisible layers if needed, but for now we include all structure
      
      const top = child.top ?? 0;
      const left = child.left ?? 0;
      const bottom = child.bottom ?? 0;
      const right = child.right ?? 0;
      
      const width = right - left;
      const height = bottom - top;

      // Extract raw procedural name
      let rawName = child.name || `Container ${index}`;
      
      // Clean name (remove !! prefix if it exists, though typically the parent is marked, children might be too)
      const cleanName = rawName.replace(/^!!/, '');

      containers.push({
        id: `container-${index}`,
        name: cleanName,
        originalName: rawName,
        bounds: {
          x: left,
          y: top,
          w: width,
          h: height,
        },
        normalized: {
          x: left / canvasWidth,
          y: top / canvasHeight,
          w: width / canvasWidth,
          h: height / canvasHeight,
        },
      });
    });
  }

  return {
    canvas: {
      width: canvasWidth,
      height: canvasHeight,
    },
    containers,
  };
};

// --- Container Validation Logic ---
export const mapLayersToContainers = (psd: Psd, template: TemplateMetadata): DesignValidationReport => {
    const issues: ValidationIssue[] = [];
    const designRoot = psd.children?.find(c => c.name !== '!!TEMPLATE'); 
    
    // Basic validation to check if the file has content other than the template
    if (!designRoot && (!psd.children || psd.children.length === 0)) {
        issues.push({
            layerName: 'Root',
            containerName: 'Global',
            type: 'PROCEDURAL_VIOLATION',
            message: 'PSD appears empty or missing design layers.'
        });
    }

    return {
        isValid: issues.length === 0,
        issues
    };
};

// --- Layer Tree Flattening/Cleaning ---
export const getCleanLayerTree = (layers: Layer[], parentId = 'root'): SerializableLayer[] => {
    return layers.map((layer, index) => {
        const id = `${parentId}-${index}`; // Generate deterministic ID
        
        let type: 'layer' | 'group' | 'generative' = 'layer';
        if (layer.children) type = 'group';
        
        const serializable: SerializableLayer = {
            id: id,
            name: layer.name || `Layer ${index}`,
            type: type,
            isVisible: !layer.hidden,
            opacity: layer.opacity != null ? layer.opacity / 255 : 1,
            coords: {
                x: layer.left || 0,
                y: layer.top || 0,
                w: (layer.right || 0) - (layer.left || 0),
                h: (layer.bottom || 0) - (layer.top || 0)
            },
            children: layer.children ? getCleanLayerTree(layer.children, id) : undefined
        };
        return serializable;
    });
};

// --- Context Factory ---
export const createContainerContext = (template: TemplateMetadata, containerName: string): ContainerContext | null => {
    const container = template.containers.find(c => c.name === containerName);
    if (!container) return null;

    return {
        containerName: container.name,
        bounds: container.bounds,
        canvasDimensions: { w: template.canvas.width, h: template.canvas.height }
    };
};

// --- Layer Finder ---
export const findLayerByPath = (psd: Psd, layerId: string): Layer | null => {
    if (!layerId) return null;
    
    // Expects id format "root-index-index..."
    const indices = layerId.split('-').slice(1).map(s => parseInt(s, 10));
    let currentLayers = psd.children;
    let currentLayer: Layer | null = null;
    
    for (const idx of indices) {
        if (!currentLayers || idx >= currentLayers.length) return null;
        currentLayer = currentLayers[idx];
        currentLayers = currentLayer.children;
    }
    
    return currentLayer;
};

// --- File Writer ---
export const writePsdFile = async (psd: Psd, filename: string): Promise<void> => {
    const buffer = writePsd(psd); 
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

// --- Canvas Compositor for Preview ---
export const compositePayloadToCanvas = async (payload: TransformedPayload, psd: Psd): Promise<string | null> => {
    const { w, h } = payload.metrics.target;
    if (w <= 0 || h <= 0) return null;
    
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const targetX = payload.metrics.target.x || 0;
    const targetY = payload.metrics.target.y || 0;

    const drawLayers = (layers: TransformedLayer[]) => {
        // Render bottom-up (reverse painter's)
        for (let i = layers.length - 1; i >= 0; i--) {
            const layer = layers[i];
            if (!layer.isVisible) continue;

            if (layer.type === 'generative') {
                ctx.save();
                ctx.fillStyle = 'rgba(124, 58, 237, 0.3)'; // Placeholder for gen layers in this simple preview
                ctx.strokeStyle = 'rgba(124, 58, 237, 0.8)';
                ctx.lineWidth = 1;
                const lx = layer.coords.x - targetX;
                const ly = layer.coords.y - targetY;
                ctx.fillRect(lx, ly, layer.coords.w, layer.coords.h);
                ctx.strokeRect(lx, ly, layer.coords.w, layer.coords.h);
                ctx.restore();
            } else if (layer.type !== 'group') {
                const originalLayer = findLayerByPath(psd, layer.id);
                if (originalLayer && originalLayer.canvas) {
                    ctx.save();
                    ctx.globalAlpha = layer.opacity;
                    
                    const lx = layer.coords.x - targetX;
                    const ly = layer.coords.y - targetY;
                    const rot = layer.transform.rotation || 0;
                    
                    if (rot !== 0) {
                        const cx = lx + layer.coords.w / 2;
                        const cy = ly + layer.coords.h / 2;
                        ctx.translate(cx, cy);
                        ctx.rotate((rot * Math.PI) / 180);
                        ctx.translate(-cx, -cy);
                    }
                    
                    ctx.drawImage(originalLayer.canvas, lx, ly, layer.coords.w, layer.coords.h);
                    ctx.restore();
                }
            }

            if (layer.children) {
                drawLayers(layer.children);
            }
        }
    };
    
    drawLayers(payload.layers);
    
    return canvas.toDataURL('image/png');
};
