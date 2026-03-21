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

function fade(value: number): number {
  return value * value * value * (value * ((value * 6) - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + ((b - a) * t);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function hash4d(seed: number, x: number, y: number, z: number, w: number): number {
  let hash = seed >>> 0;
  hash = Math.imul(hash ^ x, 374761393) >>> 0;
  hash = Math.imul(hash ^ y, 668265263) >>> 0;
  hash = Math.imul(hash ^ z, 2147483647) >>> 0;
  hash = Math.imul(hash ^ w, 1274126177) >>> 0;
  hash = (hash ^ (hash >>> 13)) >>> 0;
  hash = Math.imul(hash, 1274126177) >>> 0;
  return hash ^ (hash >>> 16);
}

function gradient4d(
  seed: number,
  x: number,
  y: number,
  z: number,
  w: number,
): { readonly x: number; readonly y: number; readonly z: number; readonly w: number } {
  const a = ((hash4d(seed, x, y, z, w) & 0xffff) / 0x7fff) - 1;
  const b = ((hash4d(seed + 17, x, y, z, w) & 0xffff) / 0x7fff) - 1;
  const c = ((hash4d(seed + 31, x, y, z, w) & 0xffff) / 0x7fff) - 1;
  const d = ((hash4d(seed + 47, x, y, z, w) & 0xffff) / 0x7fff) - 1;
  const length = Math.hypot(a, b, c, d) || 1;
  return {
    x: a / length,
    y: b / length,
    z: c / length,
    w: d / length,
  };
}

function perlin4d(seed: number, x: number, y: number, z: number, w: number): number {
  const x0 = Math.floor(x);
  const x1 = x0 + 1;
  const y0 = Math.floor(y);
  const y1 = y0 + 1;
  const z0 = Math.floor(z);
  const z1 = z0 + 1;
  const w0 = Math.floor(w);
  const w1 = w0 + 1;
  const sx = fade(x - x0);
  const sy = fade(y - y0);
  const sz = fade(z - z0);
  const sw = fade(w - w0);

  const dot = (cornerX: number, cornerY: number, cornerZ: number, cornerW: number): number => {
    const gradient = gradient4d(seed, cornerX, cornerY, cornerZ, cornerW);
    return (
      ((x - cornerX) * gradient.x)
      + ((y - cornerY) * gradient.y)
      + ((z - cornerZ) * gradient.z)
      + ((w - cornerW) * gradient.w)
    );
  };

  const n0000 = dot(x0, y0, z0, w0);
  const n1000 = dot(x1, y0, z0, w0);
  const n0100 = dot(x0, y1, z0, w0);
  const n1100 = dot(x1, y1, z0, w0);
  const n0010 = dot(x0, y0, z1, w0);
  const n1010 = dot(x1, y0, z1, w0);
  const n0110 = dot(x0, y1, z1, w0);
  const n1110 = dot(x1, y1, z1, w0);
  const n0001 = dot(x0, y0, z0, w1);
  const n1001 = dot(x1, y0, z0, w1);
  const n0101 = dot(x0, y1, z0, w1);
  const n1101 = dot(x1, y1, z0, w1);
  const n0011 = dot(x0, y0, z1, w1);
  const n1011 = dot(x1, y0, z1, w1);
  const n0111 = dot(x0, y1, z1, w1);
  const n1111 = dot(x1, y1, z1, w1);

  const nx000 = lerp(n0000, n1000, sx);
  const nx100 = lerp(n0100, n1100, sx);
  const nx010 = lerp(n0010, n1010, sx);
  const nx110 = lerp(n0110, n1110, sx);
  const nx001 = lerp(n0001, n1001, sx);
  const nx101 = lerp(n0101, n1101, sx);
  const nx011 = lerp(n0011, n1011, sx);
  const nx111 = lerp(n0111, n1111, sx);
  const nxy00 = lerp(nx000, nx100, sy);
  const nxy10 = lerp(nx010, nx110, sy);
  const nxy01 = lerp(nx001, nx101, sy);
  const nxy11 = lerp(nx011, nx111, sy);
  const nxyz0 = lerp(nxy00, nxy10, sz);
  const nxyz1 = lerp(nxy01, nxy11, sz);

  return lerp(nxyz0, nxyz1, sw);
}

function sampleTorusNoise(seed: number, cycleX: number, cycleY: number, u: number, v: number): number {
  const theta = Math.PI * 2 * u;
  const phi = Math.PI * 2 * v;
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;
  let normalization = 0;

  for (let octave = 0; octave < 5; octave += 1) {
    const scaledCycleX = cycleX * frequency;
    const scaledCycleY = cycleY * frequency;
    total += perlin4d(
      seed + (octave * 1013),
      Math.cos(theta * scaledCycleX),
      Math.sin(theta * scaledCycleX),
      Math.cos(phi * scaledCycleY),
      Math.sin(phi * scaledCycleY),
    ) * amplitude;
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
      const broad = sampleTorusNoise(seed, 3, 3, u, v);
      const fine = sampleTorusNoise(seed + 777, 11, 11, u, v);
      const fiber = sampleTorusNoise(seed + 1337, 29, 7, u, v);
      const burnShape = sampleTorusNoise(seed + 9001, 2, 2, u, v);
      const burnDetail = sampleTorusNoise(seed + 9509, 7, 7, u, v);
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
