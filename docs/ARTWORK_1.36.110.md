# Shared dashboard artwork — 1.36.110

Generated on 4 November 2026 with the built-in `imagegen` tool. These are new
raster cutouts, not SVG/icon substitutes. Each requested subject used its own
generation call with a transparent background. Originals remain in the native
generated-image library; the application uses 768 × 768 WebP encodings, quality
88 and alpha quality 100, produced with cwebp. No background was flattened.

Final assets, relative to the repository root:

| Subject | File |
| --- | --- |
| Closed window | `frontend/public/home/equipment/window-closed.webp` |
| Open window | `frontend/public/home/equipment/window-open.webp` |
| Actual movement | `frontend/public/home/equipment/movement.webp` |
| Presence | `frontend/public/home/equipment/presence.webp` |
| Black PIR detector | `frontend/public/home/equipment/motion.webp` |
| Black rocker light switch | `frontend/public/home/equipment/switch.webp` |
| Calendar | `frontend/public/home/equipment/calendar.webp` |

`motion.webp` remains the selectable detector image for existing saved image
IDs. The automatic motion-status representation uses `movement.webp`; occupancy
and presence use `presence.webp`. Windows choose the open/closed image only
from an available, known reported state. The calendar is blank in the bitmap;
its day is rendered from the application's actual date, not baked into an image.

## Final prompt set

Shared prompt (prepended verbatim to every subject):

> Use case: product-mockup. Asset type: one polished smart-home dashboard product cutout, square composition. Premium realistic 3D catalog render with soft studio lighting, crisp readable form at thumbnail size, subtle material detail. Isolate the entire subject with generous transparent padding on a genuinely transparent alpha background, no floor or room backdrop, no checkerboard, no baked border, no logo, no text or numbers. Fit the full object inside the frame. Use charcoal, cool gray, warm ivory and a restrained amber accent so it looks clear on both light and dark dashboard cards. No large glow, no flat outline icon.

Each call adds `Primary request:` followed by its subject:

- Closed window: A modern Scandinavian single casement window, CLOSED, dark graphite aluminum frame with realistic blue gray reflective clear glazing, visible handle on the right, slightly three-quarter perspective. This is a window fixture, not a door and not a sensor. Frame has realistic depth, elegant thin lines, no outdoor scenery.
- Open window: A modern Scandinavian single casement window, visibly OPEN inward about 35 degrees, dark graphite aluminum frame, realistic blue gray clear reflective glass, a handle and visible inner frame. Slightly three-quarter perspective, mechanically plausible hinges and open sash, matching a premium dark graphite closed casement window product. No outdoor scenery, no door, no sensor.
- Movement: A tasteful stylized sculptural full-body human figure walking, representing actual MOVEMENT, with three subtle trailing curved motion streaks behind the body. Figure is matte charcoal with softly lit warm ivory highlights and restrained amber movement trails. Natural forward step, clear arms and legs, no face detail. The subject is a moving human, absolutely no PIR sensor or electronic detector. Premium dimensional figurine with clean anatomical silhouette.
- Presence: A tasteful stylized sculptural person seated calmly in a minimal armchair, representing a person's PRESENCE in a room. One human figure, matte charcoal and softly lit warm ivory, minimal amber accent, no face detail. Readable dimensional human form and chair, uncluttered. No sensor, no electronics, no radar rings, no room backdrop.
- Black detector: A high quality BLACK wall mounted PIR motion detector, compact rounded rectangular satin black enclosure, clearly visible translucent smoked gray faceted Fresnel lens on the lower front, small discreet amber indicator above, slight three-quarter perspective. A convincing real smart-home product, carefully detailed black plastic, no text, no giant white dome, no person.
- Light switch: A modern premium BLACK European square wall light switch with a thin graphite outer frame and one broad satin black rocker paddle, subtle bevels, tactile separation between paddle and frame, slight three-quarter front view. Mechanical rocker, not a socket, no prong holes, no touch-screen UI, no logo, no text. Soft reflected studio light makes black materials legible.
- Calendar: A premium freestanding small desk flip-calendar, warm ivory blank page, charcoal sturdy stand, two refined brushed brass binding rings at the top, slight three-quarter front perspective. Wide unobstructed blank page area suitable for a live day number to be overlaid by the application. No printed dates, no letters, no numbers, no tiny grid, no clock, no pen. Sophisticated realistic paper thickness and gentle shadows on the object itself.
