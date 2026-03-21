import { clamp01, lerp, sampleSeamlessFractalNoise } from './seamless-noise';

export type PaperTextureTheme = 'light' | 'dark';

export const PAPER_TEXTURE_TILE_SIZE = 512;

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

export function getPaperTextureBaseColor(theme: PaperTextureTheme): string {
  const palette = getPalette(theme);
  return `rgb(${palette.base[0]}, ${palette.base[1]}, ${palette.base[2]})`;
}

export function generatePaperTextureTilePixelBuffer(
  width: number,
  height: number,
  theme: PaperTextureTheme,
  seed: number,
): Uint8ClampedArray {
  const palette = getPalette(theme);
  const data = new Uint8ClampedArray(Math.max(0, width * height * 4));
  const maxX = Math.max(1, width - 1);
  const maxY = Math.max(1, height - 1);

  for (let y = 0; y < height; y += 1) {
    const v = y / maxY;

    for (let x = 0; x < width; x += 1) {
      const u = x / maxX;
      const broad = sampleSeamlessFractalNoise(seed, u, v, {
        cycleX: 3,
        cycleY: 3,
        octaves: 5,
        persistence: 0.5,
        lacunarity: 2,
      });
      const fine = sampleSeamlessFractalNoise(seed + 777, u, v, {
        cycleX: 11,
        cycleY: 11,
        octaves: 5,
        persistence: 0.5,
        lacunarity: 2,
      });
      const fiber = sampleSeamlessFractalNoise(seed + 1337, u, v, {
        cycleX: 29,
        cycleY: 7,
        octaves: 5,
        persistence: 0.5,
        lacunarity: 2,
      });
      const burnShape = sampleSeamlessFractalNoise(seed + 9001, u, v, {
        cycleX: 2,
        cycleY: 2,
        octaves: 5,
        persistence: 0.5,
        lacunarity: 2,
      });
      const burnDetail = sampleSeamlessFractalNoise(seed + 9509, u, v, {
        cycleX: 7,
        cycleY: 7,
        octaves: 5,
        persistence: 0.5,
        lacunarity: 2,
      });
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
