import { clamp01, lerp, sampleSeamlessFractalNoise, type SeamlessFractalNoiseOptions } from './seamless-noise';

export type ContourLandscapeTextureTheme = 'light' | 'dark';
export type ContourLandscapeTextureCanvasTheme = 'antique' | 'contour';

export const CONTOUR_LANDSCAPE_TILE_SIZE = 512;

interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

interface ThemePalette {
  readonly base: Rgb;
  readonly waterDeep: Rgb;
  readonly waterShallow: Rgb;
  readonly coast: Rgb;
  readonly lowland: Rgb;
  readonly upland: Rgb;
  readonly highland: Rgb;
  readonly peak: Rgb;
  readonly contourMinor: Rgb;
  readonly contourMajor: Rgb;
}

interface ContourLandscapeTextureConfig {
  readonly overallFade: number;
  readonly height: {
    readonly broad: SeamlessFractalNoiseOptions;
    readonly detail: SeamlessFractalNoiseOptions;
    readonly ridge: SeamlessFractalNoiseOptions;
    readonly gamma: number;
    readonly detailWeight: number;
    readonly ridgeWeight: number;
  };
  readonly water: {
    readonly enabled: boolean;
    readonly seaLevel: number;
    readonly coastWidth: number;
  };
  readonly contours: {
    readonly enabled: boolean;
    readonly interval: number;
    readonly majorEvery: number;
    readonly lineWidth: number;
    readonly landStrength: number;
    readonly waterStrength: number;
  };
}

export const CONTOUR_LANDSCAPE_TEXTURE_CONFIG: ContourLandscapeTextureConfig = {
  overallFade: 0.125,
  height: {
    broad: { cycleX: 1, cycleY: 1, octaves: 5, persistence: 0.5, lacunarity: 2 },
    detail: { cycleX: 5, cycleY: 5, octaves: 2, persistence: 0.5, lacunarity: 2 },
    ridge: { cycleX: 9, cycleY: 9, octaves: 2, persistence: 0.55, lacunarity: 2 },
    gamma: 1.02,
    detailWeight: 0.1,
    ridgeWeight: 0.04,
  },
  water: {
    enabled: true,
    seaLevel: 0.47,
    coastWidth: 0.028,
  },
  contours: {
    enabled: true,
    interval: 12,
    majorEvery: 4,
    lineWidth: 0.065,
    landStrength: 0.45,
    waterStrength: 0.16,
  },
};

function getPalette(theme: ContourLandscapeTextureTheme): ThemePalette {
  return theme === 'dark'
    ? {
      base: { r: 40, g: 42, b: 38 },
      waterDeep: { r: 32, g: 51, b: 63 },
      waterShallow: { r: 53, g: 74, b: 79 },
      coast: { r: 96, g: 108, b: 95 },
      lowland: { r: 74, g: 84, b: 64 },
      upland: { r: 102, g: 107, b: 78 },
      highland: { r: 128, g: 121, b: 91 },
      peak: { r: 155, g: 145, b: 115 },
      contourMinor: { r: 28, g: 26, b: 21 },
      contourMajor: { r: 12, g: 11, b: 9 },
    }
    : {
      base: { r: 232, g: 227, b: 208 },
      waterDeep: { r: 181, g: 203, b: 211 },
      waterShallow: { r: 208, g: 223, b: 219 },
      coast: { r: 198, g: 192, b: 158 },
      lowland: { r: 224, g: 220, b: 186 },
      upland: { r: 202, g: 194, b: 157 },
      highland: { r: 177, g: 164, b: 129 },
      peak: { r: 149, g: 135, b: 103 },
      contourMinor: { r: 138, g: 118, b: 85 },
      contourMajor: { r: 98, g: 81, b: 54 },
    };
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: lerp(a.r, b.r, t),
    g: lerp(a.g, b.g, t),
    b: lerp(a.b, b.b, t),
  };
}

function colorFromRamp(value: number, palette: ThemePalette): Rgb {
  if (value <= 0.33) {
    return mixRgb(palette.lowland, palette.upland, value / 0.33);
  }
  if (value <= 0.7) {
    return mixRgb(palette.upland, palette.highland, (value - 0.33) / 0.37);
  }
  return mixRgb(palette.highland, palette.peak, (value - 0.7) / 0.3);
}

function getContourStrength(elevationUnits: number, interval: number, width: number): number {
  const phase = elevationUnits / interval;
  const distance = Math.abs(phase - Math.round(phase));
  return clamp01(1 - (distance / width));
}

export function getContourLandscapeBaseColor(theme: ContourLandscapeTextureTheme): string {
  const palette = getPalette(theme);
  return `rgb(${palette.base.r}, ${palette.base.g}, ${palette.base.b})`;
}

