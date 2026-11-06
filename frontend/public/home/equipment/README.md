# Equipment card artwork

## Shared updates — 4 November 2026

The switch and PIR portraits have been replaced with black models. New window
open/closed, movement, presence and calendar illustrations are used by the shared
mobile, tablet and desktop renderers. These seven transparent 768 × 768 WebP
assets total under 300 kB. See [the full prompts and final asset paths](../../../../docs/ARTWORK_1.36.110.md).
Motion/presence status uses human illustrations; the PIR hardware portrait stays
available as a separate image choice. Calendar dates remain live text.

These four decorative product cutouts were generated with the built-in `image_gen`
tool on 31 October 2026. They are generic illustrations, not product identification
or images of residents' actual devices. No brand or product association is implied.

The transparent alpha from each generated PNG is preserved. Runtime assets are
512 × 512 WebP, encoded with `cwebp -q 88 -alpha_q 100`. Original generated files are
retained in Codex's generated-images directory; all runtime assets live here.

The final prompt for each image is the shared prompt below, with `SUBJECT` replaced
by its corresponding subject verbatim.

```
Use case: product-mockup. Asset type: transparent product cutout for a premium smart home dashboard card, viewed at 130–180 CSS pixels. Subject: SUBJECT. Photorealistic high-end 3D studio product rendering, understated premium industrial design, believable surfaces, detailed contours and soft rim lighting that reads on both white and charcoal UI. Entire object fully inside the canvas with generous transparent padding. Centered, square composition. Genuine transparent alpha background, no backdrop, no floor, no pedestal, no cast floor shadow. No brand names, logos, captions or UI. No illuminated status indicators, no colored glow, no extra objects. The product is illustrative, never a measurement or a claimed exact brand/model.
```

- `pendant.webp`: one compact hanging pendant light: a single matte graphite black bell-shaped shade, thin vertical cord ending inside frame at top, subtle brushed-metal rim, warm ivory diffuser underneath, elegant Scandinavian lamp
- `plug.webp`: one compact charcoal smart Schuko wall plug, 3/4 view from slightly above, round recessed European socket with two holes and grounding contacts, beveled rectangular housing, realistic fine matte plastic
- `lock.webp`: one modern slim charcoal electronic door lock, vertical rounded rectangular housing with a small flush numeric keypad and a horizontal metal lever handle, isolated without any door panel
- `contact.webp`: one compact matte charcoal magnetic contact sensor, with a tall small rounded rectangular main module and a narrower matching magnet module alongside it with a small gap

## Expanded component set — 2 November 2026

Thirteen additional transparent product portraits were generated with the built-in
`image_gen.imagegen` tool and encoded to 512 × 512 WebP using the same settings.
The complete final prompt for each asset and its original generated PNG filename
are saved in [the prompt manifest](../../../../docs/equipment-images-2026-11-02.json).
Original PNGs remain in Codex's generated-images directory; the final runtime files
are all saved in this directory.

| File | Subject |
| --- | --- |
| `leak.webp` | Water leak detector with stainless sensing contacts |
| `motion.webp` | Wall PIR sensor with a segmented Fresnel lens |
| `charger.webp` | Generic EV wallbox with cable and Type 2 connector |
| `switch.webp` | European single-gang rocker light switch |
| `strip.webp` | Flexible LED strip |
| `outdoor.webp` | Outdoor up/down wall luminaire |
| `spot.webp` | Recessed downlight |
| `track.webp` | Three-head track lighting assembly |
| `ceiling.webp` | Low-profile flush ceiling lamp |
| `smoke.webp` | Vented optical smoke detector |
| `bulb.webp` | E27 LED bulb |
| `floor.webp` | Complete floor lamp |
| `desk.webp` | Articulated desk lamp |

These images are illustrative, unbranded and unlit. Status, warnings, readings and
color controls continue to come from the actual device. Named EV charging switches
and a reported EV-station icon can select the wallbox; an ordinary phone charger
does not. A resident's explicit light type overrides name-based selection.

Remaining illustrations and image-failure fallbacks in `EquipmentArtwork.tsx`
are native SVG. Cover position,
window state and light tint use actual device attributes. Artwork is decorative
and hidden from accessibility APIs; the adjacent text supplies the real status.
Unavailable/missing measurements never become inferred product readings.

## Shared additions — 6 November 2026

Nine new 768 × 768 transparent product portraits cover thermostat, heat pump/AC,
fan, Venetian blind, roller blind, curtains, awning, garage door and alarm panel.
They share the same renderer and image picker on all screen sizes.
See [final prompts, provenance and asset paths](../../../../docs/ARTWORK_1.36.120.md).
