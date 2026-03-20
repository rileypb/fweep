export type PaperTextureTheme = 'light' | 'dark';

export const PAPER_TEXTURE_CHUNK_MAP_SIZE = 256;

export interface PaperTextureRenderOptions {
  readonly mapOriginX?: number;
  readonly mapOriginY?: number;
  readonly pixelsPerMapUnit?: number;
}

interface PaperPalette {
  readonly base: [number, number, number];
  readonly highlight: [number, number, number];
  readonly shadow: [number, number, number];
  readonly fiber: [number, number, number];
  readonly burn: [number, number, number];
}

function getPalette(theme: PaperTextureTheme): PaperPalette {
  return theme === 'dark'
    ? {
      base: [41, 37, 30],
      highlight: [58, 52, 42],
      shadow: [24, 21, 17],
      fiber: [78, 69, 55],
      burn: [10, 8, 6],
    }
    : {
      base: [236, 227, 199],
      highlight: [247, 239, 214],
      shadow: [208, 191, 149],
      fiber: [175, 151, 103],
      burn: [82, 56, 31],
    };
}

function fade(value: number): number {
  return value * value * value * (value * ((value * 6) - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + ((b - a) * t);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function hash2d(seed: number, x: number, y: number): number {
  let hash = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  hash = (hash ^ (hash >>> 13)) >>> 0;
  hash = Math.imul(hash, 1274126177) >>> 0;
  return hash ^ (hash >>> 16);
}

function gradient(seed: number, x: number, y: number): { readonly x: number; readonly y: number } {
  const angle = (hash2d(seed, x, y) / 0xffffffff) * Math.PI * 2;
  return {
    x: Math.cos(angle),
    y: Math.sin(angle),
  };
}

function perlin2d(seed: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const x1 = x0 + 1;
  const y0 = Math.floor(y);
  const y1 = y0 + 1;

  const sx = fade(x - x0);
  const sy = fade(y - y0);

  const g00 = gradient(seed, x0, y0);
  const g10 = gradient(seed, x1, y0);
  const g01 = gradient(seed, x0, y1);
  const g11 = gradient(seed, x1, y1);

  const n00 = (x - x0) * g00.x + (y - y0) * g00.y;
  const n10 = (x - x1) * g10.x + (y - y0) * g10.y;
  const n01 = (x - x0) * g01.x + (y - y1) * g01.y;
  const n11 = (x - x1) * g11.x + (y - y1) * g11.y;

  return lerp(
    lerp(n00, n10, sx),
    lerp(n01, n11, sx),
    sy,
  );
}

function fractalNoise(seed: number, x: number, y: number): number {
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;
  let normalization = 0;

  for (let octave = 0; octave < 5; octave += 1) {
    total += perlin2d(seed + (octave * 1013), x * frequency, y * frequency) * amplitude;
    normalization += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return total / normalization;
}

export function getPaperTextureBaseColor(theme: PaperTextureTheme): string {
  const palette = getPalette(theme);
  return `rgb(${palette.base[0]}, ${palette.base[1]}, ${palette.base[2]})`;
}

export function generatePaperTexturePixelBuffer(
  width: number,
  height: number,
  theme: PaperTextureTheme,
  options: PaperTextureRenderOptions = {},
  seed: number,
): Uint8ClampedArray {
  const palette = getPalette(theme);
  const mapOriginX = options.mapOriginX ?? 0;
  const mapOriginY = options.mapOriginY ?? 0;
  const pixelsPerMapUnit = options.pixelsPerMapUnit ?? 1;
  const data = new Uint8ClampedArray(Math.max(0, width * height * 4));

  for (let y = 0; y < height; y += 1) {
    const mapY = mapOriginY + ((y + 0.5) / pixelsPerMapUnit);

    for (let x = 0; x < width; x += 1) {
      const mapX = mapOriginX + ((x + 0.5) / pixelsPerMapUnit);
      const broad = fractalNoise(seed, mapX / 42, mapY / 42);
      const fine = fractalNoise(seed + 777, mapX / 11, mapY / 11);
      const fiber = fractalNoise(seed + 1337, mapX / 5, mapY / 19);
      const burnShape = fractalNoise(seed + 9001, mapX / 120, mapY / 120);
      const burnDetail = fractalNoise(seed + 9509, mapX / 38, mapY / 38);
      const baseMix = clamp01((((broad * 0.68) + (fine * 0.32)) + 1) / 2);
      const fiberBlend = clamp01((fiber + 0.25) * 0.9);
      const burnMix = clamp01((((burnShape * 0.78) + (burnDetail * 0.22)) - 0.18) / 0.34);
      const index = (y * width + x) * 4;

      const baseR = lerp(palette.shadow[0], palette.base[0], baseMix);
      const baseG = lerp(palette.shadow[1], palette.base[1], baseMix);
      const baseB = lerp(palette.shadow[2], palette.highlight[2], baseMix);

      data[index] = Math.round(lerp(
        lerp(baseR, palette.burn[0], burnMix),
        palette.fiber[0],
        fiberBlend * 0.1,
      ));
      data[index + 1] = Math.round(lerp(
        lerp(baseG, palette.burn[1], burnMix),
        palette.fiber[1],
        fiberBlend * 0.1,
      ));
      data[index + 2] = Math.round(lerp(
        lerp(baseB, palette.burn[2], burnMix),
        palette.fiber[2],
        fiberBlend * 0.08,
      ));
      data[index + 3] = 255;
    }
  }

  return data;
}
