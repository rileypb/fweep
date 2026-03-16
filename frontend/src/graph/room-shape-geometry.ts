import type { RoomShape } from '../domain/map-types';

export interface ShapePoint {
  readonly x: number;
  readonly y: number;
}

function getOctagonInsetX(width: number): number {
  return Math.min(12, width * 0.18);
}

function getOctagonInsetY(height: number): number {
  return Math.min(10, height * 0.28);
}

function getHexagonInsetX(width: number): number {
  return Math.min(14, width * 0.22);
}

function getBoxDepthX(width: number): number {
  return Math.min(14, width * 0.16);
}

function getBoxDepthY(height: number): number {
  return Math.min(9, height * 0.24);
}

export function getRoomShapePolygonVertices(shape: RoomShape, width: number, height: number): ShapePoint[] | null {
  if (shape === 'diamond') {
    return [
      { x: width / 2, y: 0 },
      { x: width, y: height / 2 },
      { x: width / 2, y: height },
      { x: 0, y: height / 2 },
    ];
  }

  if (shape === 'octagon') {
    const insetX = getOctagonInsetX(width);
    const insetY = getOctagonInsetY(height);
    return [
      { x: insetX, y: 0 },
      { x: width - insetX, y: 0 },
      { x: width, y: insetY },
      { x: width, y: height - insetY },
      { x: width - insetX, y: height },
      { x: insetX, y: height },
      { x: 0, y: height - insetY },
      { x: 0, y: insetY },
    ];
  }

  if (shape === 'pentagon') {
    return [
      { x: width / 2, y: 0 },
      { x: width, y: height * 0.38 },
      { x: width * 0.82, y: height },
      { x: width * 0.18, y: height },
      { x: 0, y: height * 0.38 },
    ];
  }

  if (shape === 'hexagon') {
    const insetX = getHexagonInsetX(width);
    return [
      { x: insetX, y: 0 },
      { x: width - insetX, y: 0 },
      { x: width, y: height / 2 },
      { x: width - insetX, y: height },
      { x: insetX, y: height },
      { x: 0, y: height / 2 },
    ];
  }

  if (shape === 'house') {
    const roofBaseY = height * 0.34;
    return [
      { x: width / 2, y: 0 },
      { x: width, y: roofBaseY },
      { x: width, y: height },
      { x: 0, y: height },
      { x: 0, y: roofBaseY },
    ];
  }

  if (shape === 'box') {
    const depthX = getBoxDepthX(width);
    const depthY = getBoxDepthY(height);
    return [
      { x: 0, y: depthY },
      { x: depthX, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height - depthY },
      { x: width - depthX, y: height },
      { x: 0, y: height },
    ];
  }

  return null;
}

export function getRoomShapePath(shape: RoomShape, width: number, height: number, cornerRadius: number): string {
  if (shape === 'oval') {
    return `M ${width / 2} 0 A ${width / 2} ${height / 2} 0 1 1 ${width / 2} ${height} A ${width / 2} ${height / 2} 0 1 1 ${width / 2} 0`;
  }

  const vertices = getRoomShapePolygonVertices(shape, width, height);
  if (vertices) {
    return vertices.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ') + ' Z';
  }

  const radius = Math.min(cornerRadius, width / 5, height / 5);
  if (radius <= 0) {
    return [
      'M 0 0',
      `L ${width} 0`,
      `L ${width} ${height}`,
      `L 0 ${height}`,
      'Z',
    ].join(' ');
  }

  return [
    `M ${radius} 0`,
    `L ${width - radius} 0`,
    `Q ${width} 0 ${width} ${radius}`,
    `L ${width} ${height - radius}`,
    `Q ${width} ${height} ${width - radius} ${height}`,
    `L ${radius} ${height}`,
    `Q 0 ${height} 0 ${height - radius}`,
    `L 0 ${radius}`,
    `Q 0 0 ${radius} 0`,
    'Z',
  ].join(' ');
}

export function traceRoomShapePath(
  context: CanvasRenderingContext2D,
  shape: RoomShape,
  left: number,
  top: number,
  width: number,
  height: number,
  cornerRadius: number,
): void {
  if (shape === 'oval') {
    context.ellipse(
      left + (width / 2),
      top + (height / 2),
      width / 2,
      height / 2,
      0,
      0,
      Math.PI * 2,
    );
    return;
  }

  const vertices = getRoomShapePolygonVertices(shape, width, height);
  if (vertices) {
    context.moveTo(left + vertices[0].x, top + vertices[0].y);
    vertices.slice(1).forEach((point) => {
      context.lineTo(left + point.x, top + point.y);
    });
    context.closePath();
    return;
  }

  const radius = Math.min(cornerRadius, width / 2, height / 2);
  if (radius <= 0) {
    context.moveTo(left, top);
    context.lineTo(left + width, top);
    context.lineTo(left + width, top + height);
    context.lineTo(left, top + height);
    context.closePath();
    return;
  }

  context.moveTo(left + radius, top);
  context.lineTo(left + width - radius, top);
  context.quadraticCurveTo(left + width, top, left + width, top + radius);
  context.lineTo(left + width, top + height - radius);
  context.quadraticCurveTo(left + width, top + height, left + width - radius, top + height);
  context.lineTo(left + radius, top + height);
  context.quadraticCurveTo(left, top + height, left, top + height - radius);
  context.lineTo(left, top + radius);
  context.quadraticCurveTo(left, top, left + radius, top);
  context.closePath();
}
