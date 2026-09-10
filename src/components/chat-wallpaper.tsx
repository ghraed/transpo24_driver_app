import React, { memo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { SvgXml } from 'react-native-svg';

// Repeat fixed-size vector tiles across the measured area. Explicit tiles avoid
// platform-specific SVG pattern sizing and keep the icon scale consistent.
const TILE_SIZE = 320;
const wallpaper = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">
      <g fill="none" stroke="#B8B0A1" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" opacity="0.42">
        <!-- Passenger car -->
        <g transform="translate(18 26) rotate(-12 26 18)">
          <path d="M5 24V17l7-3 5-9h19l7 10 7 3v11h-6M15 29h20M5 29H2v-7h3M15 14h25M23 6v8M47 20h3M5 20h5"/>
          <circle cx="11" cy="28" r="5"/><circle cx="40" cy="28" r="5"/>
          <path d="M23 19h5"/>
        </g>
        <!-- Motorcycle -->
        <g transform="translate(122 20) rotate(14 22 20)">
          <circle cx="6" cy="28" r="8"/><circle cx="42" cy="28" r="8"/>
          <path d="M6 28l12-15 9 15H6M18 13h14l10 15M27 28l9-10-6-13h-7M12 10h10M31 6h6M18 13l-3-3"/>
        </g>
        <!-- Sofa -->
        <g transform="translate(236 28) rotate(-8 23 18)">
          <path d="M7 17V8a5 5 0 0 1 5-5h24a5 5 0 0 1 5 5v9M12 23h24M24 5v18"/>
          <path d="M7 17a5 5 0 0 0-5 5v12h44V22a5 5 0 0 0-10 0v7H12v-7a5 5 0 0 0-5-5ZM8 34v5M40 34v5"/>
        </g>
        <!-- Delivery truck -->
        <g transform="translate(47 112) rotate(10 26 20)">
          <path d="M2 6h30v27H16M2 26v7h4M32 16h12l9 12v5h-6M32 33h5M36 20h6l6 8H36ZM7 12h19M7 17h12"/>
          <circle cx="11" cy="33" r="5"/><circle cx="42" cy="33" r="5"/>
        </g>
        <!-- Shipping box -->
        <g transform="translate(157 113) rotate(-15 15 18)">
          <path d="M1 9 17 1l16 8v22l-16 8L1 31ZM1 9l16 8 16-8M17 17v22M9 5l16 8v10M6 24l6 3M6 29l6 3"/>
        </g>
        <!-- Vehicle transporter, with a car on its flatbed -->
        <g transform="translate(238 125) rotate(9 31 18)">
          <path d="M0 25h42v8H13M42 33h9M42 16h13l8 10v7h-3M47 20h6l5 7H47ZM0 33h3"/>
          <circle cx="8" cy="34" r="4"/><circle cx="55" cy="34" r="4"/>
          <path d="M5 17V12l5-2 4-7h14l5 8 5 2v7h-3M13 20h14M12 10h19M20 4v6M5 20H2v-4"/>
          <circle cx="9" cy="20" r="3"/><circle cx="31" cy="20" r="3"/>
        </g>
        <!-- Furniture / bed -->
        <g transform="translate(14 224) rotate(-8 24 18)">
          <path d="M3 10V2M3 10h42v23H3ZM3 33v6M45 33v6M3 23h42M8 10V6h12v10H8M25 10V6h14v10H25"/>
        </g>
        <!-- Moving van -->
        <g transform="translate(120 221) rotate(12 28 20)">
          <path d="M3 6h33l15 13v15h-7M3 6v28h7M20 34h14M30 7v20h21M35 11v10h12M7 12h16M7 17h16M33 27h4"/>
          <circle cx="15" cy="34" r="5"/><circle cx="39" cy="34" r="5"/>
        </g>
        <!-- Hand truck and parcel -->
        <g transform="translate(250 233) rotate(-12 18 18)">
          <path d="M4 1h7v31h25M11 28l24 8M15 6h19v18H15ZM23 6v7h4V6"/>
          <circle cx="12" cy="35" r="5"/>
        </g>
        <!-- Suitcase -->
        <g transform="translate(12 77) rotate(12 12 14)">
          <rect x="2" y="6" width="24" height="23" rx="3"/>
          <path d="M9 6V2h10v4M8 11v12M20 11v12M7 29v3M21 29v3"/>
        </g>
        <!-- Rider helmet -->
        <g transform="translate(126 76) rotate(-12 16 12)">
          <path d="M2 22V15a14 14 0 0 1 28 0v3H17l-3 6H5a3 3 0 0 1-3-2ZM17 10h12M17 10v8M6 24v4h11"/>
        </g>
        <!-- Dining chair -->
        <g transform="translate(224 78) rotate(8 12 15)">
          <path d="M4 18V2h17v16M8 6h9M3 18h21v5H3ZM5 23v9M22 23v9M10 10v8M16 10v8"/>
        </g>
        <!-- Forklift -->
        <g transform="translate(51 174) rotate(-7 24 17)">
          <path d="M3 22h23v8h-4M3 30H1v-8M26 30h8V3M34 28h14M29 4H12v18M15 8v10h10v4M29 4v18M3 15h9v7"/>
          <circle cx="8" cy="30" r="4"/><circle cx="23" cy="30" r="4"/>
          <path d="M37 14h9v10h-9ZM40 14v4"/>
        </g>
        <!-- Floor lamp -->
        <g transform="translate(150 175) rotate(10 12 16)">
          <path d="M6 2h13l5 13H1ZM12 15v16M5 32h15M18 15v6"/>
          <circle cx="18" cy="22" r="1"/>
        </g>
        <!-- Refrigerator / appliance delivery -->
        <g transform="translate(253 180) rotate(-8 12 18)">
          <rect x="2" y="1" width="23" height="34" rx="2"/>
          <path d="M2 13h23M7 6v4M7 18v7M6 35v3M21 35v3"/>
        </g>
        <!-- Bookshelf -->
        <g transform="translate(26 280) rotate(8 14 16)">
          <path d="M1 1h28v29H1ZM1 15h28M5 30v3M25 30v3M6 5v10M10 4v11M15 7l3 8M6 21h8v9M19 20h5v10"/>
        </g>
        <!-- Stacked cartons on a pallet -->
        <g transform="translate(122 283) rotate(-6 22 13)">
          <path d="M1 22h43v5H1ZM6 27v4M23 27v4M39 27v4M5 11h17v11H5ZM24 11h16v11H24ZM15 1h17v10H15ZM22 1v4h4V1M12 11v4M30 11v4"/>
        </g>
        <!-- Tow hook -->
        <g transform="translate(267 284) rotate(14 12 14)">
          <path d="M7 1h9v7H7ZM9 8v7c-7 2-7 13 1 14 6 1 10-3 9-8M12 12v7M7 4h9"/>
        </g>
        <!-- Small route markers and travel lines between the larger icons -->
        <path d="M89 77c-8-9-9-14-5-18a7 7 0 0 1 10 0c4 4 3 9-5 18Z"/>
        <circle cx="89" cy="63" r="2"/>
        <path d="M204 83h9m-5-4v8M104 182h7m5 0h3M211 197c7-4 11-3 15 2"/>
        <path d="M73 285h10m5 0h5M191 284l6 5 6-5M299 83l5-3M302 89l6-1"/>
        <circle cx="24" cy="178" r="2"/><circle cx="193" cy="40" r="2"/>
        <circle cx="222" cy="302" r="2"/><circle cx="299" cy="211" r="2"/>
      </g>
</svg>`;

export const ChatWallpaper = memo(function ChatWallpaper() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const measure = ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    setSize(previous => previous.width === layout.width && previous.height === layout.height
      ? previous : { width: layout.width, height: layout.height });
  };
  const columns = Math.ceil(size.width / TILE_SIZE);
  const rows = Math.ceil(size.height / TILE_SIZE);

  return (
    <View style={styles.wallpaper} onLayout={measure} pointerEvents="none" accessible={false}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: rows }, (_, row) =>
        Array.from({ length: columns }, (_, column) => (
          <SvgXml key={`${row}-${column}`} xml={wallpaper} width={TILE_SIZE} height={TILE_SIZE}
            style={[styles.tile, { left: column * TILE_SIZE, top: row * TILE_SIZE }]} />
        )),
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wallpaper: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    overflow: 'hidden', backgroundColor: '#F7F4EE',
  },
  tile: { position: 'absolute' },
});
