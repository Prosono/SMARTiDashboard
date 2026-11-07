# Sensor category artwork — 1.36.121

Six new category/product cutouts were generated with the built-in `image_gen`
tool on 7 November 2026. Runtime assets live in
[`frontend/public/home/equipment`](../frontend/public/home/equipment/). They are
768 × 768 transparent WebP with opaque foregrounds, encoded with
`cwebp -q 88 -alpha_q 100 -resize 768 768`. All six files were checked with
`webpinfo` for dimensions, alpha and valid structure. Total: **215,418 bytes**.

The pictures illustrate entity categories, including computed sensors; they do
not identify actual hardware or display invented readings. Measured values,
backup timestamps and availability are separate live text from the hub. Existing
AC, presence and calendar pictures are reused where suitable. Custom image
choices and no-image choices retain priority. Failed photos retain semantic icon
fallbacks. The six new pictures can be saved independently on both dashboard
surfaces through the existing image picker.

## Final prompts and asset paths

### meter

- Runtime asset: [`frontend/public/home/equipment/meter.webp`](../frontend/public/home/equipment/meter.webp)
- Source retained at `/Users/vetle.nikolai.prebensen.norman/.codex/generated_images/01a18ca9-5bf0-7c01-897a-003955c878a7/exec-e8b29b3a-c0d3-4853-91c9-bc33a2ebdb93.png`.

```text
Use case: product-mockup. Asset type: genuinely transparent product/category cutout for existing SMARTi smart-home cards, shown at 64–180 CSS pixels. Primary request: One compact graphite smart electricity meter, generic DIN-rail style housing with a blank dark display, subtle embossed lightning-bolt symbol and believable bottom terminal covers. No wires, no readable digits, no branding, no indicators. Photorealistic premium 3D studio rendering, quiet Scandinavian industrial design, solid opaque materials, detailed edges and neutral soft rim light readable on both white and charcoal UI. Centered square composition, every object fully visible and inside canvas, about 76% of canvas, generous transparent padding. Genuine transparent alpha background. No backdrop, room, floor, pedestal, cast floor shadow, frame, captions, UI, glow or extra objects. Illustrative category image, never a real measurement or claimed exact product.
```

### money

- Runtime asset: [`frontend/public/home/equipment/money.webp`](../frontend/public/home/equipment/money.webp)
- Source retained at `/Users/vetle.nikolai.prebensen.norman/.codex/generated_images/01a18ca9-5bf0-7c01-897a-003955c878a7/exec-d0895857-996b-4bdd-9e5f-69da816bdeb9.png`.

```text
Use case: product-mockup. Asset type: genuinely transparent product/category cutout for existing SMARTi smart-home cards, shown at 64–180 CSS pixels. Primary request: A refined three-dimensional data-category illustration: three small stacks of satin silver and muted champagne coins beside a compact charcoal wallet. Coin faces completely blank, no currency signs, no readable text, no values, no banknotes. A single cohesive centered group. Photorealistic premium 3D studio rendering, quiet Scandinavian industrial design, solid opaque materials, detailed edges and neutral soft rim light readable on both white and charcoal UI. Centered square composition, every object fully visible and inside canvas, about 76% of canvas, generous transparent padding. Genuine transparent alpha background. No backdrop, room, floor, pedestal, cast floor shadow, frame, captions, UI, glow or extra objects. Illustrative category image, never a real measurement or claimed exact product.
```

### backup

- Runtime asset: [`frontend/public/home/equipment/backup.webp`](../frontend/public/home/equipment/backup.webp)
- Source retained at `/Users/vetle.nikolai.prebensen.norman/.codex/generated_images/01a18ca9-5bf0-7c01-897a-003955c878a7/exec-233336d5-858e-4828-9b55-7d7878a589e2.png`.

