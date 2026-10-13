import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { FlowRole } from "./energyFlowModel";

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
  const wall = material(0xdde2dd, 0.72);
  const stone = material(0xbcc9c6, 0.86);
  const chalk = material(0xe4e8e0, 0.8);
  const charcoal = material(0x26363d, 0.48, 0.3);
  const roofMaterial = material(0x30444c, 0.48, 0.35);
  const seamMaterial = material(0x526b72, 0.4, 0.45);
  const cedar = material(0x9b7754, 0.88);
  const cedarLight = material(0xb49370, 0.85);
  const dark = material(0x13272f, 0.5, 0.15);
  const warm = luminous(0xffd5a0, 0.3);
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

  // The bevelled, two-layer plinth keeps the miniature grounded without a heavy box.
  box(9.8, 0.22, 8.2, chalk, 0, -0.15, 0.4, root, 0.11);
  box(9.55, 0.09, 7.95, stone, 0, -0.28, 0.4, root, 0.045);
  const paving = material(0xcdd4cd, 0.95);
  box(2.42, 0.025, 4.22, paving, -2.88, -0.022, 1.22, root, 0.06);
  // Quiet paving joints, driveway and entrance steps.
  for (const z of [-0.3, 0.65, 1.6, 2.55])
    box(2.38, 0.006, 0.018, stone, -2.88, -0.005, z);
  box(1.22, 0.075, 0.56, stone, -0.87, 0.025, 1.76, root, 0.025);
  box(1.38, 0.045, 0.48, chalk, -0.87, 0.005, 2.12, root, 0.02);

  // Open shell: the large panes have real reveals and a furnished, warm interior.
  const building = new THREE.Group();
  root.add(building);
  box(3.66, 0.15, 3.3, charcoal, 0, 0.08, -0.12, building, 0.035);
  box(3.6, 0.09, 3.22, cedarLight, 0, 0.19, -0.12, building);
  box(0.16, 1.96, 3.2, wall, -1.72, 1.07, -0.1, building);
  box(3.6, 1.96, 0.16, wall, 0, 1.07, -1.62, building);
  // The right-hand wall has a long horizontal window and a service bay.
  box(0.16, 0.66, 3.2, wall, 1.72, 0.51, -0.1, building);
  box(0.16, 0.36, 3.2, wall, 1.72, 1.87, -0.1, building);
  box(0.16, 0.89, 0.88, wall, 1.72, 1.28, 1.06, building);
  box(0.16, 0.89, 0.22, wall, 1.72, 1.28, -1.59, building);
  box(1.19, 1.96, 0.16, wall, -1.125, 1.07, 1.46, building);
  box(0.2, 1.96, 0.16, wall, 1.68, 1.07, 1.46, building);
  box(2.33, 0.16, 0.18, wall, 0.42, 1.98, 1.46, building);

  const gable = new THREE.Shape();
  gable.moveTo(-1.8, 2.02);
  gable.lineTo(0, 3.13);
  gable.lineTo(1.8, 2.02);
  gable.closePath();
  mesh(
    new THREE.ExtrudeGeometry(gable, { depth: 0.14, bevelEnabled: false }),
    wall,
    0,
    0,
    1.39,
    building,
  );
  mesh(
    new THREE.ExtrudeGeometry(gable, { depth: 0.14, bevelEnabled: false }),
    wall,
    0,
    0,
    -1.7,
    building,
  );
  // Fine cedar batten detail at the entrance, with a dark glazed door.
  for (let i = 0; i < 12; i++)
    box(
      0.055,
      1.86,
      0.04,
      i % 3 === 0 ? cedarLight : cedar,
      -1.665 + i * 0.094,
      1.09,
      1.56,
      building,
    );
  box(0.7, 1.7, 0.08, dark, -1.04, 1.03, 1.6, building, 0.018);
  box(
    0.59,
    1.54,
    0.035,
    material(0x33515a, 0.26, 0.3),
    -1.04,
    1.04,
    1.65,
    building,
  );
  box(0.025, 0.42, 0.07, aluminium, -0.81, 1.03, 1.69, building, 0.01);
  box(0.06, 0.2, 0.07, charcoal, -1.61, 1.48, 1.66, building, 0.02);
  box(0.037, 0.13, 0.02, warmWhite, -1.61, 1.48, 1.705, building);

  // Glazing is translucent only here; the interior is modelled, not painted on.
  const glass = material(0x6d99a2, 0.13, 0.25);
  glass.transparent = true;
  glass.opacity = 0.29;
  glass.depthWrite = false;
  const interiorWall = material(0xd4c9b0, 0.85);
  box(2.12, 1.65, 0.06, interiorWall, 0.42, 1.03, -0.63, building);
  box(
    1.8,
    0.012,
    1.05,
    material(0xc2a785, 0.98),
    0.42,
    0.255,
    0.62,
    building,
    0.006,
  );
  // Sofa and coffee table visible through the front curtain wall.
  const upholstery = material(0xb6b7a2, 0.96);
  box(1.29, 0.27, 0.48, upholstery, 0.39, 0.46, -0.18, building, 0.11);
  box(1.29, 0.4, 0.18, upholstery, 0.39, 0.66, -0.42, building, 0.08);
  for (const x of [-0.17, 0.97])
    box(0.15, 0.34, 0.57, upholstery, x, 0.54, -0.15, building, 0.065);
  box(0.63, 0.055, 0.44, cedarLight, 0.42, 0.47, 0.61, building, 0.1);
  cylinder(0.035, 0.07, 0.22, charcoal, 0.42, 0.335, 0.61, building);
  // Two warm pendant lights give depth to the glazing without pretending to show a device state.
  for (const x of [0.03, 0.93]) {
    cylinder(0.012, 0.012, 0.39, charcoal, x, 1.73, 0.75, building);
    cylinder(0.12, 0.15, 0.08, warmWhite, x, 1.505, 0.75, building);
  }
  for (const x of [-0.64, 0.09, 0.84, 1.57])
    box(0.045, 1.74, 0.105, charcoal, x, 1.07, 1.53, building);
  for (const y of [0.22, 1.92])
    box(2.27, 0.045, 0.12, charcoal, 0.47, y, 1.54, building);
  box(2.17, 1.63, 0.016, glass, 0.47, 1.07, 1.555, building).castShadow = false;
  // Subtle reflections read as glass from every supported orbit angle.
  const reflection = material(0xc9e5e3, 0.2, 0.25);
  reflection.transparent = true;
  reflection.opacity = 0.28;
  for (const x of [0.04, 0.79])
    box(0.024, 1.48, 0.008, reflection, x, 1.11, 1.575, building).castShadow =
      false;
  box(0.065, 0.84, 2.07, dark, 1.815, 1.28, -0.46, building);
  box(0.02, 0.73, 1.93, warm, 1.85, 1.28, -0.46, building);
  box(0.024, 0.74, 1.94, glass, 1.865, 1.28, -0.46, building).castShadow =
    false;
  for (const z of [-0.95, -0.25, 0.43])
    box(0.04, 0.79, 0.035, charcoal, 1.884, 1.28, z, building);
  for (let i = 0; i < 8; i++)
    box(0.034, 1.62, 0.067, cedar, 1.822, 1.01, 0.77 + i * 0.085, building);

  // Standing-seam roof, slender metal fascia and a flush solar array on the east slope.
  const pitch = Math.atan2(1.11, 1.8);
  const roofLength = Math.hypot(1.11, 1.8) + 0.19;
  for (const side of [-1, 1]) {
    const roof = new THREE.Group();
    roof.position.set(side * 0.92, 2.6, -0.1);
    roof.rotation.z = -side * pitch;
    building.add(roof);
    box(roofLength, 0.105, 3.7, roofMaterial, 0, 0, 0, roof, 0.018);
    for (let i = 0; i < 10; i++)
      box(
        roofLength - 0.035,
        0.028,
        0.018,
        seamMaterial,
        0,
        0.065,
        -1.69 + i * 0.376,
        roof,
      );
    for (const z of [-1.855, 1.855])
      box(roofLength, 0.13, 0.035, charcoal, 0, -0.025, z, roof);
  }
  box(0.095, 0.065, 3.77, seamMaterial, 0, 3.18, -0.1, building, 0.025);
  // A compact chimney makes the roof silhouette architectural rather than a solid wedge.
  box(0.34, 0.56, 0.4, charcoal, -0.91, 2.91, -1.06, building, 0.025);
  box(0.42, 0.065, 0.48, seamMaterial, -0.91, 3.22, -1.06, building, 0.018);
  const solar = new THREE.Group();
  solar.position.set(0.97, 2.66, -0.1);
  solar.rotation.z = -pitch;
  root.add(solar);
  components.solar = solar;
  const panelBlack = material(0x122b44, 0.2, 0.48);
  const cellBlue = material(0x244e75, 0.23, 0.48);
  const cellAlternate = material(0x315c82, 0.21, 0.55);
  const cellGeometry = own(new THREE.BoxGeometry(0.142, 0.009, 0.144));
  const cellMatrices: THREE.Matrix4[] = [];
  const alternateMatrices: THREE.Matrix4[] = [];
  for (let row = 0; row < 2; row++) {
    for (let column = 0; column < 4; column++) {
      const x = (row - 0.5) * 0.82,
        z = (column - 1.5) * 0.77;
      box(0.775, 0.048, 0.715, aluminium, x, 0, z, solar, 0.012);
      box(0.733, 0.025, 0.672, panelBlack, x, 0.035, z, solar, 0.006);
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
    solar.add(cells);
  }

  // Carport: thin cantilevered roof, cedar ceiling, recessed light and a rear screen.
  const carport = new THREE.Group();
  root.add(carport);
  box(2.34, 0.115, 3.18, charcoal, -2.89, 1.77, -0.05, carport, 0.035);
  box(2.18, 0.035, 3.01, cedarLight, -2.89, 1.698, -0.05, carport);
  box(0.055, 0.018, 2.6, warmWhite, -3.72, 1.67, -0.04, carport);
  for (const x of [-3.97, -1.8])
    for (const z of [-1.42, 1.35])
      box(0.075, 1.68, 0.075, charcoal, x, 0.84, z, carport, 0.01);
  for (let i = 0; i < 14; i++)
    box(0.07, 1.36, 0.07, cedar, -3.89 + i * 0.155, 0.8, -1.46, carport);

  // A sculpted, softly bevelled electric crossover. No device state is inferred by the model.
  const ev = new THREE.Group();
  root.add(ev);
  components.ev = ev;
  const car = new THREE.Group();
  car.position.set(-2.84, 0, 1.18);
  ev.add(car);
  const pearl = material(0xd1dce0, 0.26, 0.5);
  const rubber = material(0x17232c, 0.97);
  const autoGlass = material(0x1e3b4b, 0.16, 0.52);
  const bodyProfile = new THREE.Shape();
  bodyProfile.moveTo(-1.22, 0.3);
  bodyProfile.quadraticCurveTo(-1.25, 0.46, -1.05, 0.53);
  bodyProfile.lineTo(-0.7, 0.56);
  bodyProfile.quadraticCurveTo(0.1, 0.59, 0.67, 0.52);
  bodyProfile.quadraticCurveTo(1.2, 0.5, 1.24, 0.36);
  bodyProfile.lineTo(1.14, 0.27);
  bodyProfile.lineTo(-1.12, 0.27);
  bodyProfile.closePath();
  const body = mesh(
    new THREE.ExtrudeGeometry(bodyProfile, {
      depth: 1.02,
      bevelEnabled: true,
      bevelSegments: 4,
      bevelSize: 0.045,
      bevelThickness: 0.065,
      curveSegments: 16,
    }),
    pearl,
    0.51,
    0,
    0,
    car,
  );
  body.rotation.y = -Math.PI / 2;
  box(1.08, 0.08, 2.26, charcoal, 0, 0.265, 0, car, 0.035);
  // Side profile extruded across the width creates sloped windscreen and rear window.
  const cabinProfile = new THREE.Shape();
  cabinProfile.moveTo(-0.96, 0.51);
  cabinProfile.quadraticCurveTo(-0.65, 0.73, -0.47, 0.85);
  cabinProfile.quadraticCurveTo(-0.03, 0.98, 0.25, 0.84);
  cabinProfile.lineTo(0.69, 0.52);
  cabinProfile.closePath();
  const cabin = mesh(
    new THREE.ExtrudeGeometry(cabinProfile, {
      depth: 0.92,
      bevelEnabled: true,
      bevelSegments: 3,
      bevelSize: 0.035,
      bevelThickness: 0.045,
      steps: 1,
      curveSegments: 10,
    }),
    autoGlass,
    -0.46,
    0,
    0,
    car,
  );
  cabin.rotation.y = -Math.PI / 2;
  // After rotating the side profile its local X becomes front-to-back.
  cabin.position.x = 0.46;
  box(0.88, 0.018, 0.31, autoGlass, 0, 0.92, -0.13, car, 0.008);
  for (const x of [-0.5, 0.5]) {
    box(0.025, 0.32, 0.035, charcoal, x, 0.689, -0.08, car);
    box(0.17, 0.075, 0.16, pearl, x * 1.17, 0.61, 0.41, car, 0.035);
    box(0.017, 0.022, 0.12, charcoal, x * 1.15, 0.5, -0.2, car, 0.008);
  }
  const wheels = own(new THREE.CylinderGeometry(0.23, 0.23, 0.16, 24));
  const rims = own(new THREE.CylinderGeometry(0.153, 0.153, 0.17, 20));
  for (const x of [-0.535, 0.535])
    for (const z of [-0.8, 0.8]) {
      mesh(wheels, rubber, x, 0.27, z, car).rotation.z = Math.PI / 2;
      mesh(rims, aluminium, x, 0.27, z, car).rotation.z = Math.PI / 2;
      cylinder(0.062, 0.062, 0.177, charcoal, x, 0.27, z, car).rotation.z =
        Math.PI / 2;
    }
  for (const side of [-1, 1]) {
    const headlight = box(
      0.27,
      0.032,
      0.05,
      warmWhite,
      side * 0.39,
      0.445,
      1.184,
      car,
      0.012,
    );
    headlight.rotation.y = side * -0.22;
  }
  box(0.67, 0.055, 0.024, charcoal, 0, 0.31, 1.242, car, 0.014);
  box(0.18, 0.055, 0.017, chalk, 0, 0.335, 1.263, car, 0.008);
  box(0.9, 0.027, 0.02, material(0xbc6879, 0.3), 0, 0.465, -1.237, car, 0.008);
  // Charger is deliberately cable-free; energy is represented by the scene's light paths.
  box(0.37, 0.07, 0.4, stone, -1.91, 0.045, 2.0, ev, 0.04);
  box(0.25, 0.86, 0.22, charcoal, -1.91, 0.49, 2.0, ev, 0.045);
  box(0.29, 0.49, 0.24, pearl, -1.91, 0.99, 2.0, ev, 0.08);
  box(0.225, 0.36, 0.022, dark, -1.91, 1.0, 2.135, ev, 0.028);
  box(0.13, 0.018, 0.018, lilac, -1.91, 1.11, 2.156, ev, 0.008);
  cylinder(0.048, 0.048, 0.012, aluminium, -1.91, 0.91, 2.152, ev).rotation.x =
    Math.PI / 2;

  // Wall battery: white porcelain shell, inset graphite face and understated status light.
  const battery = new THREE.Group();
  root.add(battery);
  components.battery = battery;
  box(0.08, 1.21, 0.71, charcoal, 1.875, 0.94, 0.99, battery, 0.025);
  box(0.35, 1.18, 0.69, chalk, 2.035, 0.94, 0.99, battery, 0.105);
  box(0.018, 0.92, 0.47, dark, 2.218, 0.97, 0.99, battery, 0.009);
  box(0.025, 0.025, 0.24, mint, 2.233, 1.31, 0.99, battery, 0.01);
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

  // Landscaping stays low around the measurement paths and more sculptural at the rear.
  const foliage = [
    material(0x557967, 0.95),
    material(0x739783, 0.96),
    material(0x8faa92, 0.97),
  ];
  const soil = material(0x7f8d7f, 1);
  const planter = material(0xa8b7aa, 0.88);
  box(0.88, 0.22, 2.62, planter, 2.8, 0.1, -1.57, root, 0.1);
  box(0.76, 0.026, 2.43, soil, 2.8, 0.22, -1.57, root, 0.08);
  for (let i = 0; i < 5; i++) {
    const shrub = mesh(
      new THREE.SphereGeometry(0.3, 12, 8),
      foliage[i % 3],
      2.8,
      0.45,
      -2.49 + i * 0.45,
    );
    shrub.scale.set(1, 0.74 + (i % 2) * 0.16, 0.85);
  }
  cylinder(0.42, 0.34, 0.32, planter, -3.33, 0.16, -2.34);
  cylinder(0.37, 0.37, 0.025, soil, -3.33, 0.323, -2.34);
  cylinder(0.045, 0.06, 0.6, cedar, -3.33, 0.65, -2.34);
  for (const [x, y, z, size] of [
    [-3.33, 1.18, -2.34, 0.51],
    [-3.59, 0.99, -2.29, 0.35],
    [-3.08, 1.0, -2.44, 0.36],
  ])
    mesh(new THREE.SphereGeometry(size, 14, 10), foliage[1], x, y, z);

  // Broad translucent coronas surround equipment only while its live flow is active.
  const activity = new Map<FlowRole, THREE.ShaderMaterial[]>();
  function corona(
    role: FlowRole,
    color: number,
    w: number,
    h: number,
    position: THREE.Vector3,
    rotation: THREE.Euler,
    parent: THREE.Object3D,
    ellipse = false,
  ) {
    const surface = new THREE.ShaderMaterial({
      uniforms: {
        tint: { value: new THREE.Color(color) },
        opacity: { value: 0 },
        ellipse: { value: ellipse ? 1 : 0 },
      },
      vertexShader: `varying vec2 vUv; void main() { vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `varying vec2 vUv; uniform vec3 tint; uniform float opacity, ellipse;
        void main() { vec2 q=abs(vUv-.5)*2.; float d=mix(max(q.x,q.y),length(q),ellipse);
          float band=exp(-pow((d-.77)*9.,2.));
          gl_FragColor=vec4(mix(tint,vec3(1.),band*.45),band*opacity);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    materials.add(surface);
    const glow = mesh(
      new THREE.PlaneGeometry(w, h),
      surface,
      position.x,
      position.y,
      position.z,
      parent,
    );
    glow.rotation.copy(rotation);
    glow.castShadow = false;
    glow.receiveShadow = false;
    glow.renderOrder = 3;
    activity.set(role, [...(activity.get(role) || []), surface]);
  }
  corona(
    "solar",
    0xffbc42,
    2.05,
    3.6,
    vector(0, 0.1, 0),
    new THREE.Euler(-Math.PI / 2, 0, 0),
    solar,
  );
  corona(
    "ev",
    0xb18aff,
    1.92,
    3.25,
    vector(-2.84, 0.035, 1.18),
    new THREE.Euler(-Math.PI / 2, 0, 0),
    ev,
    true,
  );
  corona(
    "battery",
    0x4ce3ad,
    1.01,
    1.6,
    vector(2.265, 0.94, 0.99),
    new THREE.Euler(0, Math.PI / 2, 0),
    battery,
  );
  corona(
    "grid",
    0x5bcaff,
    1.3,
    1.3,
    vector(mastX, 0.135, mastZ),
    new THREE.Euler(-Math.PI / 2, 0, 0),
    grid,
    true,
  );
  corona(
    "grid",
    0x5bcaff,
    1.5,
    0.65,
    vector(mastX, 3.35, mastZ + 0.1),
    new THREE.Euler(0, 0, 0),
    grid,
  );

  // Curves run from each physical component to the same front-of-house distribution point.
  // Their elevation keeps light ribbons above paving, not embedded in the plinth.
  const hub = vector(0.08, 0.075, 2.97);
  const routes: Record<FlowRole, THREE.Vector3[]> = {
    solar: [
      vector(1.88, 2.07, -0.18),
      vector(2.03, 1.85, -0.18),
      vector(2.03, 0.24, -0.18),
      vector(2.36, 0.075, 0.0),
      vector(2.36, 0.075, 2.52),
      vector(1.92, 0.075, 2.97),
      hub.clone(),
    ],
    battery: [
      vector(2.22, 0.38, 1.03),
      vector(2.51, 0.075, 1.36),
      vector(2.51, 0.075, 2.61),
      vector(2.15, 0.075, 3.12),
      vector(0.48, 0.075, 3.12),
      hub.clone(),
    ],
    grid: [
      vector(mastX, 2.88, mastZ + 0.08),
      vector(mastX, 0.23, mastZ + 0.18),
      vector(3.74, 0.075, 1.8),
      vector(3.74, 0.075, 3.36),
      vector(3.36, 0.075, 3.66),
      vector(0.52, 0.075, 3.66),
      hub.clone(),
    ],
    ev: [
      vector(-1.91, 0.16, 2.15),
      vector(-1.91, 0.075, 2.64),
      vector(-1.59, 0.075, 2.97),
      hub.clone(),
    ],
    home: [
      vector(0.08, 0.34, 1.48),
      vector(0.08, 0.075, 1.91),
      vector(0.08, 0.075, 2.49),
      hub.clone(),
    ],
  };
  const anchors: Record<FlowRole, THREE.Vector3> = {
    solar: vector(0.92, 3.1, -0.43),
    home: vector(0.25, 1.65, 1.75),
    ev: vector(-2.7, 1.02, 2.55),
    battery: vector(2.42, 1.51, 1.15),
    grid: vector(3.9, 3.7, 1.35),
  };
  return {
    root,
    components,
    anchors,
    routes,
    setActivity(role: FlowRole, active: boolean, pulse: number) {
      activity.get(role)?.forEach((surface) => {
        surface.uniforms.opacity.value = active ? 0.26 + pulse * 0.48 : 0;
      });
    },
    dispose() {
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((surface) => surface.dispose());
    },
  };
}
