# 0005 — Isometric orientation: camera in the south-west, looking north-east

**Chosen.** Azimuth 45° with the camera south-west of its target. World frame:
+x east, +y up, +z south. Elevation atan(1/√2) ≈ 35.264°. Both are single constants
in `src/render/iso.ts`.

**Rejected.** Camera in the south-east (north-west up the screen): California's long
axis would run top-to-bottom, wasting a landscape screen. Free rotation: breaks the
fixed projection that dash phase and label layout rely on, and an axonometric
drawing has one fixed projection.

**Why.** The state's long axis (Oregon border to Mexico, NW→SE) lies left-to-right on
screen, filling a landscape window. A compass rose in the legend shows north, since
north is not "up" in this projection.
