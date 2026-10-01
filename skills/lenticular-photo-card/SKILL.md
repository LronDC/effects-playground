---
name: lenticular-photo-card
description: Turn two photos into a realistic, angle-dependent lenticular flip card using a bundled cylindrical-lens renderer. Use for interactive photo cards, lenticular materials, and replacing crossfade or Venetian-blind imitations. This creates a web effect, not a printable lens sheet or 3D reconstruction.
---

# Lenticular Photo Card

Make a digital card behave like two interlaced photographs viewed through a sheet of cylindrical lenses. Reuse the bundled implementation instead of approximating the effect from scratch. The renderer is independent of the surrounding app, the photos, and any model API.

## Start with the working material

Run from this skill directory:

```bash
node scripts/scaffold_demo.mjs /absolute/output/card \
  --image-a /absolute/photo-a.jpg \
  --image-b /absolute/photo-b.png \
  --title "我的光栅卡"
```

Open the output `index.html`. Keep its companion files together. No npm packages, backend, account, camera, or inference request is required. Without input files, the starter shows explicitly labeled A/B calibration patterns; replace them using its local photo controls. The script refuses to overwrite existing generated files.

Use the starter for a standalone result. To add the effect to an existing site, read [integration.md](references/integration.md) and reuse `assets/template/renderer.js` with the host application's controls. Do not replace an existing product UI with this starter just to gain the material.

## Preserve the mechanism

- Select the photograph by tracing the eye ray into a circular cylindrical lens, applying air-to-plastic Snell refraction, and sampling a fixed, periodic interlaced print. Do not substitute whole-image opacity mixing, time-driven wipes, or moving random masks.
- Drive CSS rotation and shader viewing direction from the same `TiltRenderer.pose(state)`. Keep the front surface, thin back, round corners, and separate support shadow. Surface material and card rotation are different layers.
- Tie optical viewing distance to CSS perspective divided by actual card width. DPR and export resolution must not become eye distance. Preserve 3:4 geometry; cover-crop arbitrary input aspect ratios rather than stretching them.
- Preserve 186 physical lens columns across resizing and capture. Fixed print registration and lens prescription are independent of image content; do not tune them per photograph or re-register them every frame.
- Keep every pose static and reversible: stopping the pointer freezes the material; returning to a pose reproduces the same image. Motion easing may smooth input but must not introduce a second image-transition timeline.
- Keep repeated viewing zones distinct from softness. `viewRepeats` changes the printed A/B repeat count; `flipRange` widens the printed-edge sampling interval. Neither multiplies the CSS rotation angle. Keep defaults `viewRepeats: 1`, `flipRange: 1` unless the user requests otherwise.
- Retain computed crosstalk near transitions. Do not force all off-axis views to a perfectly clean A or B; a brief mixed image is part of this material.
- Preserve the Canvas 2D fallback and original attribution. Optical selection is shared, but sampling and highlights are lower fidelity than WebGL.

Read [optics.md](references/optics.md) before changing lenses, print registration, ray coordinates, or repeated-zone formulas. It records the prescription, derivation and limits; it does not claim calibration against a manufactured sheet.

## Validate the extracted effect

Run `node scripts/check_optics.mjs` after changing optical code. It checks geometry against separate calculations, negative controls, repeated viewing zones and reversibility; a syntax check alone is insufficient.

Test the actual delivered page with both wide and tall images. Confirm correct crop proportions, a slow forward/reverse drag retracing the same transition, held intermediate views remaining still, and new uploads updating the material. Check desktop and touch-size layouts, resizing, and WebGL loss/fallback. Do not silently disable rendering to obtain a passing capture.

Judge transitions using a recording or the live page, not one attractive frame. `snapshot()` is only a flat rendered card-face PNG, not an interactive file or the perspective-composited screen. If animation export is requested separately, capture poses using the same state and renderer instead of substituting a crossfade.

## Scope and sources

Keep photos local by default. Server uploads, a camera, site publication, and platform-specific saving are separate integrations, not requirements of this skill.

This is a reusable visual approximation, not a proprietary hardware effect, novel-physics claim, or generation of unseen 3D viewpoints. See [attribution.md](references/attribution.md) for source history and the retained third-party license.
