import {
  PADLOCK_BODY,
  PADLOCK_KEYHOLE,
  PADLOCK_KEY_STEM,
  PADLOCK_SHACKLE_PATH,
} from '../graph/padlock-geometry';

interface PadlockGlyphProps {
  readonly bodyColor: string;
  readonly keyholeColor: string;
}

export function PadlockGlyph({ bodyColor, keyholeColor }: PadlockGlyphProps): React.JSX.Element {
  return (
    <>
      <path
        d={PADLOCK_SHACKLE_PATH}
        fill="none"
        stroke={bodyColor}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <rect
        x={PADLOCK_BODY.x}
        y={PADLOCK_BODY.y}
        width={PADLOCK_BODY.width}
        height={PADLOCK_BODY.height}
        rx={PADLOCK_BODY.rx}
        fill={bodyColor}
        stroke={bodyColor}
        strokeWidth="1.5"
      />
      <circle
        cx={PADLOCK_KEYHOLE.cx}
        cy={PADLOCK_KEYHOLE.cy}
        r={PADLOCK_KEYHOLE.r}
        fill={keyholeColor}
      />
      <line
        x1={PADLOCK_KEY_STEM.x1}
        y1={PADLOCK_KEY_STEM.y1}
        x2={PADLOCK_KEY_STEM.x2}
        y2={PADLOCK_KEY_STEM.y2}
        stroke={keyholeColor}
        strokeWidth="1"
        strokeLinecap="round"
      />
    </>
  );
}
