# Transpo24 Driver UI

The pickup and delivery screens are the references for new and refreshed driver pages. The app uses the original light palette: green primary actions, yellow accents, teal chat actions, white cards, subtle dividers, and restrained status colors. There is one primary action per screen.

## Source of truth

- `src/theme/driver-theme.ts`: primitive palette → light semantic colors → component dimensions. Shared spacing, radius, type scale, and content width live here.
- `src/components/ui/driver-ui.tsx`: page headers, text, cards, buttons, status badges, and notices. These components handle theme colors, touch sizes, loading, disabled states, and press feedback.
- `src/components/ui/trip-ui.tsx`: full-width trip stages and pickup/destination cards. Use `current={1}` and `activeStop="dropoff"` during delivery.
- `src/components/ui/trip-screen-styles.ts`: shared layout rules for pickup and delivery, including the map, forms, and fixed footer.
- `src/app/_layout.tsx`: shared navigation header styling.

Use `useDriverColors()` for semantic colors. Use `driverSpace`, `driverRadius`, and `driverType` instead of selecting new values on each page. Use the system font so native language support and font scaling remain intact. Screen styles can be created with a color-dependent factory. The default layout has 20-point gutters and a 720-point maximum content width.

## Page composition

1. Compact navigation header with a clear title, short reference, and optional status badge.
2. Header back actions return to the previous screen, with Accepted Jobs as the fallback. Delivery’s focused Android back handler first closes an expanded map.
3. A short task heading, followed by the most relevant content.
4. Related data grouped in cards with explicit labels. Long IDs belong in details; addresses must wrap.
5. Secondary actions use outlined or quiet buttons. Avoid multiple competing filled actions.
6. The primary action sits in a safe-area-aware footer outside the scroll region. Explain why it is unavailable directly above it. Never overlay the form or keyboard.

Use `DriverText` variants (`display`, `title`, `section`, `body`, `label`, `caption`) for hierarchy. Use the section variant for card titles and caption for supporting metadata. Do not put arbitrary paragraphs, debug messages, environment configuration, or unformatted errors directly in a page.

## Feedback and availability

Use `DriverNotice` for contextual information, warnings, and failed actions. Information uses a neutral blue surface; warnings use amber; failed actions use red. Icons and text convey meaning alongside color.

An expected business restriction is an availability state. Client chat during the payment window uses a clock icon, a neutral Pending badge, concise localized copy, and Check availability. Do not display this state as a server error or Retry chat. Keep real connection failures recoverable without showing raw server details. Do not invent a countdown without an authoritative unlock timestamp.

## Accessibility and localization

Use native `Pressable` semantics and visible press feedback. Buttons have at least 48-point touch targets, readable labels, busy/disabled states, and wrapping text. Icon-only controls need localized accessibility labels. Do not truncate essential addresses or disable system font scaling. Use directional layout and logical edges, then inspect Arabic and long German text. Every new visible string goes in all six locale catalogs. Use one symbol family through `DriverIcon`; do not use emoji as UI icons.

## Adopting the system

Import the shared tokens and components when refreshing a screen. Preserve its routes and business logic; replace its presentation with the composition above. Keep the light appearance even when the device uses dark mode. Check narrow devices, long translations, keyboard clearance, and loading/error/empty states. Existing screens can migrate incrementally; do not add a second competing palette or component library.
