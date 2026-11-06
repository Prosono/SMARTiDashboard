# Shared equipment artwork — 1.36.120

Nine generic product portraits were generated with the built-in `image_gen` tool
on 6 November 2026. The final assets are in
[`frontend/public/home/equipment`](../frontend/public/home/equipment/), with genuine
transparent backgrounds and opaque product surfaces. All nine are 768 × 768 WebP,
encoded with `cwebp -q 88 -alpha_q 100 -resize 768 768` from the generated PNGs.
Total runtime size: **447,872 bytes**. Every file's alpha channel, dimensions and
WebP structure were checked with `webpinfo`.

These are illustrative hardware types, not exact product identification or
measurements. Thermostat and alarm displays contain no made-up readings. Cover
portraits identify the hardware; actual open/closed/position values remain live
text from the hub. Existing state-aware window art and native SVG fallbacks remain.
Previously generated assets were not overwritten.

The shared equipment renderer selects these pictures across Home, Rooms, Devices
and mobile cards. They are also available in the card image picker; both mobile
and desktop/tablet layouts retain independent saved configuration. Compact
inventory visuals have reserved bounds and suppress the large pendant light halo.

## Final asset paths and prompt set

### thermostat

- Runtime asset: [`frontend/public/home/equipment/thermostat.webp`](../frontend/public/home/equipment/thermostat.webp)
- Generated source retained at `/Users/vetle.nikolai.prebensen.norman/.codex/generated_images/01a18ca9-5bf0-7c01-897a-003955c878a7/exec-c374a8eb-19b7-4e2c-a937-f4ae78383e28.png`.

```text
Use case: product-mockup. Asset type: transparent product cutout for SMARTi smart-home dashboard at 64–180 CSS pixels. Subject: ONE modern circular wall thermostat, satin ivory-white thick outer rotating ring with subtle engraved tick marks, smaller central charcoal blank glass screen, a tiny unobtrusive embossed thermometer outline below the screen. Clear physical rotating dial construction, soft three-quarter front view. Photorealistic high-end studio product rendering, Scandinavian premium industrial design, solid opaque material, neutral studio rim light readable on white and charcoal UI. Centered square image, entire object inside canvas occupying about 76% of canvas, generous transparent padding. Genuine transparent alpha background, no wall, room, backdrop, floor or cast floor shadow. No logos, branding, readable numbers, temperature readings, captions, status lights, glow or extra objects. Generic hardware illustration, not a claimed measured state.
```

### air-conditioner

- Runtime asset: [`frontend/public/home/equipment/air-conditioner.webp`](../frontend/public/home/equipment/air-conditioner.webp)
- Generated source retained at `/Users/vetle.nikolai.prebensen.norman/.codex/generated_images/01a18ca9-5bf0-7c01-897a-003955c878a7/exec-73c64f78-1de0-4476-a743-85fe47706b47.png`.

```text
Use case: product-mockup. Asset type: transparent product cutout for the existing SMARTi smart-home dashboard, viewed at 64–180 CSS pixels. Primary request: One modern wall-mounted indoor air-conditioning heat-pump unit, warm-white rectangular body with charcoal inner vent, visible horizontal air outlet louvers, slight three-quarter front view, no wall. Photorealistic high-end 3D studio product rendering with restrained premium Scandinavian industrial design. Believable solid opaque surfaces, detailed contours, neutral soft studio and rim lighting that reads on white and charcoal UI. Centered square composition, entire object fully inside canvas, about 78% of canvas, generous transparent padding on every side. Genuine transparent alpha background, no backdrop, floor, pedestal or cast floor shadow. No logos, branding, text, numbers, UI, status lights, colored glow or extra objects. A generic illustrative product, not a claim of a particular brand or measured state.
```

### fan

- Runtime asset: [`frontend/public/home/equipment/fan.webp`](../frontend/public/home/equipment/fan.webp)
- Generated source retained at `/Users/vetle.nikolai.prebensen.norman/.codex/generated_images/01a18ca9-5bf0-7c01-897a-003955c878a7/exec-2e70a48e-a40e-46a4-a571-c04da8fde044.png`.

