import React from 'react';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

export type DriverIconName =
  | 'arrow-back'
  | 'calendar'
  | 'car'
  | 'chat'
  | 'check'
  | 'chevron-right'
  | 'clock'
  | 'document'
  | 'filter'
  | 'grid'
  | 'help'
  | 'location'
  | 'logout'
  | 'map'
  | 'money'
  | 'motorcycle'
  | 'furniture'
  | 'goods'
  | 'package'
  | 'profile'
  | 'settings'
  | 'sliders'
  | 'star'
  | 'truck';

type DriverIconProps = {
  name: DriverIconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
};

export function DriverIcon({
  name,
  size = 24,
  color = '#202124',
  strokeWidth = 1.9,
  fill = 'none',
}: DriverIconProps) {
  const common = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'map' ? (
        <>
          <Polyline {...common} points="3,6 8,3 16,6 21,3 21,18 16,21 8,18 3,21 3,6" />
          <Line {...common} x1="8" y1="3" x2="8" y2="18" />
          <Line {...common} x1="16" y1="6" x2="16" y2="21" />
        </>
      ) : null}
      {name === 'grid' ? (
        <>
          <Rect {...common} x="3" y="3" width="7" height="7" rx="1" />
          <Rect {...common} x="14" y="3" width="7" height="7" rx="1" />
          <Rect {...common} x="3" y="14" width="7" height="7" rx="1" />
          <Rect {...common} x="14" y="14" width="7" height="7" rx="1" />
        </>
      ) : null}
      {name === 'chat' ? (
        <Path {...common} d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.4 9.4 0 0 1-4-.9L3 21l1.6-4.3A8.7 8.7 0 1 1 21 11.5Z" />
      ) : null}
      {name === 'profile' ? (
        <>
          <Circle {...common} cx="12" cy="7" r="4" />
          <Path {...common} d="M4.5 21v-2.2c0-3 2.5-5.4 5.5-5.4h4c3 0 5.5 2.4 5.5 5.4V21" />
        </>
      ) : null}
      {name === 'sliders' ? (
        <>
          <Line {...common} x1="4" y1="6" x2="20" y2="6" />
          <Line {...common} x1="4" y1="12" x2="20" y2="12" />
          <Line {...common} x1="4" y1="18" x2="20" y2="18" />
          <Line {...common} x1="9" y1="3.5" x2="9" y2="8.5" />
          <Line {...common} x1="16" y1="9.5" x2="16" y2="14.5" />
          <Line {...common} x1="8" y1="15.5" x2="8" y2="20.5" />
        </>
      ) : null}
      {name === 'filter' ? <Path {...common} d="M3 4h18l-7 8v6l-4 2v-8L3 4Z" /> : null}
      {name === 'location' ? (
        <>
          <Path {...common} d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
          <Circle {...common} cx="12" cy="10" r="2.5" />
        </>
      ) : null}
      {name === 'arrow-back' ? (
        <>
          <Line {...common} x1="19" y1="12" x2="5" y2="12" />
          <Polyline {...common} points="11,18 5,12 11,6" />
        </>
      ) : null}
      {name === 'chevron-right' ? <Polyline {...common} points="9,5 16,12 9,19" /> : null}
      {name === 'settings' ? (
        <>
          <Circle {...common} cx="12" cy="12" r="3" />
          <Path {...common} d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
        </>
      ) : null}
      {name === 'star' ? <Path {...common} fill={fill} d="m12 2.8 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9L6.4 20l1.1-6.2L3 9.4l6.2-.9L12 2.8Z" /> : null}
      {name === 'check' ? (
        <>
          <Circle {...common} cx="12" cy="12" r="9" />
          <Polyline {...common} points="8,12 11,15 17,8.5" />
        </>
      ) : null}
      {name === 'clock' ? (
        <>
          <Circle {...common} cx="12" cy="12" r="9" />
          <Polyline {...common} points="12,7 12,12 16,14" />
        </>
      ) : null}
      {name === 'truck' ? (
        <>
          <Path {...common} d="M3 5h11v11H3V5Zm11 4h4l3 3v4h-7V9Z" />
          <Circle {...common} cx="7" cy="18" r="2" fill="#fff" />
          <Circle {...common} cx="18" cy="18" r="2" fill="#fff" />
        </>
      ) : null}
      {name === 'car' ? (
        <>
          <Path {...common} d="M5 11 6.7 6.5h10.6L19 11l2 2v5h-2.5v-2h-13v2H3v-5l2-2Z" />
          <Line {...common} x1="5" y1="11" x2="19" y2="11" />
          <Circle {...common} cx="7" cy="14" r="1" />
          <Circle {...common} cx="17" cy="14" r="1" />
        </>
      ) : null}
      {name === 'motorcycle' ? (
        <>
          <Circle {...common} cx="5.5" cy="17" r="3.5" />
          <Circle {...common} cx="18.5" cy="17" r="3.5" />
          <Path {...common} d="m5.5 17 4-6h4l3 6H10l-2-4.5" />
          <Path {...common} d="m13.5 11 2-3h2.5" />
          <Line {...common} x1="15.5" y1="8" x2="18.5" y2="17" />
          <Line {...common} x1="8" y1="9" x2="11" y2="9" />
        </>
      ) : null}
      {name === 'goods' ? (
        <>
          <Rect {...common} x="3" y="11" width="8" height="9" rx="1" />
          <Rect {...common} x="13" y="11" width="8" height="9" rx="1" />
          <Rect {...common} x="8" y="3" width="8" height="7" rx="1" />
          <Line {...common} x1="7" y1="11" x2="7" y2="15" />
          <Line {...common} x1="17" y1="11" x2="17" y2="15" />
          <Line {...common} x1="12" y1="3" x2="12" y2="6" />
        </>
      ) : null}
      {name === 'furniture' ? (
        <>
          <Path {...common} d="M5 12V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v4" />
          <Path {...common} d="M5 10H4a2 2 0 0 0-2 2v5h20v-5a2 2 0 0 0-2-2h-1" />
          <Line {...common} x1="6" y1="17" x2="5" y2="21" />
          <Line {...common} x1="18" y1="17" x2="19" y2="21" />
        </>
      ) : null}
      {name === 'document' ? (
        <>
          <Path {...common} d="M6 2h8l4 4v16H6V2Z" />
          <Polyline {...common} points="14,2 14,7 19,7" />
          <Line {...common} x1="9" y1="12" x2="15" y2="12" />
          <Line {...common} x1="9" y1="16" x2="15" y2="16" />
        </>
      ) : null}
      {name === 'money' ? (
        <>
          <Line {...common} x1="12" y1="2" x2="12" y2="22" />
          <Path {...common} d="M17 5.5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </>
      ) : null}
      {name === 'calendar' ? (
        <>
          <Rect {...common} x="3" y="5" width="18" height="16" rx="2" />
          <Line {...common} x1="3" y1="9" x2="21" y2="9" />
          <Line {...common} x1="8" y1="2.5" x2="8" y2="7" />
          <Line {...common} x1="16" y1="2.5" x2="16" y2="7" />
        </>
      ) : null}
      {name === 'help' ? (
        <>
          <Circle {...common} cx="12" cy="12" r="9" />
          <Path {...common} d="M9.8 9a2.4 2.4 0 1 1 3.3 2.2c-.8.4-1.1.9-1.1 1.8" />
          <Circle cx="12" cy="17" r=".8" fill={color} />
        </>
      ) : null}
      {name === 'logout' ? (
        <>
          <Path {...common} d="M10 4H5v16h5" />
          <Line {...common} x1="10" y1="12" x2="21" y2="12" />
          <Polyline {...common} points="17,8 21,12 17,16" />
        </>
      ) : null}
      {name === 'package' ? (
        <>
          <Path {...common} d="m12 2 8 4.5v10L12 22l-8-5.5v-10L12 2Z" />
          <Polyline {...common} points="4,6.5 12,11 20,6.5" />
          <Line {...common} x1="12" y1="11" x2="12" y2="22" />
          <Line {...common} x1="8" y1="4.3" x2="16" y2="8.8" />
        </>
      ) : null}
    </Svg>
  );
}
