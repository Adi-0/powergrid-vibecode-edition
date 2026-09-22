# 0006 — Lines, faces and hidden-line removal

**Chosen.** One instanced-quad line primitive (`src/render/lines.ts`): each segment is
a quad expanded in screen space in the vertex shader; the fragment shader evaluates
a capsule distance for a 1 px antialiased edge and round joins; dash phase is
continuous along a polyline using the projected length that precedes each segment
(exact under a fixed orthographic projection, so dashes are the same length in px at
every zoom and every direction). Faces (`src/render/faces.ts`) are ground-coloured,
depth-writing and pushed back with polygon offset so an object's own edges survive
and anything behind it is hidden. Hatched faces for sections and signal areas.

Every line and face also carries a collapse target and stagger, so level transitions
can fold geometry into its parent node and unfold it again, on the GPU.

**Rejected.** `THREE.Line` / `gl.lineWidth` (1 px on nearly every platform);
`Line2` from three/examples (no depth-correct hidden-line faces, no continuous dash
phase in screen px, no morph); SVG overlay (no occlusion, slow at network scale).
