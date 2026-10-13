import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { FlowRole, FlowSnapshot } from "./energyFlowModel";

export default function EnergyScene({
  flows,
  animate,
  lang,
}: {
  flows: FlowSnapshot;
  animate: boolean;
  lang: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const values = useRef({ flows, animate });
  values.current = { flows, animate };
  const api = useRef<{
    sync: () => void;
    rotate: (amount: number) => void;
  } | null>(null);
  const [failed, fail] = useState(false);
  useEffect(() => {
    const element = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      fail(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    element.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-hidden", "true");
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-6, 6, 5, -5, 0.1, 70);
    const root = new THREE.Group();
    scene.add(root);
    const geometries: THREE.BufferGeometry[] = [],
      materials: THREE.Material[] = [];
    function material(color: number, roughness = 0.75) {
      const m = new THREE.MeshStandardMaterial({ color, roughness });
      materials.push(m);
      return m;
    }
    const wall = material(0xe8e4da),
      roof = material(0x45575a),
      frame = material(0x283c40),
      slab = material(0xdbdcd4);
    const glass = material(0xffdc95, 0.3),
      panel = material(0x173947, 0.25),
      trim = material(0x8cabba);
    function mesh(
      g: THREE.BufferGeometry,
      m: THREE.Material,
      x: number,
      y: number,
      z: number,
      parent: THREE.Object3D = root,
    ) {
      geometries.push(g);
      const object = new THREE.Mesh(g, m);
      object.position.set(x, y, z);
      object.castShadow = object.receiveShadow = true;
      parent.add(object);
      return object;
    }
    function box(
      w: number,
      h: number,
      d: number,
      m: THREE.Material,
      x: number,
      y: number,
      z: number,
      parent: THREE.Object3D = root,
    ) {
      return mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z, parent);
    }
    // Architectural model: gabled home, carport, solar roof, battery and utility connection.
    box(9, 0.18, 8, slab, 0, -0.12, 0.8);
    box(3.6, 1.8, 3, wall, 0, 0.9, 0);
    const triangle = new THREE.Shape();
    triangle.moveTo(-1.8, 1.8);
    triangle.lineTo(0, 2.8);
    triangle.lineTo(1.8, 1.8);
    triangle.closePath();
    mesh(
      new THREE.ExtrudeGeometry(triangle, { depth: 3, bevelEnabled: false }),
      wall,
      0,
      0,
      -1.5,
    );
    const pitch = Math.atan(1 / 1.8);
    box(2.2, 0.13, 3.5, roof, -0.9, 2.3, 0).rotation.z = pitch;
    box(2.2, 0.13, 3.5, roof, 0.9, 2.3, 0).rotation.z = -pitch;
    box(0.72, 1.4, 0.07, frame, -0.92, 0.7, 1.54);
    box(0.5, 1.13, 0.08, glass, -0.92, 0.8, 1.58);
    box(1.25, 1.3, 0.07, frame, 0.63, 1.05, 1.54);
    box(1.12, 1.16, 0.08, glass, 0.63, 1.05, 1.59);
    box(0.045, 1.2, 0.03, frame, 0.63, 1.05, 1.64);
    box(1.15, 0.04, 0.03, frame, 0.63, 1.05, 1.64);
    box(0.07, 0.9, 1.35, frame, 1.83, 0.95, -0.55);
    box(0.08, 0.78, 1.22, glass, 1.88, 0.95, -0.55);
    box(2.25, 0.15, 2.9, roof, -2.7, 1.55, 0.3);
    for (const x of [-3.6, -1.8])
      for (const z of [-0.9, 1.5]) box(0.09, 1.5, 0.09, frame, x, 0.75, z);
    const groups: Partial<Record<FlowRole, THREE.Group>> = {};
    const solar = new THREE.Group();
    solar.position.set(0.93, 2.43, 0);
    solar.rotation.z = -pitch;
    root.add(solar);
    groups.solar = solar;
    for (let x = 0; x < 2; x++)
      for (let z = 0; z < 5; z++) {
        box(0.75, 0.045, 0.49, trim, (x - 0.5) * 0.8, 0, (z - 2) * 0.54, solar);
        box(
          0.7,
          0.05,
          0.44,
          panel,
          (x - 0.5) * 0.8,
          0.025,
          (z - 2) * 0.54,
          solar,
        );
        box(
          0.014,
          0.007,
          0.44,
          trim,
          (x - 0.5) * 0.8,
          0.055,
          (z - 2) * 0.54,
          solar,
        );
      }
    const battery = new THREE.Group();
    root.add(battery);
    groups.battery = battery;
    box(0.48, 1.25, 0.7, wall, 2.55, 0.64, 0.7, battery);
    box(0.02, 0.85, 0.55, frame, 2.8, 0.68, 0.7, battery);
    box(0.03, 0.035, 0.24, material(0x63bc94), 2.82, 1, 0.7, battery);
    const ev = new THREE.Group();
    root.add(ev);
    groups.ev = ev;
    const car = material(0xf3f1e7, 0.35);
    const bodyShape = new THREE.Shape();
    bodyShape.moveTo(-0.54, -0.13);
    bodyShape.lineTo(0.54, -0.13);
    bodyShape.lineTo(0.54, 0.1);
    bodyShape.lineTo(0.4, 0.18);
    bodyShape.lineTo(-0.4, 0.18);
    bodyShape.lineTo(-0.54, 0.1);
    bodyShape.closePath();
    mesh(
      new THREE.ExtrudeGeometry(bodyShape, {
        depth: 2.02,
        bevelEnabled: true,
        bevelSegments: 3,
        steps: 1,
        bevelSize: 0.07,
        bevelThickness: 0.08,
      }),
      car,
      -2.75,
      0.4,
      0.75,
      ev,
    );
    box(1.04, 0.37, 1.14, frame, -2.75, 0.7, 1.52, ev);
    box(1.08, 0.08, 1.13, car, -2.75, 0.9, 1.52, ev);
    box(1.1, 0.06, 0.05, glass, -2.75, 0.49, 2.92, ev);
    for (const x of [-3.35, -2.15])
      for (const z of [1.13, 2.47])
        mesh(
          new THREE.CylinderGeometry(0.22, 0.22, 0.13, 16),
          frame,
          x,
          0.23,
          z,
          ev,
        ).rotation.z = Math.PI / 2;
    box(0.23, 0.85, 0.24, frame, -1.88, 0.45, 1.8, ev);
    box(0.25, 0.24, 0.25, wall, -1.88, 0.8, 1.8, ev);
    const grid = new THREE.Group();
    root.add(grid);
    groups.grid = grid;
    box(0.65, 1.08, 0.6, frame, 3.55, 0.55, 3.4, grid);
    box(0.67, 0.1, 0.62, wall, 3.55, 1.13, 3.4, grid);
    box(0.45, 0.38, 0.025, material(0x9bc4cb), 3.55, 0.8, 3.71, grid);
    // Small garden gives the model a physical base without hiding the flows.
    const leaf = material(0x6c8b73),
      soil = material(0x8d8878);
    for (const [x, z] of [
      [-3.4, -1.6],
      [2.8, -1.7],
    ]) {
      mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.35, 24), soil, x, 0.1, z);
      mesh(new THREE.SphereGeometry(0.5, 16, 12), leaf, x, 0.63, z);
    }
    const ambient = new THREE.HemisphereLight(0xf8fcff, 0x71837d, 2.5);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfff3dc, 3);
    sun.position.set(-4, 9, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -7;
    sun.shadow.camera.right = 7;
    sun.shadow.camera.top = 7;
    sun.shadow.camera.bottom = -7;
    sun.shadow.normalBias = 0.035;
    scene.add(sun);
    const hub = [0, 0.11, 2.8];
    const routes: Record<FlowRole, number[][]> = {
      solar: [
        [2, 2.05, 0.9],
        [2.12, 1, 0.9],
        [2.12, 0.11, 1.65],
        [1.8, 0.11, 2.8],
        hub,
      ],
      battery: [[2.55, 0.11, 1.15], [2.55, 0.11, 2.5], [1.8, 0.11, 2.8], hub],
      grid: [[3.55, 0.11, 3.75], [2.3, 0.11, 3.85], [0.2, 0.11, 3.85], hub],
      ev: [[-2.75, 0.11, 3.05], [-2, 0.11, 3.05], [-1, 0.11, 2.8], hub],
      home: [[0, 0.11, 1.55], [0, 0.11, 2.15], hub],
    };
    const colors: Record<FlowRole, number> = {
      solar: 0xd5a039,
      battery: 0x4cac88,
      grid: 0x759bc9,
      ev: 0x9985bc,
      home: 0xe88b46,
    };
    const tracks = (Object.keys(routes) as FlowRole[]).map((role) => {
      const group = new THREE.Group();
      root.add(group);
      const curve = new THREE.CatmullRomCurve3(
        routes[role].map((p) => new THREE.Vector3(...p)),
        false,
        "centripetal",
      );
      const mat = material(0x9baba7);
      mesh(
        new THREE.TubeGeometry(curve, 60, 0.022, 6, false),
        mat,
        0,
        0,
        0,
        group,
      );
      const particleMat = new THREE.MeshStandardMaterial({
        color: colors[role],
        emissive: colors[role],
        emissiveIntensity: 0.7,
      });
      materials.push(particleMat);
      const dots = Array.from({ length: 5 }, () =>
        mesh(
          new THREE.SphereGeometry(0.055, 8, 6),
          particleMat,
          0,
          0,
          0,
          group,
        ),
      );
      return { role, curve, group, mat, dots };
    });
    let angle = 0.69,
      visible = true,
      lost = false,
      lastFrame = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    function view() {
      const aspect = element.clientWidth / Math.max(element.clientHeight, 1);
      const height = Math.max(aspect < 1 ? 11.5 : 8.4, 11.8 / aspect);
      camera.left = (-height * aspect) / 2;
      camera.right = (height * aspect) / 2;
      camera.top = height / 2;
      camera.bottom = -height / 2;
      camera.position.set(12 * Math.sin(angle), 8, 12 * Math.cos(angle));
      camera.lookAt(0, 0.85, 0.8);
      camera.updateProjectionMatrix();
      renderer.setSize(element.clientWidth, element.clientHeight, false);
    }
    function draw(ms = 0) {
      if (ms && ms - lastFrame < 33) return;
      lastFrame = ms;
      const value = values.current;
      for (const item of tracks) {
        const flow = value.flows[item.role],
          active =
            flow.status === "ok" &&
            flow.watts !== null &&
            Math.abs(flow.watts) > 0.5;
        item.group.visible = flow.visible;
        if (groups[item.role]) groups[item.role]!.visible = flow.visible;
        item.mat.color.setHex(active ? colors[item.role] : 0x9baba7);
        const forward =
          item.role === "home" || item.role === "ev"
            ? false
            : (flow.watts || 0) > 0;
        const speed = 0.07 + Math.min(0.17, Math.abs(flow.watts || 0) / 40000);
        item.dots.forEach((dot, i) => {
          dot.visible = active;
          const phase =
            (i / 5 +
              (value.animate && !reduced.matches ? (ms / 1000) * speed : 0)) %
            1;
          dot.position.copy(item.curve.getPointAt(forward ? phase : 1 - phase));
        });
      }
      renderer.render(scene, camera);
    }
    function sync() {
      if (lost || !visible || document.hidden) {
        renderer.setAnimationLoop(null);
        return;
      }
      draw(performance.now());
      const shouldAnimate =
        visible &&
        !document.hidden &&
        !reduced.matches &&
        values.current.animate &&
        Object.values(values.current.flows).some(
          (f) =>
            f.visible &&
            f.status === "ok" &&
            f.watts !== null &&
            Math.abs(f.watts) > 0.5,
        );
      renderer.setAnimationLoop(shouldAnimate ? draw : null);
    }
    function resize() {
      view();
      lastFrame = 0;
      sync();
    }
    api.current = {
      sync: () => {
        lastFrame = 0;
        sync();
      },
      rotate: (amount) => {
        angle = Math.max(0.15, Math.min(1.3, angle + amount));
        view();
        lastFrame = 0;
        sync();
      },
    };
    let drag: number | null = null;
    function down(e: PointerEvent) {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      drag = e.clientX;
      renderer.domElement.setPointerCapture(e.pointerId);
    }
    function move(e: PointerEvent) {
      if (drag === null) return;
      api.current?.rotate((e.clientX - drag) * 0.004);
      drag = e.clientX;
    }
    function up() {
      drag = null;
    }
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointermove", move);
    renderer.domElement.addEventListener("pointerup", up);
    renderer.domElement.addEventListener("pointercancel", up);
    function contextLost(e: Event) {
      lost = true;
      e.preventDefault();
      renderer.setAnimationLoop(null);
      fail(true);
    }
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      lastFrame = 0;
      sync();
    });
    intersection.observe(element);
    document.addEventListener("visibilitychange", sync);
    reduced.addEventListener("change", sync);
    resize();
    return () => {
      api.current = null;
      renderer.setAnimationLoop(null);
      observer.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", sync);
      reduced.removeEventListener("change", sync);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("pointermove", move);
      renderer.domElement.removeEventListener("pointerup", up);
      renderer.domElement.removeEventListener("pointercancel", up);
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);
  useEffect(() => api.current?.sync(), [flows, animate]);
  return (
    <div className="energy-scene-wrap">
      <div
        ref={host}
        className="energy-scene"
        role="img"
        aria-label={
          lang === "en"
            ? "3D home with solar panels, battery, EV and grid connections. Readings below."
            : "3D-hus med solceller, batteri, elbil og strømnett. Målinger under."
        }
      />
      {failed && (
        <div className="energy-scene-fallback" role="status">
          {lang === "en"
            ? "3D view is unavailable in this browser. Live readings remain available below."
            : "3D-visningen er ikke tilgjengelig i denne nettleseren. Målingene vises fortsatt under."}
        </div>
      )}
      {!failed && (
        <div className="energy-scene-tools">
          <button
            aria-label={
              lang === "en" ? "Rotate house left" : "Drei huset mot venstre"
            }
            onClick={() => api.current?.rotate(-0.15)}
          >
            ↶
          </button>
          <span>
            {lang === "en"
              ? "Your home · illustration"
              : "Hjemmet ditt · illustrasjon"}
          </span>
          <button
            aria-label={
              lang === "en" ? "Rotate house right" : "Drei huset mot høyre"
            }
            onClick={() => api.current?.rotate(0.15)}
          >
            ↷
          </button>
        </div>
      )}
    </div>
  );
}
