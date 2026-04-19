# Frontend Overlay Notes

The `recommendedPads[].position` object uses normalized coordinates so the UX
layer can render the same recovery indicator placement across devices and canvas
sizes.

- Treat `{ x, y }` as values in the `0..1` range.
- Convert them after the canvas has its final responsive size:
  - `pixelX = x * canvasWidth`
  - `pixelY = y * canvasHeight`
- Use the HTML5 Canvas top-left corner as the origin `(0, 0)`.
- Draw the recovery "red zone" marker centered on `(pixelX, pixelY)`, not with
  the shape's top-left corner anchored there.
- Recompute marker placement whenever the video or canvas resizes so the overlay
  stays aligned with the underlying body frame.
