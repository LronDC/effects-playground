# Source and implementation notes

## Visual inspiration

The opening/closing focus handoff in Apple's [iPhone Duo product film](https://www.apple.com/iphone-duo/) was the visual reference, notably its progressive focus and the perspective relationship between a moving screen and stable content.

The public demo uses a landscape instead of Apple's screen artwork. The target is the UI illusion, not a phone model, true display transparency or sensor access.

## Code reference

The initial ray/plane projection and focus choreography were adapted after studying [jal-co/iphone-duo](https://github.com/jal-co/iphone-duo), commit `3674f3343d20a72fd6c7277bdd5cfeffc9216f7d`, under the MIT license. Retain the notice in [third-party.md](third-party.md).

This implementation uses CSS 3D surfaces and WebGL directly, not its Apple hardware model or React component. Subsequent changes anchor the backing plane, match CSS scale3d to the shader camera, and integrate finite-image/dark-space coverage into the same 64-tap defocus filter.

The [Mac experiment](https://github.com/lqSky7/iphone-duo-macos-animation) was inspected as an algorithmic reference. Its unlicensed Metal source was not copied or bundled.

## Companion Skill

[apple-design by Emil Kowalski](https://github.com/emilkowalski/skills/tree/main/skills/apple-design) supplies design and interaction guidance. It is not a Duo shader and is not an Apple-official project. This renderer works without it; the pairing is useful while designing or reviewing the interaction.

## Default photo

[Unsplash photograph](https://images.unsplash.com/photo-1470770841072-f978cf4d019e) under the [Unsplash License](https://unsplash.com/license). The image is embedded for offline demonstrations. Replace it with an image you may share.

## Claims

Describe this as a Duo-inspired UI effect or an independently implemented opening/closing transition. Do not claim exact device equivalence, a private Apple implementation, hardware access or that an untested device can run it. Recheck current product/platform claims before publication.
