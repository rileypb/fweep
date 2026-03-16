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

export interface PseudoRoomFilledPath {
  readonly d: string;
}

export interface PseudoRoomSymbolDefinition {
  readonly viewBoxSize?: number;
  readonly paths: readonly PseudoRoomStrokePath[];
  readonly circles?: readonly PseudoRoomCircle[];
  readonly filledPaths?: readonly PseudoRoomFilledPath[];
}

const UNKNOWN_SYMBOL: PseudoRoomSymbolDefinition = {
  viewBoxSize: 640,
  paths: [],
  filledPaths: [
    {
      d: 'M224 224C224 171 267 128 320 128C373 128 416 171 416 224C416 266.7 388.1 302.9 349.5 315.4C321.1 324.6 288 350.7 288 392L288 416C288 433.7 302.3 448 320 448C337.7 448 352 433.7 352 416L352 392C352 390.3 352.6 387.9 355.5 384.7C358.5 381.4 363.4 378.2 369.2 376.3C433.5 355.6 480 295.3 480 224C480 135.6 408.4 64 320 64C231.6 64 160 135.6 160 224C160 241.7 174.3 256 192 256C209.7 256 224 241.7 224 224zM320 576C342.1 576 360 558.1 360 536C360 513.9 342.1 496 320 496C297.9 496 280 513.9 280 536C280 558.1 297.9 576 320 576z',
    },
  ],
};

const INFINITE_SYMBOL: PseudoRoomSymbolDefinition = {
  viewBoxSize: 640,
  paths: [],
  filledPaths: [
    {
      d: 'M0 320C0 231.6 71.6 160 160 160C210.4 160 257.8 183.7 288 224L320 266.7L352 224C382.2 183.7 429.6 160 480 160C568.4 160 640 231.6 640 320C640 408.4 568.4 480 480 480C429.6 480 382.2 456.3 352 416L320 373.3L288 416C257.8 456.3 210.4 480 160 480C71.6 480 0 408.4 0 320zM280 320L236.8 262.4C218.7 238.2 190.2 224 160 224C107 224 64 267 64 320C64 373 107 416 160 416C190.2 416 218.7 401.8 236.8 377.6L280 320zM360 320L403.2 377.6C421.3 401.8 449.8 416 480 416C533 416 576 373 576 320C576 267 533 224 480 224C449.8 224 421.3 238.2 403.2 262.4L360 320z',
    },
  ],
};

const DEATH_SYMBOL: PseudoRoomSymbolDefinition = {
  viewBoxSize: 640,
  paths: [],
  filledPaths: [
    {
      d: 'M480 491.4C538.5 447.4 576 379.8 576 304C576 171.5 461.4 64 320 64C178.6 64 64 171.5 64 304C64 379.8 101.5 447.4 160 491.4L160 528C160 554.5 181.5 576 208 576L240 576L240 536C240 522.7 250.7 512 264 512C277.3 512 288 522.7 288 536L288 576L352 576L352 536C352 522.7 362.7 512 376 512C389.3 512 400 522.7 400 536L400 576L432 576C458.5 576 480 554.5 480 528L480 491.4zM160 320C160 284.7 188.7 256 224 256C259.3 256 288 284.7 288 320C288 355.3 259.3 384 224 384C188.7 384 160 355.3 160 320zM416 256C451.3 256 480 284.7 480 320C480 355.3 451.3 384 416 384C380.7 384 352 355.3 352 320C352 284.7 380.7 256 416 256z',
    },
  ],
};

const NOWHERE_SYMBOL: PseudoRoomSymbolDefinition = {
  viewBoxSize: 640,
  paths: [],
  filledPaths: [
    {
      d: 'M504.6 148.5C515.9 134.9 514.1 114.7 500.5 103.4C486.9 92.1 466.7 93.9 455.4 107.5L320 270L184.6 107.5C173.3 93.9 153.1 92.1 139.5 103.4C125.9 114.7 124.1 134.9 135.4 148.5L278.3 320L135.4 491.5C124.1 505.1 125.9 525.3 139.5 536.6C153.1 547.9 173.3 546.1 184.6 532.5L320 370L455.4 532.5C466.7 546.1 486.9 547.9 500.5 536.6C514.1 525.3 515.9 505.1 504.6 491.5L361.7 320L504.6 148.5z',
    },
  ],
};

export function getPseudoRoomSymbolDefinition(kind: PseudoRoomKind): PseudoRoomSymbolDefinition {
  switch (kind) {
    case 'unknown':
      return UNKNOWN_SYMBOL;
    case 'infinite':
      return INFINITE_SYMBOL;
    case 'death':
      return DEATH_SYMBOL;
    case 'nowhere':
      return NOWHERE_SYMBOL;
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
