import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { FlowRole } from "./energyFlowModel";
import { createEnergyVehicle } from "./energyVehicleModel";
import { createEnergyRoutes } from "./energyFlowPaths";
import { createEnergyLandscape } from "./energyLandscapeModel";
import { mergeEnergyArchitecture } from "./mergeEnergyArchitecture";

/** A small architectural model, in metres. The front of the home faces +Z. */
export function createEnergyHouse() {
  const root = new THREE.Group();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const instancedMeshes = new Set<THREE.InstancedMesh>();
  const lights = new Set<THREE.PointLight>();
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

  const landscape = createEnergyLandscape();
  root.add(landscape.root);

  // A restrained graphite pavilion with an asymmetrical pitched roof and uninterrupted glazing.
  const building = new THREE.Group();
  root.add(building);
  box(3.67, 0.15, 3.38, charcoal, 0, 0.075, -0.05, building, 0.023);
  // The always-warm interior belongs to the architectural illustration, not a live lighting state.
  const interiorFloor = material(0xa47a47, 0.85);
  interiorFloor.emissive.setHex(0x9d511b);
  interiorFloor.emissiveIntensity = 0.2;
  const interiorPlaster = material(0xe2b57b, 0.9);
  interiorPlaster.emissive.setHex(0xd68d39);
  interiorPlaster.emissiveIntensity = 0.3;
  box(3.5, 0.08, 3.15, interiorFloor, 0, 0.185, -0.05, building);
  box(3.58, 2.38, 0.15, wall, 0, 1.345, -1.62, building, 0.012);
  box(0.16, 2.38, 2.16, wall, -1.71, 1.345, -0.62, building, 0.012);
  box(0.16, 0.89, 2.16, wall, 1.71, 0.61, -0.62, building);
  box(0.16, 0.49, 2.16, wall, 1.71, 2.29, -0.62, building);
  // A narrow full-height wall provides a real service bay for the battery.
  box(0.16, 2.34, 0.78, wall, 1.71, 1.33, 1.0, building, 0.013);
  box(0.16, 2.36, 0.11, wall, 1.71, 1.34, -1.67, building);
  box(0.13, 2.36, 0.13, charcoal, 1.715, 1.34, 0.43, building);
  // A taller charcoal gable, with finely spaced folded-metal standing seams.
  const ridgeX = -0.2,
    ridgeY = 3.6,
    eaveY = 2.535;
  const rightPitch = Math.atan2(ridgeY - eaveY, 1.96 - ridgeX);
  for (const side of [-1, 1]) {
    const eaveX = side * 1.96;
    const run = Math.abs(eaveX - ridgeX);
    const roofLength = Math.hypot(run, ridgeY - eaveY);
    const slope = new THREE.Group();
    slope.position.set((eaveX + ridgeX) / 2, (ridgeY + eaveY) / 2, -0.04);
    slope.rotation.z = side < 0 ? Math.atan2(ridgeY - eaveY, run) : -rightPitch;
    building.add(slope);
    box(roofLength, 0.1, 3.73, roofMaterial, 0, 0, 0, slope, 0.018);
    box(
      roofLength - 0.05,
      0.017,
      3.69,
      seamMaterial,
      0,
      -0.059,
      0,
      slope,
      0.007,
    );
    for (const z of [-1.865, 1.865])
      box(roofLength, 0.13, 0.033, charcoal, 0, -0.009, z, slope, 0.006);
    const foldMaterial = material(0x43515a, 0.41, 0.47);
    for (let line = 0; line < 16; line++)
      box(
        roofLength - 0.025,
        0.027,
        0.016,
        foldMaterial,
        0,
        0.062,
        -1.76 + line * 0.234,
        slope,
      );
  }
  box(
    0.075,
    0.064,
    3.78,
    roofMaterial,
    ridgeX,
    ridgeY + 0.04,
    -0.04,
    building,
    0.02,
  );
  const gable = new THREE.Shape();
  gable.moveTo(-1.8, 2.46);
  gable.lineTo(-1.8, 2.573);
  gable.lineTo(ridgeX, 3.54);
  gable.lineTo(1.8, 2.555);
  gable.lineTo(1.8, 2.46);
  gable.closePath();
  const gableGeometry = new THREE.ExtrudeGeometry(gable, {
    depth: 0.12,
    bevelEnabled: false,
  });
  for (const z of [-1.7, 1.48]) mesh(gableGeometry, wall, 0, 0, z, building);
  box(3.58, 0.14, 0.13, wall, 0, 2.465, 1.49, building);
  box(0.16, 2.37, 1.08, wall, -1.71, 1.345, 1.02, building);
  box(0.16, 0.14, 3.32, wall, 1.71, 2.465, -0.04, building);
  // Recessed entry is one calm dark plane, with a single warm light slit.
  box(1.09, 2.34, 0.13, wall, -1.225, 1.33, 1.49, building, 0.015);
  box(0.745, 2.15, 0.035, dark, -1.18, 1.325, 1.575, building, 0.014);
  box(0.021, 0.37, 0.042, seamMaterial, -0.896, 1.07, 1.608, building, 0.007);
  box(0.013, 1.67, 0.012, warmWhite, -1.644, 1.35, 1.568, building, 0.005);

  const glass = material(0x8b9b99, 0.1, 0.13);
  glass.transparent = true;
  glass.opacity = 0.17;
  glass.envMapIntensity = 0.2;
  glass.depthWrite = false;
  // Soft plaster catches real bounded light, leaving the floor circuit visible through the glass.
  box(2.36, 2.14, 0.055, interiorPlaster, 0.42, 1.31, -0.69, building);
  box(0.045, 1.22, 1.88, interiorPlaster, 1.36, 1.59, -0.64, building);
  box(2.38, 0.034, 2.23, interiorPlaster, 0.45, 2.385, 0.405, building);
  box(0.018, 0.017, 1.71, warmWhite, 1.394, 2.02, -0.64, building);
  const livingLight = new THREE.PointLight(0xffb45e, 6.7, 2.85, 2);
  livingLight.position.set(0.43, 2.18, 0.31);
  building.add(livingLight);
  lights.add(livingLight);
  const sideLight = new THREE.PointLight(0xffb867, 1.45, 1.8, 2);
  sideLight.position.set(1.61, 1.89, -0.65);
  building.add(sideLight);
  lights.add(sideLight);
  for (const x of [0.1, 0.95])
    cylinder(0.057, 0.073, 0.025, warmWhite, x, 2.355, 0.71, building);
  box(2.12, 0.018, 0.02, warmWhite, 0.42, 2.275, -0.655, building, 0.005);
  const frontGlass = mesh(
    new THREE.PlaneGeometry(2.39, 2.13),
    glass,
    0.47,
    1.325,
    1.603,
    building,
  );
  frontGlass.castShadow = false;
  glass.side = THREE.DoubleSide;
  for (const x of [-0.74, 0.45, 1.68])
    box(0.04, 2.19, 0.09, charcoal, x, 1.324, 1.598, building);
  for (const y of [0.239, 2.409])
    box(2.45, 0.027, 0.078, charcoal, 0.47, y, 1.598, building);
  const sideGlass = mesh(
    new THREE.PlaneGeometry(1.85, 0.94),
    glass,
    1.801,
    1.541,
    -0.635,
    building,
  );
  sideGlass.rotation.y = Math.PI / 2;
  sideGlass.castShadow = false;
  for (const z of [-1.57, -0.645, 0.28])
    box(0.055, 0.98, 0.024, charcoal, 1.8, 1.541, z, building);
  for (const y of [1.065, 2.017])
    box(0.055, 0.026, 1.91, charcoal, 1.8, y, -0.645, building);

  // Fine vertical boards give the charcoal shell real relief without a noisy image texture.
  const cladding = material(0x29353c, 0.7, 0.08);
  const claddingShade = material(0x354047, 0.74, 0.07);
  const boards: {
    x: number;
    y: number;
    z: number;
    w: number;
    h: number;
    d: number;
  }[] = [];
  for (let i = 0; i < 16; i++)
    boards.push({
      x: -1.756 + i * 0.064,
      y: 1.341,
      z: 1.621,
      w: 0.049,
      h: 2.333,
      d: 0.026,
    });
  for (let i = 0; i < 55; i++) {
    const x = -1.755 + i * 0.065;
    const roofY =
      ridgeY -
      (Math.abs(x - ridgeX) * (ridgeY - eaveY)) /
        Math.abs((x < ridgeX ? -1.96 : 1.96) - ridgeX) -
      0.075;
    const height = Math.max(0, roofY - 2.413);
    boards.push({
      x,
      y: 2.413 + height / 2,
      z: 1.618,
      w: 0.05,
      h: height,
      d: 0.026,
    });
  }
  for (let i = 0; i < 13; i++)
    boards.push({
      x: 1.81,
      y: 1.332,
      z: 0.626 + i * 0.061,
      w: 0.026,
      h: 2.32,
      d: 0.046,
    });
  for (let i = 0; i < 28; i++) {
    const z = -1.65 + i * 0.073;
    boards.push({ x: 1.81, y: 0.61, z, w: 0.026, h: 0.89, d: 0.054 });
    boards.push({ x: 1.81, y: 2.29, z, w: 0.026, h: 0.47, d: 0.054 });
  }
  const boardGeometry = own(new THREE.BoxGeometry(1, 1, 1));
  for (const [surface, variant] of [
    [cladding, 0],
    [claddingShade, 1],
  ] as const) {
    const selected = boards.filter((_, i) => (i % 5 === 0 ? 1 : 0) === variant);
    const instances = new THREE.InstancedMesh(
      boardGeometry,
      surface,
      selected.length,
    );
    selected.forEach(({ x, y, z, w, h, d }, i) =>
      instances.setMatrixAt(
        i,
        new THREE.Matrix4().compose(
          vector(x, y, z),
          new THREE.Quaternion(),
          vector(w, h, d),
        ),
      ),
    );
    instancedMeshes.add(instances);
    instances.castShadow = instances.receiveShadow = true;
    building.add(instances);
  }
  box(0.021, 0.37, 0.046, aluminium, -0.896, 1.32, 1.654, building, 0.007);

  // A furnished golden lounge: proportions remain legible through the full-height glass.
  const linen = material(0xad8757, 0.94);
  const cushion = material(0xe1b881, 0.95);
  const accentFabric = material(0x80603a, 0.97);
  const oak = material(0x88603d, 0.78);
  const oakLight = material(0x9a7049, 0.77);
  const upholsteryGlow = [linen, cushion, accentFabric];
  upholsteryGlow.forEach((surface) => {
    surface.emissive.setHex(0xc48136);
    surface.emissiveIntensity = 0.19;
  });
  // Individual floorboards catch the light rather than reading as a flat beige square.
  const floorBoards = new THREE.InstancedMesh(
    own(new THREE.BoxGeometry(0.177, 0.014, 2.16)),
    oakLight,
    13,
  );
  for (let i = 0; i < 13; i++)
    floorBoards.setMatrixAt(
      i,
      new THREE.Matrix4().makeTranslation(-0.668 + i * 0.183, 0.234, 0.48),
    );
  instancedMeshes.add(floorBoards);
  floorBoards.receiveShadow = true;
  building.add(floorBoards);
  const rug = material(0x9d8b70, 0.99);
  box(1.87, 0.013, 1.36, rug, 0.39, 0.249, 0.25, building, 0.045);
  box(1.58, 0.25, 0.69, linen, 0.29, 0.477, -0.15, building, 0.07);
  box(1.57, 0.6, 0.18, linen, 0.29, 0.718, -0.442, building, 0.057);
  for (const x of [-0.406, 0.986])
    box(0.17, 0.44, 0.73, linen, x, 0.576, -0.15, building, 0.058);
  for (const x of [-0.04, 0.622]) {
    box(0.625, 0.145, 0.52, cushion, x, 0.666, -0.083, building, 0.054);
    const backCushion = box(
      0.616,
      0.36,
      0.15,
      cushion,
      x,
      0.851,
      -0.303,
      building,
      0.047,
    );
    backCushion.rotation.x = -0.1;
  }
  for (const [x, tilt] of [
    [-0.211, -0.12],
    [0.788, 0.15],
  ]) {
    const pillow = box(
      0.27,
      0.276,
      0.113,
      accentFabric,
      x,
      0.809,
      -0.024,
      building,
      0.045,
    );
    pillow.rotation.z = tilt;
  }
  for (const x of [-0.337, 0.917])
    for (const z of [-0.4, 0.11])
      cylinder(0.018, 0.025, 0.16, charcoal, x, 0.321, z, building);
  // Low oak coffee table and a single reading chair leave the animated interior circuit clear.
  box(0.66, 0.048, 0.43, oakLight, 0.255, 0.617, 0.713, building, 0.055);
  for (const x of [0.006, 0.504])
    for (const z of [0.57, 0.855])
      box(0.024, 0.35, 0.024, oak, x, 0.424, z, building, 0.007);
  box(0.22, 0.014, 0.14, cushion, 0.12, 0.654, 0.736, building, 0.005);
  cylinder(0.055, 0.051, 0.041, charcoal, 0.393, 0.662, 0.711, building);
  box(0.46, 0.22, 0.51, linen, 1.174, 0.477, 0.61, building, 0.068);
  box(0.46, 0.48, 0.14, linen, 1.174, 0.677, 0.385, building, 0.057);
  for (const x of [0.975, 1.373])
    box(0.085, 0.34, 0.53, linen, x, 0.555, 0.612, building, 0.035);
  for (const x of [1.012, 1.336])
    for (const z of [0.41, 0.81])
      cylinder(0.017, 0.021, 0.15, oak, x, 0.317, z, building);

  const pot = material(0x727367, 0.84);
  const leafSurface = material(0x456343, 0.89);
  leafSurface.side = THREE.DoubleSide;
  cylinder(0.11, 0.08, 0.255, pot, -0.615, 0.38, -0.19, building);
  cylinder(0.098, 0.098, 0.014, dark, -0.615, 0.511, -0.19, building);
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0);
  leafShape.bezierCurveTo(-0.105, 0.07, -0.085, 0.235, 0, 0.32);
  leafShape.bezierCurveTo(0.085, 0.235, 0.105, 0.07, 0, 0);
  const leafGeometry = own(new THREE.ShapeGeometry(leafShape, 9));
  for (let n = 0; n < 11; n++) {
    const angle = n * 2.39;
    const height = 0.74 + (n % 4) * 0.13;
    const end = vector(
      -0.615 + Math.cos(angle) * 0.095,
      height,
      -0.19 + Math.sin(angle) * 0.095,
    );
    const stem = new THREE.CatmullRomCurve3([
      vector(-0.615, 0.49, -0.19),
      vector(-0.615, height - 0.19, -0.19),
      end,
    ]);
    mesh(
      new THREE.TubeGeometry(stem, 8, 0.006, 4, false),
      leafSurface,
      0,
      0,
      0,
      building,
    );
    const leaf = mesh(leafGeometry, leafSurface, end.x, end.y, end.z, building);
    leaf.rotation.set(0.17 + (n % 3) * 0.11, angle, Math.cos(angle) * 0.45);
  }
  // Pale linen curtains add depth to the reveal without covering the measurements inside.
  for (let i = 0; i < 6; i++)
    box(
      0.024,
      2.02,
      0.05,
      cushion,
      -0.7 + i * 0.027,
      1.37,
      1.464 + (i % 2) * 0.015,
      building,
      0.009,
    );

  // The right-rear annex adds the reference's stepped architectural silhouette.
  const annex = new THREE.Group();
  building.add(annex);
  box(1.5, 0.16, 1.09, charcoal, 2.55, 0.115, -1.31, annex, 0.021);
  box(1.5, 1.75, 0.12, wall, 2.55, 1.065, -1.82, annex, 0.012);
  box(0.12, 1.75, 1.09, wall, 3.24, 1.065, -1.31, annex, 0.012);
  box(0.12, 1.75, 1.09, wall, 1.86, 1.065, -1.31, annex, 0.012);
  box(0.41, 1.75, 0.11, wall, 2.005, 1.065, -0.785, annex);
  box(0.335, 1.75, 0.11, wall, 3.132, 1.065, -0.785, annex);
  box(1.5, 0.18, 0.11, wall, 2.55, 1.85, -0.785, annex);
  box(1.72, 0.105, 1.32, roofMaterial, 2.55, 1.99, -1.31, annex, 0.02);
  box(1.68, 0.018, 1.27, seamMaterial, 2.55, 1.927, -1.31, annex, 0.007);
  for (let i = 0; i < 7; i++)
    box(1.69, 0.018, 0.012, charcoal, 2.55, 2.05, -1.86 + i * 0.185, annex);
  const annexWarm = luminous(0xc98e52, 0.26);
  box(0.82, 1.48, 0.055, annexWarm, 2.6, 1.09, -1.28, annex);
  const annexGlass = mesh(
    new THREE.PlaneGeometry(0.76, 1.53),
    glass,
    2.592,
    1.075,
    -0.724,
    annex,
  );
  annexGlass.castShadow = false;
  for (const x of [2.199, 2.985])
    box(0.035, 1.58, 0.075, charcoal, x, 1.075, -0.733, annex);
  box(0.78, 0.035, 0.075, charcoal, 2.59, 0.3, -0.733, annex);
  box(0.018, 0.21, 0.04, aluminium, 2.898, 1.028, -0.687, annex, 0.007);
  for (let i = 0; i < 14; i++)
    box(0.024, 1.71, 0.051, cladding, 3.309, 1.065, -1.803 + i * 0.075, annex);

  // Warm wall sconces illuminate bounded areas; they are architectural accents, not device indicators.
  const wash = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv; void main(){float spread=.07+(1.-vUv.y)*.47;float side=exp(-pow((vUv.x-.5)/spread,2.)*3.5);float fade=smoothstep(0.,.2,vUv.y)*pow(vUv.y,.55);gl_FragColor=vec4(1.,.66,.32,side*fade*.19);
      #include <colorspace_fragment>
      }`,
  });
  materials.add(wash);
  function sconce(
    x: number,
    y: number,
    z: number,
    side: boolean,
    light: boolean,
  ) {
    const assembly = new THREE.Group();
    assembly.position.set(x, y, z);
    if (side) assembly.rotation.y = Math.PI / 2;
    building.add(assembly);
    box(0.083, 0.235, 0.063, charcoal, 0, 0, 0, assembly, 0.014);
    box(0.027, 0.171, 0.01, warmWhite, 0, 0, 0.037, assembly, 0.006);
    const pool = mesh(
      new THREE.PlaneGeometry(0.69, 1.32),
      wash,
      0,
      -0.71,
      -0.012,
      assembly,
    );
    pool.castShadow = pool.receiveShadow = false;
    if (light) {
      const glow = new THREE.PointLight(0xffbb75, 0.45, 0.88, 2);
      glow.position.set(0, -0.05, 0.12);
      assembly.add(glow);
      lights.add(glow);
    }
  }
  sconce(-0.802, 1.983, 1.684, false, true);
  sconce(1.854, 1.997, 0.686, true, true);
  sconce(3.117, 1.555, -0.706, false, false);

  // Feathered light spill and contact shade ground the furniture without extra shadow maps.
  function groundPatch(
    color: number,
    opacity: number,
    width: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    additive: boolean,
  ) {
    const surface = new THREE.ShaderMaterial({
      uniforms: {
        tint: { value: new THREE.Color(color) },
        opacity: { value: opacity },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 vUv; uniform vec3 tint; uniform float opacity;
        void main(){vec2 p=(vUv-.5)*2.;float radius=length(p);float feather=exp(-dot(p,p)*1.45)*(1.-smoothstep(.73,1.,radius));gl_FragColor=vec4(tint,opacity*feather);
          #include <colorspace_fragment>
        }`,
    });
    materials.add(surface);
    const patch = mesh(
      new THREE.PlaneGeometry(width, depth),
      surface,
      x,
      y,
      z,
      building,
    );
    patch.rotation.x = -Math.PI / 2;
    patch.castShadow = patch.receiveShadow = false;
  }
  groundPatch(0xeab062, 0.2, 2.66, 1.12, 0.43, 0.034, 2.09, true);
  groundPatch(0xf5bd71, 0.11, 2.15, 1.59, 0.42, 0.263, 0.52, true);
  groundPatch(0x17120d, 0.24, 1.75, 0.89, 0.29, 0.266, -0.09, false);
  groundPatch(0x17120d, 0.19, 0.82, 0.61, 0.255, 0.267, 0.713, false);
  mergeEnergyArchitecture(building, own);

  // The modules and their activity contours share the exact sloping roof transform.
  const solar = new THREE.Group();
  root.add(solar);
  components.solar = solar;
  const solarPanels = new THREE.Group();
  solarPanels.position.set(0.922, 3.151, -0.04);
  solarPanels.rotation.z = -rightPitch;
  solar.add(solarPanels);
  for (const z of [-1.12, 0, 1.12])
    box(1.55, 0.028, 0.045, dark, 0, -0.035, z, solarPanels);
  box(0.09, 0.43, 0.36, chalk, 1.85, 0.79, -0.66, solar, 0.035);
  box(0.016, 0.34, 0.277, dark, 1.902, 0.79, -0.66, solar, 0.015);
  box(0.019, 0.016, 0.113, aluminium, 1.912, 0.915, -0.66, solar, 0.004);
  const panelBlack = material(0x122b44, 0.2, 0.48);
  const cellBlue = material(0x174882, 0.22, 0.45);
  const cellAlternate = material(0x235794, 0.2, 0.49);
  const cellGeometry = own(new THREE.BoxGeometry(0.087, 0.009, 0.08));
  box(1.644, 0.025, 3.05, aluminium, 0, -0.026, 0, solarPanels, 0.01);
  const cellMatrices: THREE.Matrix4[] = [];
  const alternateMatrices: THREE.Matrix4[] = [];
  for (let row = 0; row < 2; row++) {
    for (let column = 0; column < 4; column++) {
      const x = (row - 0.5) * 0.806,
        z = (column - 1.5) * 0.754;
      box(0.798, 0.048, 0.748, aluminium, x, 0, z, solarPanels, 0.012);
      box(0.78, 0.025, 0.73, panelBlack, x, 0.035, z, solarPanels, 0.006);
      for (let u = 0; u < 8; u++)
        for (let v = 0; v < 8; v++) {
          const matrix = new THREE.Matrix4().makeTranslation(
            x + (u - 3.5) * 0.094,
            0.053,
            z + (v - 3.5) * 0.087,
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
    instancedMeshes.add(cells);
    cells.receiveShadow = true;
    solarPanels.add(cells);
  }

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
  for (let row = 0; row < 2; row++)
    for (let column = 0; column < 4; column++) {
      const x = (row - 0.5) * 0.806,
        z = (column - 1.5) * 0.754;
      contour(
        "solar",
        0xffc257,
        roundedContour(0.801, 0.751, 0.014, (u, v) =>
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
    solar: vector(0.948, 3.204, -0.04),
    home: vector(0.47, 1.58, 1.603),
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
      instancedMeshes.forEach((instances) => instances.dispose());
      lights.forEach((light) => light.dispose());
      vehicle.dispose();
      landscape.dispose();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((surface) => surface.dispose());
    },
  };
}
