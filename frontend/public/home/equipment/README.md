# Equipment card artwork

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

Other illustrations in `EquipmentArtwork.tsx` are native SVG. Cover position,
window state and light tint use actual device attributes. Artwork is decorative
and hidden from accessibility APIs; the adjacent text supplies the real status.
Unavailable/missing measurements never become inferred product readings.