export function generateContourLandscapeTextureTilePixelBuffer(
  width: number,
  height: number,
  theme: ContourLandscapeTextureTheme,
  seed: number,
  canvasTheme: ContourLandscapeTextureCanvasTheme = 'contour',
): Uint8ClampedArray {
  const palette = getPalette(theme);
  const data = new Uint8ClampedArray(Math.max(0, width * height * 4));
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);

  for (let y = 0; y < height; y += 1) {
    const v = y / safeHeight;

    for (let x = 0; x < width; x += 1) {
      const u = x / safeWidth;
      const broad = sampleSeamlessFractalNoise(seed, u, v, CONTOUR_LANDSCAPE_TEXTURE_CONFIG.height.broad);
      const detail = sampleSeamlessFractalNoise(seed + 1009, u, v, CONTOUR_LANDSCAPE_TEXTURE_CONFIG.height.detail);
      const ridge = 1 - Math.abs(sampleSeamlessFractalNoise(
        seed + 2017,
        u,
        v,
        CONTOUR_LANDSCAPE_TEXTURE_CONFIG.height.ridge,
      ));

      const combinedHeight = clamp01((((broad * (1 - CONTOUR_LANDSCAPE_TEXTURE_CONFIG.height.detailWeight - CONTOUR_LANDSCAPE_TEXTURE_CONFIG.height.ridgeWeight))
        + (detail * CONTOUR_LANDSCAPE_TEXTURE_CONFIG.height.detailWeight)
        + (((ridge * 2) - 1) * CONTOUR_LANDSCAPE_TEXTURE_CONFIG.height.ridgeWeight))
        + 1) / 2);
      const elevation = Math.pow(combinedHeight, CONTOUR_LANDSCAPE_TEXTURE_CONFIG.height.gamma);
      const index = (y * width + x) * 4;
      const isWater = CONTOUR_LANDSCAPE_TEXTURE_CONFIG.water.enabled
        && elevation < CONTOUR_LANDSCAPE_TEXTURE_CONFIG.water.seaLevel;

      let pixel = isWater
        ? canvasTheme === 'antique'
          ? colorFromRamp(
            clamp01((elevation - CONTOUR_LANDSCAPE_TEXTURE_CONFIG.water.seaLevel) / Math.max(1 - CONTOUR_LANDSCAPE_TEXTURE_CONFIG.water.seaLevel, 0.0001)),
            palette,
          )
          : mixRgb(
            palette.waterDeep,
            palette.waterShallow,
            clamp01(elevation / Math.max(CONTOUR_LANDSCAPE_TEXTURE_CONFIG.water.seaLevel, 0.0001)),
          )
        : colorFromRamp(
          clamp01((elevation - CONTOUR_LANDSCAPE_TEXTURE_CONFIG.water.seaLevel) / Math.max(1 - CONTOUR_LANDSCAPE_TEXTURE_CONFIG.water.seaLevel, 0.0001)),
          palette,
        );

      const coastDistance = Math.abs(elevation - CONTOUR_LANDSCAPE_TEXTURE_CONFIG.water.seaLevel);
      if (coastDistance <= CONTOUR_LANDSCAPE_TEXTURE_CONFIG.water.coastWidth) {
        pixel = mixRgb(
          pixel,
          palette.coast,
          clamp01(1 - (coastDistance / CONTOUR_LANDSCAPE_TEXTURE_CONFIG.water.coastWidth)),
        );
      }

      if (CONTOUR_LANDSCAPE_TEXTURE_CONFIG.contours.enabled) {
        const elevationUnits = (elevation - CONTOUR_LANDSCAPE_TEXTURE_CONFIG.water.seaLevel) * 220;
        const minorStrength = getContourStrength(
          elevationUnits,
          CONTOUR_LANDSCAPE_TEXTURE_CONFIG.contours.interval,
          CONTOUR_LANDSCAPE_TEXTURE_CONFIG.contours.lineWidth,
        );
        const majorStrength = getContourStrength(
          elevationUnits,
          CONTOUR_LANDSCAPE_TEXTURE_CONFIG.contours.interval * CONTOUR_LANDSCAPE_TEXTURE_CONFIG.contours.majorEvery,
          CONTOUR_LANDSCAPE_TEXTURE_CONFIG.contours.lineWidth * 1.2,
        );
        const lineColor = majorStrength > minorStrength ? palette.contourMajor : palette.contourMinor;
        const lineStrength = Math.max(
          majorStrength,
          minorStrength * (isWater
            ? CONTOUR_LANDSCAPE_TEXTURE_CONFIG.contours.waterStrength
            : CONTOUR_LANDSCAPE_TEXTURE_CONFIG.contours.landStrength),
        );

        pixel = mixRgb(pixel, lineColor, lineStrength);
      }

      pixel = mixRgb(palette.base, pixel, CONTOUR_LANDSCAPE_TEXTURE_CONFIG.overallFade);

      data[index] = Math.round(pixel.r);
      data[index + 1] = Math.round(pixel.g);
      data[index + 2] = Math.round(pixel.b);
      data[index + 3] = 255;
    }
  }

  for (let y = 0; y < height; y += 1) {
    const leftIndex = (y * width) * 4;
    const rightIndex = ((y * width) + Math.max(0, width - 1)) * 4;
    data[rightIndex] = data[leftIndex];
    data[rightIndex + 1] = data[leftIndex + 1];
    data[rightIndex + 2] = data[leftIndex + 2];
    data[rightIndex + 3] = data[leftIndex + 3];
  }

  for (let x = 0; x < width; x += 1) {
    const topIndex = x * 4;
    const bottomIndex = (((Math.max(0, height - 1) * width) + x) * 4);
    data[bottomIndex] = data[topIndex];
    data[bottomIndex + 1] = data[topIndex + 1];
    data[bottomIndex + 2] = data[topIndex + 2];
    data[bottomIndex + 3] = data[topIndex + 3];
  }

  return data;
}
