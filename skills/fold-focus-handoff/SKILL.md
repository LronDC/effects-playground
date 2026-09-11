---
name: fold-focus-handoff
description: Build a reversible fold-open UI transition over a fixed photograph or interface image, with perspective-correct sampling, progressive focus and soft dark boundaries. Use for Duo-inspired opening/closing effects and reusable web demos; this is not a standalone liquid-glass lens or hardware integration.
---

# Fold Focus Handoff

Turn a fixed image into a surface that opens like a book, revealing the image through a progressively focusing window. Keep the backing picture stationary. A photo alone is a complete deliverable; a phone body or sensor is optional, not required.

## Start from the tested renderer

Run from this skill directory:

```bash
python3 scripts/scaffold_demo.py /absolute/output/directory --title "Fold Focus"
```

The result is one offline `index.html`. Open it in a WebGL 2 browser. It includes an attributed landscape, image selection, drag/scrub, play/pause, speed and comparison controls. No npm packages, server or account is required.

Use `--image /absolute/photo.jpg` to embed another local image. The script refuses to overwrite an existing file unless `--force` is explicitly supplied. Choosing a picture in the browser changes the current session only; use `--image` for a permanent deliverable.

The bundled template contains the tested shader and interaction, not a generated illustration of the effect. Preserve its geometry while changing the chosen image, typography or presentation.

## Optical and spatial invariants

- Use one reversible `progress` in 0–1. Simulated opening angle drives geometry and sampling; it is not a hardware reading.
- Keep the right side and backing image fixed in screen coordinates. Do not re-center the whole picture as it opens.
- Sample the backing plane through a camera ray from each moving-surface pixel. Do not normalize the image to the turning surface's width or blend it back onto mesh UVs: that turns the window into a turning photograph.
- Keep CSS and shader coordinate systems identical, including `scale3d`, camera distance and viewing angle. A CSS 2D scale leaves depth unscaled.
- Treat the finite picture and surrounding dark space as one source inside the defocus filter. Applying a black mask after blur produces a pasted-on edge.
- Preserve broad image shapes while focus changes spatially. The tested kernel has 64 weighted samples and bounded mip prefiltering. Do not add noise, large ripples, chromatic splitting or a second lens unless the user requests them.
- Let the angle-dependent dark region disappear continuously as the surface becomes flat. Do not leave a vignette or black frame.
- The small inner-surface overlap prevents a compositor hairline; include its real width in texture coordinates instead of stretching the image.
- Dragging interrupts autoplay immediately and reverses from the current state. Do not restart a separate animation timeline.

These are constraints for this visual mechanism, not universal rules for every translucent material. For a different named product effect, inspect its original moving reference before adapting this template.

## Controls and capture API

`window.__duo` (also `window.__duoTransition`) exposes:

- `setProgress(number)`, `setAuto(boolean)`
- `setImage(url, optionalLabel)` — Promise; data URLs and local object URLs work offline
- `setMode('handoff'|'cut')` — ordinary-turn comparison disables projection and blur
- `setDarkEdges(boolean)`
- `setBlurEnabled(boolean)` — projection remains active, for coordinate checks
- `setView(-25..25)`
- `getState()` — includes readiness and GL errors

Open with `?capture=1&autoplay=0&progress=.65` to hide controls. Wait for `ready=true`, `error=null`, `glError=0`, then set progress and allow two animation frames before capture. Recording deterministic frames from the real renderer is valid; do not describe programmatic playback as a human recording a gesture.

## Verify the change you made

Inspect early, edge-on, mostly-open and flat states in both directions. Check the image-to-dark-space boundary at several angles, not only the final frame.

Disable blur while retaining projection: recognizable landmarks should not drift in screen space. Compare the fixed right canvas's position and pixels across progress values. Repeatedly returning to the same progress must return the same picture. Check that fully open has no seam, dark frame or late jump, and that narrow screens do not overflow.

Export only after checking the actual running renderer. Technical checks do not establish an exact visual match or imply user approval.

## Provenance and sharing

Read [references/sources.md](references/sources.md) before describing the origin or publishing the result. Retain [references/third-party.md](references/third-party.md) when redistributing.

This is an independent web/UI approximation, not Apple's private shader or a physical transparent display. The Skill can be used alongside `apple-design` for interaction review, but has no runtime dependency on it. The public template includes no Apple film crop, model or UI assets.
