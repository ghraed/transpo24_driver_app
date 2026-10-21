# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

# Driver UI design system

For new or redesigned driver screens, follow `docs/driver-design-system.md`.
Use `src/theme/driver-theme.ts` for colors, spacing, typography, and component dimensions.
Compose screens from `src/components/ui/driver-ui.tsx` and reuse `trip-ui.tsx` for trip information.
Represent expected availability restrictions as status cards; use notices for contextual feedback.
Localize visible copy in all six catalogs and preserve the existing business rules and routes.

Keep the original light palette, green primary actions, yellow accents, and teal chat actions. Do not automatically switch to dark mode.
