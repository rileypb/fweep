import type { PseudoRoomKind } from './map-types';

export const PSEUDO_ROOM_SYMBOL_VIEWBOX_SIZE = 100;
export const PSEUDO_ROOM_SYMBOL_SIZE = 104;

export type PseudoRoomPathCommand =
  | { readonly type: 'M' | 'L'; readonly x: number; readonly y: number }
  | { readonly type: 'Q'; readonly cx: number; readonly cy: number; readonly x: number; readonly y: number }
  | { readonly type: 'C'; readonly c1x: number; readonly c1y: number; readonly c2x: number; readonly c2y: number; readonly x: number; readonly y: number }
  | { readonly type: 'Z' };

export interface PseudoRoomStrokePath {
  readonly commands: readonly PseudoRoomPathCommand[];
  readonly strokeWidth: number;
  readonly lineCap?: CanvasLineCap;
  readonly lineJoin?: CanvasLineJoin;
}

export interface PseudoRoomCircle {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
}

export interface PseudoRoomSymbolDefinition {
  readonly paths: readonly PseudoRoomStrokePath[];
  readonly circles?: readonly PseudoRoomCircle[];
}

const UNKNOWN_SYMBOL: PseudoRoomSymbolDefinition = {
  paths: [
    {
      strokeWidth: 12,
      lineCap: 'round',
      lineJoin: 'round',
      commands: [
        { type: 'M', x: 30, y: 30 },
        { type: 'Q', cx: 30, cy: 15, x: 50, y: 15 },
        { type: 'Q', cx: 70, cy: 15, x: 70, y: 33 },
        { type: 'Q', cx: 70, cy: 46, x: 58, y: 54 },
        { type: 'Q', cx: 50, cy: 60, x: 50, y: 72 },
      ],
    },
  ],
  circles: [
    { cx: 50, cy: 86, r: 6 },
  ],
};

const INFINITE_SYMBOL: PseudoRoomSymbolDefinition = {
  paths: [
    {
      strokeWidth: 10,
      lineCap: 'round',
      lineJoin: 'round',
      commands: [
        { type: 'M', x: 12, y: 50 },
        { type: 'C', c1x: 20, c1y: 22, c2x: 40, c2y: 22, x: 50, y: 50 },
        { type: 'C', c1x: 60, c1y: 78, c2x: 80, c2y: 78, x: 88, y: 50 },
        { type: 'C', c1x: 80, c1y: 22, c2x: 60, c2y: 22, x: 50, y: 50 },
        { type: 'C', c1x: 40, c1y: 78, c2x: 20, c2y: 78, x: 12, y: 50 },
      ],
    },
  ],
};

export function getPseudoRoomSymbolDefinition(kind: PseudoRoomKind): PseudoRoomSymbolDefinition {
  switch (kind) {
    case 'unknown':
      return UNKNOWN_SYMBOL;
    case 'infinite':
      return INFINITE_SYMBOL;
  }
}

export function pseudoRoomPathCommandsToSvgPath(commands: readonly PseudoRoomPathCommand[]): string {
  return commands.map((command) => {
    switch (command.type) {
      case 'M':
      case 'L':
        return `${command.type}${command.x} ${command.y}`;
      case 'Q':
        return `Q${command.cx} ${command.cy} ${command.x} ${command.y}`;
      case 'C':
        return `C${command.c1x} ${command.c1y} ${command.c2x} ${command.c2y} ${command.x} ${command.y}`;
      case 'Z':
        return 'Z';
    }
  }).join(' ');
}

export function tracePseudoRoomPathCommands(
  context: CanvasRenderingContext2D,
  commands: readonly PseudoRoomPathCommand[],
): void {
  commands.forEach((command) => {
    switch (command.type) {
      case 'M':
        context.moveTo(command.x, command.y);
        break;
      case 'L':
        context.lineTo(command.x, command.y);
        break;
      case 'Q':
        context.quadraticCurveTo(command.cx, command.cy, command.x, command.y);
        break;
      case 'C':
        context.bezierCurveTo(command.c1x, command.c1y, command.c2x, command.c2y, command.x, command.y);
        break;
      case 'Z':
        context.closePath();
        break;
    }
  });
}
