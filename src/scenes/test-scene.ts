import * as THREE from 'three';
import { IsoCamera } from '../render/iso';
import { LineBatch, type Vec3 } from '../render/lines';
import { BOX_EDGES, BOX_FACES, FaceBatch, boxCorners } from '../render/faces';
import { GROUND, INK, INK_35, PEN, SIGNAL, VOLTAGE_CLASSES } from '../render/style';

/**
 * Phase-0 test scene: proves the harness captures real WebGL frames and exercises
 * the two structural rendering pieces — screen-space instanced lines (every voltage
 * class weight and dash) and hidden-line removal (boxes occluding lines behind them).
 */
export function mountTestScene(canvas: HTMLCanvasElement): { probe: () => number } {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  const pr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pr);
  renderer.setClearColor(new THREE.Color(GROUND), 1);

  const scene = new THREE.Scene();
  const cam = new IsoCamera();
  const lines = new LineBatch();
  const faces = new FaceBatch();

  // ground grid, hairline, 1 unit pitch
  for (let i = -6; i <= 6; i++) {
    lines.segment([i, 0, -6], [i, 0, 6], { width: PEN.hairline, color: INK_35 });
    lines.segment([-6, 0, i], [6, 0, i], { width: PEN.hairline, color: INK_35 });
  }

  // a conductor sample for every voltage class, running west→east behind the boxes
  VOLTAGE_CLASSES.forEach((vc, k) => {
    const z = -4 + k * 1.4;
    const pts: Vec3[] = [];
    for (let x = -6; x <= 6; x += 0.5) pts.push([x, 0.02, z + 0.25 * Math.sin(x)]);
    lines.polyline(pts, { width: vc.weight, dash: vc.dash, color: INK });
  });

  // boxes that occlude the conductors behind them
  const boxes: Array<[number, number, number, number, number, number]> = [
    [-3.5, 0, -2.5, -1.5, 2.2, -0.5],
    [1, 0, 0.5, 3.5, 1.2, 2.5],
    [-1, 0, 2.5, 0.2, 3.2, 3.7],
  ];
  for (const b of boxes) {
    const c = boxCorners(...b);
    for (const f of BOX_FACES) faces.quad(c[f[0]]!, c[f[1]]!, c[f[2]]!, c[f[3]]!);
    for (const e of BOX_EDGES) lines.segment(c[e[0]]!, c[e[1]]!, { width: PEN.outline, color: INK });
  }

  // a hatched signal face and a signal stroke: the only colour allowed
  faces.quad([3.8, 0.01, -5], [5.5, 0.01, -5], [5.5, 0.01, -3.5], [3.8, 0.01, -3.5], { color: SIGNAL, hatch: true });
  lines.polyline(
    [
      [3.8, 0.01, -5],
      [5.5, 0.01, -5],
      [5.5, 0.01, -3.5],
      [3.8, 0.01, -3.5],
    ],
    { width: PEN.medium, color: SIGNAL },
    true,
  );

  lines.commit();
  faces.commit();
  scene.add(faces.mesh, lines.mesh);

  const render = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    cam.setViewport(w, h);
    cam.pxPerUnit = Math.min(w, h) / 13;
    cam.update(50);
    lines.frame({ width: w, height: h, pixelRatio: pr, pxPerUnit: cam.pxPerUnit, time: 0 });
    faces.frame(pr);
    renderer.render(scene, cam.camera);
  };
  render();
  window.addEventListener('resize', render);

  return {
    probe: () => {
      render();
      const gl = renderer.getContext();
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let ink = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i]! < 100 && px[i + 1]! < 100) ink++;
      return ink;
    },
  };
}
