import {
  DARK_ROOM_INNER,
  DARK_ROOM_OUTER,
} from '../graph/dark-room-geometry';

interface DarkRoomGlyphProps {
  readonly bodyColor: string;
  readonly cutoutColor: string;
}

export function DarkRoomGlyph({ bodyColor, cutoutColor }: DarkRoomGlyphProps): React.JSX.Element {
  return (
    <>
      <circle
        cx={DARK_ROOM_OUTER.cx}
        cy={DARK_ROOM_OUTER.cy}
        r={DARK_ROOM_OUTER.r}
        fill={bodyColor}
      />
      <circle
        cx={DARK_ROOM_INNER.cx}
        cy={DARK_ROOM_INNER.cy}
        r={DARK_ROOM_INNER.r}
        fill={cutoutColor}
      />
    </>
  );
}
