import { MAP_COLORS } from '@/config/map-style';
import { type TextStyle } from 'react-native';

// Primitive → semantic → component tokens. Screens consume the semantic layer.
const palette = {
  white: '#FFFFFF',
  ink: '#111827',
  slate: '#6B7280',
  mist: '#F3F4F6',
  line: '#D1D5DB',
  yellow: '#F1B900',
  yellowSoft: '#FFF1B8',
  green: '#16A34A',
  greenSoft: '#EAF6F0',
  red: '#B52D3A',
  redSoft: '#FFF0F1',
  amber: '#805A12',
  amberSoft: '#FFF7E5',
} as const;
const light = {
  canvas: palette.mist,
  surface: palette.white,
  surfaceSubtle: '#F9FAFB',
  text: palette.ink,
  textSecondary: palette.slate,
  border: palette.line,
  primary: palette.green,
  onPrimary: palette.white,
  primarySoft: palette.greenSoft,
  accent: palette.yellow,
  onAccent: palette.ink,
  accentSoft: palette.yellowSoft,
  contact: '#0F766E',
  onContact: palette.white,
  pickupMarker: MAP_COLORS.pickup,
  dropoffMarker: MAP_COLORS.dropoff,
  currentLocation: MAP_COLORS.driver,
  currentLocationHalo: MAP_COLORS.driverHalo,
  strong: palette.ink,
  onStrong: palette.white,
  disabled: '#E4E8EC',
  onDisabled: '#627080',
  success: '#166534',
  successSoft: palette.greenSoft,
  warning: palette.amber,
  warningSoft: palette.amberSoft,
  danger: palette.red,
  dangerSoft: palette.redSoft,
  info: '#385D7B',
  infoSoft: '#EDF4FA',
  shadow: '#101820',
} as const;
export type DriverColors = { [K in keyof typeof light]: string };
export const driverSpace = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, section: 32 } as const;
export const driverRadius = { sm: 10, md: 14, lg: 20, xl: 24, pill: 999 } as const;
export const driverType = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.6 },
  title: { fontSize: 20, lineHeight: 27, fontWeight: '700', letterSpacing: -0.3 },
  section: { fontSize: 16, lineHeight: 23, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 18, fontWeight: '500' },
} satisfies Record<string, TextStyle>;
export const driverLayout = { maxWidth: 720, gutter: driverSpace.xl } as const;
export const driverComponents = {
  card: { padding: driverSpace.xl, radius: driverRadius.lg },
  button: { minHeight: 52, radius: driverRadius.md, gap: driverSpace.sm },
  input: { minHeight: 52, radius: driverRadius.md, padding: driverSpace.lg },
} as const;
export const driverThemes = { light };
export function useDriverColors(): DriverColors {
  // Preserve the original light appearance regardless of the device setting.
  return light;
}