```text
Use case: product-mockup. Asset type: transparent product cutout for the existing SMARTi smart-home dashboard, viewed at 64–180 CSS pixels. Primary request: One compact modern pedestal-free desktop air circulator fan, graphite round grille, clear visible blades behind the grille and short integrated support base, slight three-quarter front view. Photorealistic high-end 3D studio product rendering with restrained premium Scandinavian industrial design. Believable solid opaque surfaces, detailed contours, neutral soft studio and rim lighting that reads on white and charcoal UI. Centered square composition, entire object fully inside canvas, about 78% of canvas, generous transparent padding on every side. Genuine transparent alpha background, no backdrop, floor, pedestal or cast floor shadow. No logos, branding, text, numbers, UI, status lights, colored glow or extra objects. A generic illustrative product, not a claim of a particular brand or measured state.
```

### blind

- Runtime asset: [`frontend/public/home/equipment/blind.webp`](../frontend/public/home/equipment/blind.webp)
- Generated source retained at `/Users/vetle.nikolai.prebensen.norman/.codex/generated_images/01a18ca9-5bf0-7c01-897a-003955c878a7/exec-c9332417-80b5-400f-94d0-0828ef5deb02.png`.

```text
Use case: product-mockup. Asset type: transparent product cutout for the existing SMARTi smart-home dashboard, viewed at 64–180 CSS pixels. Primary request: One graphite Venetian window blind product, rectangular frame filled with horizontal slats, neatly aligned tilted slats and a bottom rail, no room, no window frame, full product centered. Photorealistic high-end 3D studio product rendering with restrained premium Scandinavian industrial design. Believable solid opaque surfaces, detailed contours, neutral soft studio and rim lighting that reads on white and charcoal UI. Centered square composition, entire object fully inside canvas, about 78% of canvas, generous transparent padding on every side. Genuine transparent alpha background, no backdrop, floor, pedestal or cast floor shadow. No logos, branding, text, numbers, UI, status lights, colored glow or extra objects. A generic illustrative product, not a claim of a particular brand or measured state.
```

### roller

- Runtime asset: [`frontend/public/home/equipment/roller.webp`](../frontend/public/home/equipment/roller.webp)
- Generated source retained at `/Users/vetle.nikolai.prebensen.norman/.codex/generated_images/01a18ca9-5bf0-7c01-897a-003955c878a7/exec-f1f415e2-ae95-4ea2-876d-cccef1057ca0.png`.

```text
Use case: product-mockup. Asset type: transparent product cutout for SMARTi smart-home dashboard cards at 64–180 CSS pixels. Subject: One modern charcoal roller window blind product, a slim top cylindrical cassette with a single continuous medium-grey finely woven fabric panel and weighted straight bottom hem, fully lowered. No slats, no window frame, no chains, no room. Photorealistic high-end 3D studio product rendering, premium Scandinavian industrial design, solid opaque detailed surfaces, neutral soft studio and rim lighting readable on white and charcoal UI. Centered square composition, entire object inside canvas, around 78% of canvas with generous transparent padding. Genuine transparent alpha background, no backdrop, floor, pedestal or cast floor shadow. No brand, logo, captions, readable text, measurements, UI, status lights, colored glow or extra objects. Generic product illustration, not measured state.
```

### curtain

- Runtime asset: [`frontend/public/home/equipment/curtain.webp`](../frontend/public/home/equipment/curtain.webp)
- Generated source retained at `/Users/vetle.nikolai.prebensen.norman/.codex/generated_images/01a18ca9-5bf0-7c01-897a-003955c878a7/exec-0cf623d8-e724-4f1e-904d-fc1643f27b1e.png`.

