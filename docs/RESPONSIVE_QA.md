# Responsive layout acceptance matrix

Scope: MJW Life Today, FPG Areas, navigation and shared forms.
Reference: Samsung A37 phone screenshot uploaded 8 November 2026.
Status: responsive rules implemented and enforced by source tests; physical-device and authenticated UI tests remain pending.

| Device / viewport (CSS px, approximate) | Expected composition | Priority manual checks |
| --- | --- | --- |
| Compact Android 320 × 640 | Single column, 2×2 quick capture, bottom navigation | No horizontal scroll; header and full tap targets fit |
| Samsung A37 360/393 × 800–875 | Single column, 4 quick tiles, separated highlight cards, bottom tabs | Catch-up/FPG gap; normal text wrapping; priority scrolls above navigation |
| Phone landscape 740 × 360 | Single column, bottom tabs | Scrollable dialog, soft keyboard and all actions reachable |
| Tablet portrait 600/800 × 1024+ | Single primary column, optional two side panels below | No cramped 800px two-column split |
| Tablet landscape 1100/1280 × 800 | Dual-column Today, bottom touch navigation | Touch controls, calendar, registers, uploads |
| Laptop 1366/1440 × 768–900 | Dual-column Today, left rail with fine pointer | No horizontal scroll; modal actions and tab changes |
| 34-inch display 2560/3440 × 1440 | Capped content width 1620px, left rail, two-column Today | Zoom 100/125/150%, text legibility, readable forms |

## Implemented rules
- Today and FPG shortcut cards use reusable grid containers with a 12px or greater gap.
- Header branding retains the approved ribbon and wordmark at responsive width.
- Tablet portrait explicitly overrides the legacy 800px desktop grid.
- Mouse/trackpad workstations at 1280px or above have a navigation rail; touch tablets retain bottom tabs.
- Card text can wrap, navigation has safe-area spacing and touch targets are at least 48px.
- Source-layout contracts run in the production unit-test gate; Vite validates CSS and JSX compilation.

## Remaining verification
- Samsung browser font scaling, keyboard, Android gestures, installed PWA, orientation transitions.
- Tablet Android WebView behaviour, storage, uploads, audio and long records.
- Physical 34-inch monitor screenshots, zoom and keyboard navigation.
- Authenticated end-to-end workflows with real user records.

Do not mark device-level tests passed until authenticated browser or physical-device checks with evidence are recorded.
