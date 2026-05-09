// Watermark/Branding Overlay Service
import { kvGet, kvSet } from './puterService';

export interface WatermarkConfig {
  enabled: boolean;
  type: 'logo' | 'text' | 'both';
  logoUrl?: string;
  text?: string;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  opacity: number;
  size: 'small' | 'medium' | 'large';
  padding: number;
  textColor?: string;
  textFont?: string;
}

const DEFAULT_CONFIG: WatermarkConfig = {
  enabled: false,
  type: 'logo',
  position: 'bottom-right',
  opacity: 0.8,
  size: 'medium',
  padding: 20,
  textColor: '#ffffff',
  textFont: 'Arial',
};

// Get watermark configuration
export async function getWatermarkConfig(): Promise<WatermarkConfig> {
  const saved = await kvGet('watermark_config');
  if (saved) {
    try {
      return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
    } catch (parseError) {
      console.warn('[getWatermarkConfig] Failed to parse saved config:', parseError instanceof Error ? parseError.message : 'Unknown error');
    }
  }
  return DEFAULT_CONFIG;
}

// Save watermark configuration
export async function saveWatermarkConfig(config: Partial<WatermarkConfig>): Promise<void> {
  const current = await getWatermarkConfig();
  const updated = { ...current, ...config };
  await kvSet('watermark_config', JSON.stringify(updated));
}

// Apply watermark to image using canvas
export async function applyWatermark(
  imageUrl: string,
  config?: Partial<WatermarkConfig>
): Promise<string> {
  const watermarkConfig = config ? { ...await getWatermarkConfig(), ...config } : await getWatermarkConfig();
  
  if (!watermarkConfig.enabled) {
    return imageUrl;
  }
  
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      reject(new Error('Canvas context not available'));
      return;
    }
    
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = async () => {
      canvas.width = img.width;
      canvas.height = img.height;
      
      // Draw original image
      ctx.drawImage(img, 0, 0);
      
      // Calculate watermark position
      const { x, y } = calculatePosition(
        canvas.width,
        canvas.height,
        watermarkConfig.position,
        watermarkConfig.padding,
        watermarkConfig.size
      );
      
      // Apply watermark based on type
      ctx.globalAlpha = watermarkConfig.opacity;
      
      if (watermarkConfig.type === 'logo' || watermarkConfig.type === 'both') {
        if (watermarkConfig.logoUrl) {
          await drawLogo(ctx, watermarkConfig.logoUrl, x, y, watermarkConfig.size);
        }
      }
      
      if (watermarkConfig.type === 'text' || watermarkConfig.type === 'both') {
        if (watermarkConfig.text) {
          const textY = watermarkConfig.type === 'both' ? y + getSizePixels(watermarkConfig.size) + 10 : y;
          drawText(ctx, watermarkConfig.text, x, textY, watermarkConfig);
        }
      }
      
      ctx.globalAlpha = 1;
      
      // Convert to data URL
      const dataUrl = canvas.toDataURL('image/png');
      resolve(dataUrl);
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };
    
    img.src = imageUrl;
  });
}

// Calculate position based on config
function calculatePosition(
  canvasWidth: number,
  canvasHeight: number,
  position: WatermarkConfig['position'],
  padding: number,
  size: WatermarkConfig['size']
): { x: number; y: number } {
  const sizePixels = getSizePixels(size);
  
  switch (position) {
    case 'top-left':
      return { x: padding, y: padding };
    case 'top-right':
      return { x: canvasWidth - sizePixels - padding, y: padding };
    case 'bottom-left':
      return { x: padding, y: canvasHeight - sizePixels - padding };
    case 'bottom-right':
      return { x: canvasWidth - sizePixels - padding, y: canvasHeight - sizePixels - padding };
    case 'center':
      return { x: (canvasWidth - sizePixels) / 2, y: (canvasHeight - sizePixels) / 2 };
    default:
      return { x: canvasWidth - sizePixels - padding, y: canvasHeight - sizePixels - padding };
  }
}

function getSizePixels(size: WatermarkConfig['size']): number {
  switch (size) {
    case 'small':
      return 50;
    case 'medium':
      return 100;
    case 'large':
      return 150;
    default:
      return 100;
  }
}

// Draw logo watermark
function drawLogo(
  ctx: CanvasRenderingContext2D,
  logoUrl: string,
  x: number,
  y: number,
  size: WatermarkConfig['size']
): Promise<void> {
  return new Promise((resolve, reject) => {
    const logo = new Image();
    logo.crossOrigin = 'anonymous';
    
    logo.onload = () => {
      const sizePixels = getSizePixels(size);
      const aspectRatio = logo.width / logo.height;
      
      let drawWidth = sizePixels;
      let drawHeight = sizePixels;
      
      if (aspectRatio > 1) {
        drawHeight = sizePixels / aspectRatio;
      } else {
        drawWidth = sizePixels * aspectRatio;
      }
      
      ctx.drawImage(logo, x, y, drawWidth, drawHeight);
      resolve();
    };
    
    logo.onerror = () => reject(new Error('Failed to load logo'));
    logo.src = logoUrl;
  });
}

// Draw text watermark
function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  config: WatermarkConfig
): void {
  const fontSize = getSizePixels(config.size) / 3;
  
  ctx.font = `bold ${fontSize}px ${config.textFont || 'Arial'}`;
  ctx.fillStyle = config.textColor || '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  
  // Add text shadow for better visibility
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  
  ctx.fillText(text, x, y);
  
  // Reset shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

// Batch process multiple images
export async function applyWatermarkBatch(
  imageUrls: string[],
  config?: Partial<WatermarkConfig>
): Promise<string[]> {
  const results: string[] = [];
  
  for (const url of imageUrls) {
    try {
      const watermarked = await applyWatermark(url, config);
      results.push(watermarked);
    } catch {
      results.push(url); // Return original if watermarking fails
    }
  }
  
  return results;
}

// Preview watermark on a sample image
export async function previewWatermark(
  sampleImageUrl: string,
  config: Partial<WatermarkConfig>
): Promise<string> {
  return applyWatermark(sampleImageUrl, { ...config, enabled: true });
}