```text
Use case: product-mockup. Asset type: transparent product cutout for SMARTi smart-home dashboard cards at 64–180 CSS pixels. Subject: A pair of elegant floor-length charcoal grey curtains hanging from a slim black rail, softly pleated fabric panels meeting at the center, fully visible with a subtle narrow opening. No window, wall or room. Photorealistic high-end 3D studio product rendering, premium Scandinavian industrial design, solid opaque detailed surfaces, neutral soft studio and rim lighting readable on white and charcoal UI. Centered square composition, entire object inside canvas, around 78% of canvas with generous transparent padding. Genuine transparent alpha background, no backdrop, floor, pedestal or cast floor shadow. No brand, logo, captions, readable text, measurements, UI, status lights, colored glow or extra objects. Generic product illustration, not measured state.
```

### awning

- Runtime asset: [`frontend/public/home/equipment/awning.webp`](../frontend/public/home/equipment/awning.webp)
- Generated source retained at `/Users/vetle.nikolai.prebensen.norman/.codex/generated_images/01a18ca9-5bf0-7c01-897a-003955c878a7/exec-f4815f71-3cc5-45d7-8683-c8d91a23366e.png`.

```text
Use case: product-mockup. Asset type: transparent product cutout for SMARTi smart-home dashboard cards at 64–180 CSS pixels. Subject: One modern retractable terrace awning product, graphite slim horizontal wall cassette, extended articulated arms and taut muted warm-grey striped canvas canopy, three-quarter front view showing construction. No building, house, wall or room. Photorealistic high-end 3D studio product rendering, premium Scandinavian industrial design, solid opaque detailed surfaces, neutral soft studio and rim lighting readable on white and charcoal UI. Centered square composition, entire object inside canvas, around 78% of canvas with generous transparent padding. Genuine transparent alpha background, no backdrop, floor, pedestal or cast floor shadow. No brand, logo, captions, readable text, measurements, UI, status lights, colored glow or extra objects. Generic product illustration, not measured state.
```

### garage

- Runtime asset: [`frontend/public/home/equipment/garage.webp`](../frontend/public/home/equipment/garage.webp)
- Generated source retained at `/Users/vetle.nikolai.prebensen.norman/.codex/generated_images/01a18ca9-5bf0-7c01-897a-003955c878a7/exec-da780f56-ca0c-4f50-854d-d04d6f41d308.png`.

```text
Use case: product-mockup. Asset type: transparent product cutout for SMARTi smart-home dashboard cards at 64–180 CSS pixels. Subject: One closed graphite sectional garage door product with a narrow matching frame and horizontal panel seams, subtle metal finish, three-quarter front view. Only the door product: no facade, driveway, house, building or scenery. Photorealistic high-end 3D studio product rendering, premium Scandinavian industrial design, solid opaque detailed surfaces, neutral soft studio and rim lighting readable on white and charcoal UI. Centered square composition, entire object inside canvas, around 78% of canvas with generous transparent padding. Genuine transparent alpha background, no backdrop, floor, pedestal or cast floor shadow. No brand, logo, captions, readable text, measurements, UI, status lights, colored glow or extra objects. Generic product illustration, not measured state.
```

### alarm

- Runtime asset: [`frontend/public/home/equipment/alarm.webp`](../frontend/public/home/equipment/alarm.webp)
- Generated source retained at `/Users/vetle.nikolai.prebensen.norman/.codex/generated_images/01a18ca9-5bf0-7c01-897a-003955c878a7/exec-228827dc-2ae7-44de-b44e-5cfc882cdbcc.png`.

```text
Use case: product-mockup. Asset type: transparent product cutout for SMARTi smart-home dashboard cards at 64–180 CSS pixels. Subject: One premium compact smart security alarm keypad control panel, matte charcoal casing, clear physical numeric keypad buttons but no readable text or numbers, a small blank glass status screen and subtle shield emblem. Three-quarter front view. No wall. Photorealistic high-end 3D studio product rendering, premium Scandinavian industrial design, solid opaque detailed surfaces, neutral soft studio and rim lighting readable on white and charcoal UI. Centered square composition, entire object inside canvas, around 78% of canvas with generous transparent padding. Genuine transparent alpha background, no backdrop, floor, pedestal or cast floor shadow. No brand, logo, captions, readable text, measurements, UI, status lights, colored glow or extra objects. Generic product illustration, not measured state.
```

