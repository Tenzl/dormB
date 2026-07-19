# Courtyard design system

## Direction

Courtyard uses a calm operational aesthetic: warm stone surfaces, off-black controls, and one desaturated emerald accent. The interface prioritizes route state and human confirmation over decorative dashboards. Desktop compositions are asymmetric; below 768px they collapse to one column with 16px page gutters.

## Tokens

- Typeface: Geist for interface copy; Geist Mono for IDs, timers, status, and metrics.
- Accent: `#27765d`; never combined with a second chromatic accent for primary actions.
- Base: Stone 50 page, white raised surfaces, Zinc 900 text.
- Spacing: 4px base rhythm; common gaps 8, 12, 16, 24, 32, 48, 56.
- Radius: 12px controls, 16px messages, 32px major surfaces.
- Motion: 300–550ms `cubic-bezier(.16,1,.3,1)` for UI; 4.5s transform interpolation for five-second GPS ticks. Reduced-motion mode collapses animation duration.
- Touch target: minimum 44px.

## Component rules

Buttons have primary, secondary, quiet, and danger treatments with tactile pressed feedback. Labels always sit above form controls. IDs and state badges use mono text. Data tables use dividers instead of wrapping every row in a card. Cards are reserved for elevated route review, map, demo controls, and actionable notices.

Admin and Merchant route monitoring use one vertical hierarchy: a full-width wide map first, then shipper/current-stop/ETA and the route sequence below. Shipper execution follows the same map-first hierarchy, with operational actions directly below the map. Side-by-side map dashboards are intentionally avoided.

Every server action exposes loading, success, and failure feedback. Collections provide an empty state. Initial trip generation uses a structure-matched skeleton. Persisted `countdownEndsAt` and `minimumWaitEndsAt` values are the timer source of truth.

## Accessibility and responsive audit

- Semantic buttons, headings, table markup, lists, dialogs, `aria-live`, and status labels.
- Visible focus rings and sufficient neutral/accent contrast.
- No emoji, pure black, purple/blue AI styling, or unbounded viewport height.
- Desktop tables scroll horizontally rather than compressing columns.
- Dialogs become bottom sheets on small screens.
- Map movement animates transform only and has a reduced-motion fallback.
