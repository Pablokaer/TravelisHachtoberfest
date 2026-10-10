import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/use-theme';

/**
 * Front view of a plug face per IEC type, drawn with plain Views (no SVG dependency) on a
 * 100×100 grid. Shapes are simplified but keep what tells types apart: pin shape, count and layout.
 */
type Part = {
  kind: 'pin' | 'blade' | 'hole' | 'clip';
  /** Centre on the 100×100 grid. */
  x: number;
  y: number;
  w: number;
  h: number;
  rotate?: number;
};

type Shape = { face: 'round' | 'square'; parts: Part[] };

const pin = (x: number, y: number, d = 13): Part => ({ kind: 'pin', x, y, w: d, h: d });
const blade = (x: number, y: number, w: number, h: number, rotate?: number): Part => ({
  kind: 'blade',
  x,
  y,
  w,
  h,
  rotate,
});

const SHAPES: Record<string, Shape> = {
  A: { face: 'square', parts: [blade(32, 50, 8, 36), blade(68, 50, 8, 36)] },
  B: { face: 'square', parts: [blade(32, 40, 8, 32), blade(68, 40, 8, 32), pin(50, 75, 14)] },
  C: { face: 'round', parts: [pin(30, 50), pin(70, 50)] },
  D: { face: 'round', parts: [pin(30, 64), pin(70, 64), pin(50, 30, 18)] },
  E: {
    face: 'round',
    parts: [pin(28, 55), pin(72, 55), { kind: 'hole', x: 50, y: 27, w: 15, h: 15 }],
  },
  F: {
    face: 'round',
    parts: [
      pin(28, 50),
      pin(72, 50),
      { kind: 'clip', x: 50, y: 9, w: 22, h: 7 },
      { kind: 'clip', x: 50, y: 91, w: 22, h: 7 },
    ],
  },
  G: {
    face: 'square',
    parts: [blade(50, 32, 11, 26), blade(27, 70, 24, 10), blade(73, 70, 24, 10)],
  },
  H: {
    face: 'round',
    parts: [blade(33, 36, 8, 26, -30), blade(67, 36, 8, 26, 30), blade(50, 72, 8, 24)],
  },
  I: {
    face: 'square',
    parts: [blade(33, 38, 8, 28, 30), blade(67, 38, 8, 28, -30), blade(50, 74, 8, 22)],
  },
  J: { face: 'square', parts: [pin(28, 44), pin(72, 44), pin(50, 64)] },
  K: {
    face: 'round',
    parts: [pin(28, 40), pin(72, 40), { kind: 'blade', x: 50, y: 70, w: 16, h: 12 }],
  },
  L: { face: 'square', parts: [pin(24, 50), pin(50, 50), pin(76, 50)] },
  M: { face: 'round', parts: [pin(28, 64, 16), pin(72, 64, 16), pin(50, 28, 22)] },
  N: { face: 'round', parts: [pin(30, 40), pin(70, 40), pin(50, 68)] },
};

export function PlugIcon({ type, size = 56 }: { type: string; size?: number }) {
  const theme = useTheme();
  const shape = SHAPES[type];
  const s = size / 100;
  return (
    <View
      testID={`plug-icon-${type}`}
      style={[
        styles.face,
        {
          width: size,
          height: size,
          borderRadius: shape?.face === 'round' ? size / 2 : size * 0.18,
          backgroundColor: theme.background,
          borderColor: theme.border,
        },
      ]}>
      {shape?.parts.map((p, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: (p.x - p.w / 2) * s,
            top: (p.y - p.h / 2) * s,
            width: p.w * s,
            height: p.h * s,
            borderRadius: p.kind === 'pin' || p.kind === 'hole' ? (p.w * s) / 2 : 2 * s,
            backgroundColor: p.kind === 'hole' ? 'transparent' : theme.text,
            borderWidth: p.kind === 'hole' ? Math.max(1, 2.5 * s) : 0,
            borderColor: theme.textSecondary,
            opacity: p.kind === 'clip' ? 0.6 : 1,
            transform: p.rotate ? [{ rotate: `${p.rotate}deg` }] : undefined,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  face: { borderWidth: 1.5, overflow: 'hidden' },
});
