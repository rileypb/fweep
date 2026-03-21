export interface SeamlessFractalNoiseOptions {
  readonly cycleX: number;
  readonly cycleY: number;
  readonly octaves: number;
  readonly persistence: number;
  readonly lacunarity: number;
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + ((b - a) * t);
}

function fade(value: number): number {
  return value * value * value * (value * ((value * 6) - 15) + 10);
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

export function sampleSeamlessFractalNoise(
  seed: number,
  u: number,
  v: number,
  options: SeamlessFractalNoiseOptions,
): number {
  const theta = Math.PI * 2 * u;
  const phi = Math.PI * 2 * v;
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;
  let normalization = 0;

  for (let octave = 0; octave < options.octaves; octave += 1) {
    total += perlin4d(
      seed + (octave * 1013),
      Math.cos(theta * options.cycleX * frequency),
      Math.sin(theta * options.cycleX * frequency),
      Math.cos(phi * options.cycleY * frequency),
      Math.sin(phi * options.cycleY * frequency),
    ) * amplitude;
    normalization += amplitude;
    amplitude *= options.persistence;
    frequency *= options.lacunarity;
  }

  return normalization === 0 ? 0 : total / normalization;
}
