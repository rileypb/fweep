declare module 'd3-delaunay' {
  export class Delaunay<T = [number, number]> {
    static from<T>(
      points: Iterable<T> | ArrayLike<T>,
      fx?: (point: T, index: number, points: Iterable<T> | ArrayLike<T>) => number,
      fy?: (point: T, index: number, points: Iterable<T> | ArrayLike<T>) => number,
      that?: unknown,
    ): Delaunay<T>;

    readonly triangles: Uint32Array | Int32Array;
  }
}
