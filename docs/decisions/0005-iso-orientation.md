# 0005 — Isometric orientation: camera in the south, north up the screen

**Chosen.** A true isometric camera (azimuth 45° in the world frame, elevation
atan(1/√2) ≈ 35.264°, both single constants in `src/render/iso.ts`), with the *map*
turned 45° inside the system frame so geographic north points straight up the screen:
`project(lat, lon)` returns x = (e + n)/√2, z = (e − n)/√2 (`src/model/geo.ts`).

**Rejected.**
- *The map unturned* (camera south-west of the target, north toward the upper right).
  This was the first version. California's long axis then lay nearly along the
  screen's foreshortened diagonal and the state read as squashed and tilted; a reader
  had to consult a compass rose to find north.
- *Turning the camera instead of the map* (azimuth 0°): the drawing would no longer
  be isometric — equal foreshortening on the three axes is what lets equipment
  drawings at lower levels share one projection.
- *Free rotation*: an axonometric drawing has one fixed projection; dash phase and
  label layout depend on it.

**Why.** North up is how every reader already holds a map of California. The cost is
that ground distances up the screen are foreshortened (by sin(35.264°) = 57.7 %),
which the scale bar states in words rather than hiding.
