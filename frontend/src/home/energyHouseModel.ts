import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { FlowRole } from "./energyFlowModel";
import { createEnergyVehicle } from "./energyVehicleModel";
import { createEnergyRoutes } from "./energyFlowPaths";

/** A small architectural model, in metres. The front of the home faces +Z. */
export function createEnergyHouse() {
  const root = new THREE.Group();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const components: Partial<Record<FlowRole, THREE.Group>> = {};
  const own = <T extends THREE.BufferGeometry>(geometry: T) => {
    geometries.add(geometry);
    return geometry;
  };
  const material = (color: number, roughness = 0.65, metalness = 0) => {
    const value = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
    });
    materials.add(value);
    return value;
  };
  const luminous = (color: number, strength = 0.65) => {
    const value = material(color, 0.28, 0.1);
    value.emissive.setHex(color);
    value.emissiveIntensity = strength;
    return value;
  };
  const wall = material(0x333d43, 0.53, 0.22);
  const stone = material(0x354248, 0.91);
  const chalk = material(0x45515a, 0.62, 0.25);
  const charcoal = material(0x1d282f, 0.49, 0.25);
  const roofMaterial = material(0x26343c, 0.44, 0.35);
  const seamMaterial = material(0x647680, 0.4, 0.55);
  const dark = material(0x12212a, 0.42, 0.22);
  const warmWhite = luminous(0xffedcf, 0.8);
  const cyan = luminous(0x73ddf6, 0.8);
  const mint = luminous(0x81e1bb, 0.7);
  const lilac = luminous(0xc6a4ff, 0.65);
  const aluminium = material(0xa7bac2, 0.3, 0.75);
  const mesh = (
    geometry: THREE.BufferGeometry,
    surface: THREE.Material,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D = root,
  ) => {
    const object = new THREE.Mesh(own(geometry), surface);
    object.position.set(x, y, z);
    object.castShadow = object.receiveShadow = true;
    parent.add(object);
    return object;
  };
  const box = (
    w: number,
    h: number,
    d: number,
    surface: THREE.Material,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D = root,
    radius = 0,
  ) =>
    mesh(
      radius > 0
        ? new RoundedBoxGeometry(
            w,
            h,
            d,
            2,
            Math.min(radius, w / 2, h / 2, d / 2),
          )
        : new THREE.BoxGeometry(w, h, d),
      surface,
      x,
      y,
      z,
      parent,
    );
  const cylinder = (
    top: number,
    bottom: number,
    h: number,
    surface: THREE.Material,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D = root,
  ) =>
    mesh(
      new THREE.CylinderGeometry(top, bottom, h, 16),
      surface,
      x,
      y,
      z,
      parent,
    );
  const beam = (
    from: THREE.Vector3,
    to: THREE.Vector3,
    width: number,
    surface: THREE.Material,
    parent: THREE.Object3D = root,
  ) => {
    const object = box(
      width,
      from.distanceTo(to),
      width,
      surface,
      0,
      0,
      0,
      parent,
    );
    object.position.copy(from).add(to).multiplyScalar(0.5);
    object.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      to.clone().sub(from).normalize(),
    );
    return object;
  };
  const vector = (x: number, y: number, z: number) =>
    new THREE.Vector3(x, y, z);

  // A quiet, dark stone site. The dark substrate makes the energy light readable in any theme.
  box(9.8, 0.2, 8.2, stone, 0, -0.14, 0.4, root, 0.085);
  box(9.63, 0.08, 8.03, charcoal, 0, -0.275, 0.4, root, 0.035);
  const paving = material(0x404c52, 0.94);
  box(2.42, 0.025, 4.22, paving, -2.88, -0.022, 1.22, root, 0.035);
  for (const z of [0.4, 1.8])
    box(2.39, 0.004, 0.009, charcoal, -2.88, -0.006, z);
  box(1.22, 0.09, 0.56, chalk, -1.04, 0.03, 1.91, root, 0.015);
  box(1.36, 0.035, 0.48, paving, -1.04, -0.002, 2.17, root, 0.015);

  // Two interlocking pavilion volumes: a solid graphite rear block and a lower glazed living wing.
  // Thin reveals, generous uninterrupted glass and low horizontal roofs replace the gabled miniature.
  const building = new THREE.Group();
  root.add(building);
  box(3.67, 0.15, 3.38, charcoal, 0, 0.075, -0.05, building, 0.023);
  const interiorFloor = material(0x4c5050, 0.79);
  box(3.5, 0.08, 3.15, interiorFloor, 0, 0.185, -0.05, building);
  box(3.58, 2.02, 0.15, wall, 0, 1.165, -1.62, building, 0.012);
  box(0.16, 2.02, 2.16, wall, -1.71, 1.165, -0.62, building, 0.012);
  box(0.16, 0.89, 2.16, wall, 1.71, 0.61, -0.62, building);
  box(0.16, 0.37, 2.16, wall, 1.71, 1.99, -0.62, building);
  // A narrow full-height wall provides a real service bay for the battery.
  box(0.16, 1.8, 0.78, wall, 1.71, 1.06, 1.0, building, 0.013);
  box(0.16, 1.96, 0.11, wall, 1.71, 1.13, -1.67, building);
  box(0.13, 1.96, 0.13, charcoal, 1.715, 1.13, 0.43, building);
  // The taller rear roof has a slender silver reveal beneath its graphite fascia.
  box(3.91, 0.15, 2.34, roofMaterial, 0, 2.23, -0.62, building, 0.024);
  box(3.85, 0.025, 2.28, seamMaterial, 0, 2.143, -0.62, building, 0.012);
  box(3.68, 0.025, 2.13, charcoal, 0, 2.121, -0.62, building);
  box(3.58, 0.17, 0.12, wall, 0, 2.118, 0.442, building);
  // A lower cantilever shades the glass front without masking the roof array.
  box(3.91, 0.12, 1.32, roofMaterial, 0, 2.02, 1.03, building, 0.021);
  box(3.8, 0.022, 1.23, seamMaterial, 0, 1.949, 1.035, building, 0.009);
  box(3.57, 0.035, 1.07, charcoal, 0, 1.923, 1.05, building);
  // Recessed entry is one calm dark plane, with a single warm light slit.
  box(1.09, 1.8, 0.13, wall, -1.225, 1.07, 1.49, building, 0.015);
  box(0.745, 1.61, 0.035, dark, -1.18, 1.055, 1.575, building, 0.014);
  box(0.021, 0.37, 0.042, seamMaterial, -0.896, 1.07, 1.608, building, 0.007);
  box(0.018, 1.28, 0.012, warmWhite, -1.644, 1.18, 1.568, building, 0.005);

  const glass = material(0x496673, 0.12, 0.32);
  glass.transparent = true;
  glass.opacity = 0.34;
  glass.depthWrite = false;
  // No decorative furniture: the open interior reveals the actual animated home circuit below.
  box(2.36, 1.7, 0.055, material(0x333b3e, 0.67), 0.42, 1.08, 0.28, building);
  box(2.12, 0.018, 0.02, warmWhite, 0.42, 1.755, 0.315, building, 0.005);
  const frontGlass = mesh(
    new THREE.PlaneGeometry(2.39, 1.63),
    glass,
    0.47,
    1.075,
    1.603,
    building,
  );
  frontGlass.castShadow = false;
  glass.side = THREE.DoubleSide;
  for (const x of [-0.74, 0.45, 1.68])
    box(0.035, 1.69, 0.08, charcoal, x, 1.074, 1.598, building);
  for (const y of [0.239, 1.909])
    box(2.45, 0.027, 0.078, charcoal, 0.47, y, 1.598, building);
  const sideGlass = mesh(
    new THREE.PlaneGeometry(1.85, 0.74),
    glass,
    1.801,
    1.441,
    -0.635,
    building,
  );
  sideGlass.rotation.y = Math.PI / 2;
  sideGlass.castShadow = false;
  for (const z of [-1.57, -0.645, 0.28])
    box(0.055, 0.78, 0.024, charcoal, 1.8, 1.441, z, building);
  for (const y of [1.065, 1.817])
    box(0.055, 0.026, 1.91, charcoal, 1.8, y, -0.645, building);

  // Flush array on the taller roof. Equipment and service port share one independently hidden group.
  const solar = new THREE.Group();
  root.add(solar);
  components.solar = solar;
  const solarPanels = new THREE.Group();
  solarPanels.position.set(0, 2.355, -0.66);
  solar.add(solarPanels);
  for (const z of [-0.38, 0.38])
    box(3.13, 0.028, 0.045, dark, 0, -0.035, z, solarPanels);
  box(0.09, 0.43, 0.36, chalk, 1.85, 0.79, -0.66, solar, 0.035);
  box(0.016, 0.34, 0.277, dark, 1.902, 0.79, -0.66, solar, 0.015);
  box(0.019, 0.016, 0.113, aluminium, 1.912, 0.915, -0.66, solar, 0.004);
  const panelBlack = material(0x122b44, 0.2, 0.48);
  const cellBlue = material(0x244e75, 0.23, 0.48);
  const cellAlternate = material(0x315c82, 0.21, 0.55);
  const cellGeometry = own(new THREE.BoxGeometry(0.142, 0.009, 0.144));
  const cellMatrices: THREE.Matrix4[] = [];
  const alternateMatrices: THREE.Matrix4[] = [];
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 2; column++) {
      const x = (row - 1.5) * 0.82,
        z = (column - 0.5) * 0.77;
      box(0.775, 0.048, 0.715, aluminium, x, 0, z, solarPanels, 0.012);
      box(0.733, 0.025, 0.672, panelBlack, x, 0.035, z, solarPanels, 0.006);
      for (let u = 0; u < 4; u++)
        for (let v = 0; v < 4; v++) {
          const matrix = new THREE.Matrix4().makeTranslation(
            x + (u - 1.5) * 0.172,
            0.053,
            z + (v - 1.5) * 0.158,
          );
          ((u + v + column) % 3 ? cellMatrices : alternateMatrices).push(
            matrix,
          );
        }
    }
  }
  for (const [surface, transforms] of [
    [cellBlue, cellMatrices],
    [cellAlternate, alternateMatrices],
  ] as const) {
    const cells = new THREE.InstancedMesh(
      cellGeometry,
      surface,
      transforms.length,
    );
    transforms.forEach((matrix, i) => cells.setMatrixAt(i, matrix));
    cells.receiveShadow = true;
    solarPanels.add(cells);
  }

  // A matching floating carport canopy, open on all sides for a clean vehicle silhouette.
  const carport = new THREE.Group();
  root.add(carport);
  box(2.34, 0.1, 3.18, roofMaterial, -2.89, 1.77, -0.05, carport, 0.026);
  box(2.26, 0.018, 3.1, seamMaterial, -2.89, 1.711, -0.05, carport, 0.01);
  box(0.021, 0.012, 2.49, warmWhite, -3.72, 1.694, -0.07, carport);
  for (const x of [-3.97, -1.8])
    for (const z of [-1.42, 1.35])
      box(0.062, 1.7, 0.062, charcoal, x, 0.85, z, carport, 0.008);

  // A low, unbadged electric fastback with a compound-curved body and panoramic canopy.
  const ev = new THREE.Group();
  root.add(ev);
  components.ev = ev;
  const vehicle = createEnergyVehicle();
  vehicle.root.position.set(-2.93, 0, 1.3);
  vehicle.root.rotation.y = -0.045;
  ev.add(vehicle.root);
  const pearl = material(0xe0e7e7, 0.26, 0.32);
  // Charger is deliberately cable-free; energy is represented by the scene's light paths.
  box(0.37, 0.07, 0.4, stone, -1.91, 0.045, 2.0, ev, 0.04);
  box(0.25, 0.86, 0.22, charcoal, -1.91, 0.49, 2.0, ev, 0.045);
  box(0.29, 0.49, 0.24, pearl, -1.91, 0.99, 2.0, ev, 0.08);
  box(0.225, 0.36, 0.022, dark, -1.91, 1.0, 2.135, ev, 0.028);
  box(0.13, 0.018, 0.018, lilac, -1.91, 1.11, 2.156, ev, 0.008);
  cylinder(0.048, 0.048, 0.012, aluminium, -1.91, 0.91, 2.152, ev).rotation.x =
    Math.PI / 2;

  box(0.17, 0.15, 0.035, charcoal, -1.48, 0.4, 1.622, ev, 0.02);

  // Wall battery: satin graphite shell, inset face and understated status light.
  const battery = new THREE.Group();
  root.add(battery);
  components.battery = battery;
  box(0.08, 1.21, 0.71, charcoal, 1.875, 0.94, 0.99, battery, 0.025);
  box(0.35, 1.18, 0.69, chalk, 2.035, 0.94, 0.99, battery, 0.105);
  box(0.018, 0.92, 0.47, dark, 2.218, 0.97, 0.99, battery, 0.009);
  box(0.025, 0.025, 0.24, mint, 2.233, 1.31, 0.99, battery, 0.01);
  box(0.075, 0.12, 0.13, charcoal, 1.87, 0.36, 1.43, battery, 0.016);
  // A small embossed energy mark adds scale without text baked into the 3D scene.
  const batteryMark = new THREE.Shape();
  batteryMark.moveTo(-0.025, 0.1);
  batteryMark.lineTo(0.08, 0.1);
  batteryMark.lineTo(0.015, 0.0);
  batteryMark.lineTo(0.065, 0.0);
  batteryMark.lineTo(-0.055, -0.13);
  batteryMark.lineTo(-0.02, -0.035);
  batteryMark.lineTo(-0.075, -0.035);
  batteryMark.closePath();
  const mark = mesh(
    new THREE.ShapeGeometry(batteryMark),
    aluminium,
    2.235,
    0.99,
    0.99,
    battery,
  );
  mark.rotation.y = Math.PI / 2;

  // Utility mast: tapered steel support, crossarm, ceramic insulators and meter cabinet.
  const grid = new THREE.Group();
  root.add(grid);
  components.grid = grid;
  const mastX = 3.9,
    mastZ = 1.35;
  box(0.57, 0.11, 0.57, stone, mastX, 0.055, mastZ, grid, 0.045);
  cylinder(0.085, 0.12, 3.28, charcoal, mastX, 1.73, mastZ, grid);
  box(1.2, 0.11, 0.17, seamMaterial, mastX, 3.26, mastZ, grid, 0.02);
  beam(
    vector(mastX - 0.5, 3.22, mastZ),
    vector(mastX, 2.83, mastZ),
    0.035,
    aluminium,
    grid,
  );
  beam(
    vector(mastX + 0.5, 3.22, mastZ),
    vector(mastX, 2.83, mastZ),
    0.035,
    aluminium,
    grid,
  );
  const ceramic = material(0xa1c6c9, 0.27, 0.12);
  for (const x of [mastX - 0.47, mastX, mastX + 0.47]) {
    cylinder(0.036, 0.036, 0.29, aluminium, x, 3.45, mastZ, grid);
    for (let i = 0; i < 3; i++)
      cylinder(0.087, 0.061, 0.045, ceramic, x, 3.365 + i * 0.065, mastZ, grid);
    cylinder(0.037, 0.037, 0.025, dark, x, 3.62, mastZ, grid);
  }
  box(0.26, 0.52, 0.23, chalk, mastX, 1.34, mastZ + 0.15, grid, 0.045);
  box(0.18, 0.2, 0.018, dark, mastX, 1.43, mastZ + 0.276, grid, 0.012);
  box(0.105, 0.044, 0.01, cyan, mastX, 1.45, mastZ + 0.288, grid, 0.006);
  for (const x of [-0.17, 0.17])
    for (const z of [-0.17, 0.17])
      cylinder(
        0.024,
        0.024,
        0.035,
        aluminium,
        mastX + x,
        0.127,
        mastZ + z,
        grid,
      );

  box(0.11, 0.34, 0.29, chalk, 1.855, 0.48, 0.1, grid, 0.027);
  box(0.016, 0.19, 0.18, dark, 1.918, 0.51, 0.1, grid, 0.01);

  // One low planter and a few slender leaves replace the toy-like row of round shrubs.
  const planter = material(0x2b373d, 0.8);
  const foliage = material(0x32594e, 0.83);
  foliage.side = THREE.DoubleSide;
  box(0.68, 0.18, 1.75, planter, 2.82, 0.06, -1.72, root, 0.035);
  box(0.59, 0.022, 1.65, dark, 2.82, 0.155, -1.72, root, 0.022);
  for (let n = 0; n < 9; n++) {
    const leaf = new THREE.Shape();
    const height = 0.36 + (n % 3) * 0.09;
    leaf.moveTo(0, 0);
    leaf.quadraticCurveTo(-0.075, height * 0.45, -0.14, height);
    leaf.quadraticCurveTo(0.035, height * 0.55, 0.025, 0);
    const blade = mesh(
      new THREE.ShapeGeometry(leaf, 10),
      foliage,
      2.82 + ((n % 3) - 1) * 0.12,
      0.16,
      -2.16 + Math.floor(n / 3) * 0.43,
    );
    blade.rotation.y = n * 2.1;
    blade.castShadow = false;
  }

  // Activity follows the equipment's real perimeter. No plane fills over the solar cells,
  // no floating rectangles, and no glow at all for missing, stale or inactive readings.
  const activity = new Map<
    FlowRole,
    { surface: THREE.MeshBasicMaterial; intensity: number }[]
  >();
  function contour(
    role: FlowRole,
    color: number,
    curve: THREE.Curve<THREE.Vector3>,
    parent: THREE.Object3D,
    radius = 0.006,
  ) {
    for (const [size, intensity] of [
      [radius * 3.7, 0.11],
      [radius, 0.8],
    ]) {
      const surface = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        // A coloured core stays legible over pale paving; only the soft spill adds light.
        blending:
          size === radius ? THREE.NormalBlending : THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      materials.add(surface);
      const glow = mesh(
        new THREE.TubeGeometry(curve, 96, size, 5, true),
        surface,
        0,
        0,
        0,
        parent,
      );
      glow.castShadow = glow.receiveShadow = false;
      glow.renderOrder = 3;
      activity.set(role, [
        ...(activity.get(role) || []),
        { surface, intensity },
      ]);
    }
  }
  function roundedContour(
    w: number,
    h: number,
    radius: number,
    point: (x: number, y: number) => THREE.Vector3,
  ) {
    const curve = new THREE.CurvePath<THREE.Vector3>();
    const x = w / 2,
      y = h / 2,
      r = radius;
    const line = (a: number[], b: number[]) =>
      curve.add(new THREE.LineCurve3(point(a[0], a[1]), point(b[0], b[1])));
    const corner = (a: number[], b: number[], c: number[]) =>
      curve.add(
        new THREE.QuadraticBezierCurve3(
          point(a[0], a[1]),
          point(b[0], b[1]),
          point(c[0], c[1]),
        ),
      );
    line([-x + r, -y], [x - r, -y]);
    corner([x - r, -y], [x, -y], [x, -y + r]);
    line([x, -y + r], [x, y - r]);
    corner([x, y - r], [x, y], [x - r, y]);
    line([x - r, y], [-x + r, y]);
    corner([-x + r, y], [-x, y], [-x, y - r]);
    line([-x, y - r], [-x, -y + r]);
    corner([-x, -y + r], [-x, -y], [-x + r, -y]);
    return curve;
  }
  for (let row = 0; row < 4; row++)
    for (let column = 0; column < 2; column++) {
      const x = (row - 1.5) * 0.82,
        z = (column - 0.5) * 0.77;
      contour(
        "solar",
        0xffc257,
        roundedContour(0.778, 0.718, 0.018, (u, v) =>
          vector(x + u, 0.029, z + v),
        ),
        solarPanels,
        0.005,
      );
    }
  contour(
    "battery",
    0x52dcaa,
    roundedContour(0.675, 1.16, 0.102, (u, v) =>
      vector(2.214, 0.94 + v, 0.99 + u),
    ),
    battery,
    0.008,
  );
  contour(
    "ev",
    0xb38bff,
    roundedContour(1.34, 3.16, 0.34, (u, v) => vector(u, 0.016, v + 0.025)),
    vehicle.root,
    0.007,
  );
  contour(
    "ev",
    0xb38bff,
    roundedContour(0.23, 0.363, 0.028, (u, v) =>
      vector(-1.91 + u, 1 + v, 2.153),
    ),
    ev,
    0.005,
  );
  const circle = (radius: number, x: number, y: number, z: number) =>
    new THREE.CatmullRomCurve3(
      Array.from({ length: 48 }, (_, i) =>
        vector(
          x + Math.cos((i * Math.PI) / 24) * radius,
          y,
          z + Math.sin((i * Math.PI) / 24) * radius,
        ),
      ),
      true,
    );
  contour("grid", 0x57c8eb, circle(0.38, mastX, 0.135, mastZ), grid, 0.007);
  for (const x of [mastX - 0.47, mastX, mastX + 0.47])
    contour("grid", 0x57c8eb, circle(0.088, x, 3.387, mastZ), grid, 0.0045);

  // The independent physical circuits are authored separately from the architecture.
  const routes = createEnergyRoutes();
  const anchors: Record<FlowRole, THREE.Vector3> = {
    solar: vector(0, 2.414, -0.66),
    home: vector(0.47, 1.18, 1.603),
    ev: vector(-2.97, 0.565, 2.37),
    battery: vector(2.24, 0.98, 0.99),
    grid: vector(mastX, 3.3, mastZ),
  };
  return {
    root,
    components,
    anchors,
    routes,
    setActivity(role: FlowRole, active: boolean, pulse: number) {
      activity.get(role)?.forEach(({ surface, intensity }) => {
        surface.opacity = active
          ? intensity * (0.3 + THREE.MathUtils.clamp(pulse, 0, 1) * 0.7)
          : 0;
      });
    },
    dispose() {
      vehicle.dispose();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((surface) => surface.dispose());
    },
  };
}
