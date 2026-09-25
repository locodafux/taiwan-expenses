import Svg, { Circle, Path } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';

// One hand-drawn line set (24px grid, round caps and joins) instead of
// emoji and unicode glyphs, which render differently on every Android skin
// and read as placeholder art.
const PATHS = {
  home: ['M3.5 11 12 4l8.5 7', 'M6 9v11h12V9', 'M10 20v-5h4v5'],
  checklist: ['M10 6.5h10', 'M10 12h10', 'M10 17.5h10', 'M3.5 6.5 5 8l2.5-3', 'M3.5 12 5 13.5 7.5 10.5', 'M4 17.5h3'],
  tabs: ['M3 7h7l2 2h9v10H3z', 'M3 12h18'],
  chat: ['M4 5h16v11H10l-6 4z', 'M8 9.5h8', 'M8 12.5h5'],
  peso: ['M8 20V4h5a4 4 0 0 1 0 8H8', 'M5 7h14', 'M5 10h14'],
  sliders: ['M4 7h9', 'M19 7h1', 'M4 17h1', 'M11 17h9'],
  check: ['M5 12.5 9.5 17 19 7'],
  chevronRight: ['M9.5 6l6 6-6 6'],
  plus: ['M12 5v14', 'M5 12h14'],
  flame: ['M12 3c.8 3.6 5.5 5.6 5.5 11a5.5 5.5 0 0 1-11 0c0-2.6 1.4-4.2 2.6-5.6.4 1.8 1.3 2.9 2.6 3.1-.8-2.6-.6-5.4.3-8.5z'],
  scissors: ['M8.2 8.4 20 18', 'M8.2 15.6 20 6'],
  sparkle: ['M12 4c.6 4.2 3.8 7.4 8 8-4.2.6-7.4 3.8-8 8-.6-4.2-3.8-7.4-8-8 4.2-.6 7.4-3.8 8-8z'],
} as const;

// Extra round parts that are not worth expressing as arcs in a path.
const CIRCLES: Partial<Record<IconName, [number, number, number][]>> = {
  sliders: [
    [16, 7, 2.5],
    [8, 17, 2.5],
  ],
  scissors: [
    [6, 7, 2.5],
    [6, 17, 2.5],
  ],
};

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 20,
  color,
  strokeWidth = 1.8,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const { vars } = useTheme();
  const stroke = color ?? vars['--ink'];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {PATHS[name].map((d) => (
        <Path
          key={d}
          d={d}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {CIRCLES[name]?.map(([cx, cy, r]) => (
        <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} stroke={stroke} strokeWidth={strokeWidth} />
      ))}
    </Svg>
  );
}