```text
Use case: product-mockup. Asset type: genuinely transparent product/category cutout for existing SMARTi smart-home cards, shown at 64–180 CSS pixels. Primary request: A refined three-dimensional backup-category illustration: one compact graphite external backup drive with a raised pale silver cloud-and-circular-arrow emblem above it as a unified sculptural graphic. No status lights, no progress indicator, no text or numbers. Photorealistic premium 3D studio rendering, quiet Scandinavian industrial design, solid opaque materials, detailed edges and neutral soft rim light readable on both white and charcoal UI. Centered square composition, every object fully visible and inside canvas, about 76% of canvas, generous transparent padding. Genuine transparent alpha background. No backdrop, room, floor, pedestal, cast floor shadow, frame, captions, UI, glow or extra objects. Illustrative category image, never a real measurement or claimed exact product.
```

### environment

- Runtime asset: [`frontend/public/home/equipment/environment.webp`](../frontend/public/home/equipment/environment.webp)
- Source retained at `/Users/vetle.nikolai.prebensen.norman/.codex/generated_images/01a18ca9-5bf0-7c01-897a-003955c878a7/exec-e7a4df16-fe55-4ee0-98f6-000cd7f33d5e.png`.

```text
Use case: product-mockup. Asset type: genuinely transparent product/category cutout for existing SMARTi smart-home cards, shown at 64–180 CSS pixels. Primary request: One compact premium ivory-white indoor temperature and humidity sensor, circular body with a small blank charcoal glass display, tiny embossed thermometer and water-drop symbols below it, subtle ventilation openings, slight three-quarter front view. No numbers, no measured readings, no branding. Photorealistic premium 3D studio rendering, quiet Scandinavian industrial design, solid opaque materials, detailed edges and neutral soft rim light readable on both white and charcoal UI. Centered square composition, every object fully visible and inside canvas, about 76% of canvas, generous transparent padding. Genuine transparent alpha background. No backdrop, room, floor, pedestal, cast floor shadow, frame, captions, UI, glow or extra objects. Illustrative category image, never a real measurement or claimed exact product.
```

### data

- Runtime asset: [`frontend/public/home/equipment/data.webp`](../frontend/public/home/equipment/data.webp)
- Source retained at `/Users/vetle.nikolai.prebensen.norman/.codex/generated_images/01a18ca9-5bf0-7c01-897a-003955c878a7/exec-71d130af-0ca1-4b38-8c05-9b6958606d46.png`.

```text
Use case: product-mockup. Asset type: genuinely transparent product/category cutout for existing SMARTi smart-home cards, shown at 64–180 CSS pixels. Primary request: One premium three-dimensional abstract data-sensor symbol, a matte graphite rounded-square tile with a raised satin-silver pulse curve and three softly rounded connection nodes. Clearly an abstract data category illustration, not a measured chart or identified physical device. No axes, values, status indicators, readable text or branding. Photorealistic premium 3D studio rendering, quiet Scandinavian industrial design, solid opaque materials, detailed edges and neutral soft rim light readable on both white and charcoal UI. Centered square composition, every object fully visible and inside canvas, about 76% of canvas, generous transparent padding. Genuine transparent alpha background. No backdrop, room, floor, pedestal, cast floor shadow, frame, captions, UI, glow or extra objects. Illustrative category image, never a real measurement or claimed exact product.
```

### battery

- Runtime asset: [`frontend/public/home/equipment/battery.webp`](../frontend/public/home/equipment/battery.webp)
- Source retained at `/Users/vetle.nikolai.prebensen.norman/.codex/generated_images/01a18ca9-5bf0-7c01-897a-003955c878a7/exec-f71b2642-cb1d-4606-ae4d-85e0fa306a44.png`.

```text
Use case: product-mockup. Asset type: genuinely transparent product/category cutout for existing SMARTi smart-home cards, shown at 64–180 CSS pixels. Primary request: One upright generic rechargeable battery cell with a satin graphite cylindrical casing and a pale silver positive terminal, beside a second slightly shorter matching battery cell. Blank casings, no charge meter, no charge percentage, no readable text, no brand or colored status light. Photorealistic premium 3D studio rendering, quiet Scandinavian industrial design, solid opaque materials, detailed edges and neutral soft rim light readable on both white and charcoal UI. Centered square composition, every object fully visible and inside canvas, about 76% of canvas, generous transparent padding. Genuine transparent alpha background. No backdrop, room, floor, pedestal, cast floor shadow, frame, captions, UI, glow or extra objects. Illustrative category image, never a real measurement or claimed exact product.
```

