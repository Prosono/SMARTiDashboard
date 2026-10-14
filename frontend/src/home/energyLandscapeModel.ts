import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/** The architectural site is decorative; its warm garden lights are not live device states. */
export function createEnergyLandscape() {
  const root = new THREE.Group();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const lights: THREE.Light[] = [];
  let seed = 68472;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const between = (min: number, max: number) => min + random() * (max - min);
  const own = <T extends THREE.BufferGeometry>(geometry: T) => {
    geometries.add(geometry);
    return geometry;
  };
  const material = (color: number, roughness = 0.9, metalness = 0) => {
    const surface = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
    });
    materials.add(surface);
    return surface;
  };
  const mesh = (
    geometry: THREE.BufferGeometry,
    surface: THREE.Material,
    x: number,
    y: number,
    z: number,
  ) => {
    const item = new THREE.Mesh(own(geometry), surface);
    item.position.set(x, y, z);
    item.castShadow = item.receiveShadow = true;
    root.add(item);
    return item;
  };
  const box = (
    width: number,
    height: number,
    depth: number,
    surface: THREE.Material,
    x: number,
    y: number,
    z: number,
    radius = 0,
  ) =>
    mesh(
      radius
        ? new RoundedBoxGeometry(width, height, depth, 2, radius)
        : new THREE.BoxGeometry(width, height, depth),
      surface,
      x,
      y,
      z,
    );

  // Fine aggregate, rather than a flat single-color board. The low contrast stays quiet at distance.
  const pixels = new Uint8Array(64 * 64 * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    const grain = 222 + Math.round(random() * 33);
    pixels[i] = pixels[i + 1] = pixels[i + 2] = grain;
    pixels[i + 3] = 255;
  }
  const grain = new THREE.DataTexture(pixels, 64, 64, THREE.RGBAFormat);
  grain.colorSpace = THREE.SRGBColorSpace;
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.repeat.set(7, 7);
  grain.magFilter = grain.minFilter = THREE.LinearFilter;
  grain.needsUpdate = true;
  textures.add(grain);

  const edge = material(0x222b30, 0.78);
  const substrate = material(0x343d41, 0.91);
  const driveway = material(0x30383d, 0.97);
  const grout = material(0x222b2d, 0.97);
  const tile = material(0x52534e, 0.89);
  const tileAlternate = material(0x464b49, 0.92);
  const soil = material(0x252d24, 1);
  const edging = material(0x293331, 0.9);
  for (const surface of [substrate, driveway, tile, tileAlternate])
    surface.map = grain;

  box(9.8, 0.2, 8.2, substrate, 0, -0.14, 0.4, 0.075);
  box(9.62, 0.065, 8.02, edge, 0, -0.273, 0.4, 0.026);
  // An inset dark driveway and large-format approach slabs keep the car area calm.
  box(2.64, 0.033, 4.6, driveway, -2.98, -0.019, 1.05, 0.022);
  for (const z of [-0.43, 1.09, 2.61])
    box(2.59, 0.003, 0.009, grout, -2.98, -0.001, z);
  box(0.016, 0.004, 4.56, grout, -2.98, -0.001, 1.05);

  // Paving is lower than every outdoor energy route (the lowest route is y=.09).
  // The narrow joints and varied stone faces read as a terrace, not another solid plinth.
  box(4.11, 0.042, 1.24, grout, 0.15, -0.005, 2.2, 0.013);
  for (let column = 0; column < 4; column++)
    for (let row = 0; row < 2; row++) {
      box(
        1.005,
        0.055,
        0.593,
        (column + row) % 3 ? tile : tileAlternate,
        -1.38 + column * 1.025,
        0.0005,
        1.895 + row * 0.612,
        0.009,
      );
    }
  // Low threshold at the glazing, with the front-left electrical entry still clear.
  box(2.73, 0.065, 0.19, tileAlternate, 0.28, 0.06, 1.647, 0.008);
  // A small side approach lies under the annex; the grid lane at z>=.1 stays open.
  box(1.5, 0.037, 0.6, tileAlternate, 2.55, -0.005, -0.42, 0.013);
  box(0.94, 0.075, 0.29, tile, 2.65, 0.019, -0.275, 0.008);
  box(0.94, 0.135, 0.3, tile, 2.65, 0.049, -0.568, 0.009);
  // A slim border ends the terrace beside the front planting bed.
  box(0.48, 0.055, 1.67, tileAlternate, 2.9, -0.003, 3.39, 0.014);
  for (const z of [3.11, 3.67]) box(0.46, 0.003, 0.01, grout, 2.9, 0.027, z);

  function bed(x: number, z: number, width: number, depth: number) {
    box(width, 0.1, depth, edging, x, 0.009, z, 0.025);
    box(width - 0.09, 0.023, depth - 0.09, soil, x, 0.063, z, 0.011);
  }
  bed(1.85, 3.3, 1.68, 1.16);
  bed(4.02, -1.52, 1.02, 2.17);
  // A small entrance planter provides a third green accent without blocking the charging route.
  bed(-0.51, 1.9, 0.34, 0.38);

  // Shared, lightly folded leaves: thousands of tiny silhouettes give organic detail
  // without large sphere crowns or hundreds of scene objects.
  const leafPositions = new Float32Array([
    0, 0, 0, -0.027, 0.035, 0.002, 0, 0.083, -0.006, 0, 0, 0, 0, 0.083, -0.006,
    0.027, 0.035, 0.002, -0.027, 0.035, 0.002, 0, 0.042, 0.009, 0, 0.083,
    -0.006, 0, 0.042, 0.009, 0.027, 0.035, 0.002, 0, 0.083, -0.006,
  ]);
  const leafGeometry = own(new THREE.BufferGeometry());
  leafGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(leafPositions, 3),
  );
  leafGeometry.computeVertexNormals();
  const leafSurface = material(0xffffff, 0.94);
  leafSurface.side = THREE.DoubleSide;
  const leafMatrices: THREE.Matrix4[] = [];
  const leafColors: THREE.Color[] = [];
  const branches: THREE.Matrix4[] = [];
  const branchSurface = material(0x6b6250, 0.99);
  const leafColor = [
    new THREE.Color(0x405a3f),
    new THREE.Color(0x586b47),
    new THREE.Color(0x697348),
    new THREE.Color(0x344d36),
  ];
  const rotation = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const addLeaf = (x: number, y: number, z: number, size = 1) => {
    euler.set(
      between(-1.05, 1.05),
      between(0, Math.PI * 2),
      between(-1.3, 1.3),
    );
    rotation.setFromEuler(euler);
    position.set(x, y, z);
    scale.set(size * between(0.66, 1.05), size, size);
    leafMatrices.push(new THREE.Matrix4().compose(position, rotation, scale));
    leafColors.push(
      leafColor[Math.floor(random() * leafColor.length)]
        .clone()
        .multiplyScalar(between(0.88, 1.15)),
    );
  };
  const branch = (from: THREE.Vector3, to: THREE.Vector3, radius: number) => {
    const direction = to.clone().sub(from);
    rotation.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.clone().normalize(),
    );
    position.copy(from).add(to).multiplyScalar(0.5);
    scale.set(radius, direction.length(), radius);
    branches.push(new THREE.Matrix4().compose(position, rotation, scale));
  };
  function tree(x: number, z: number, height: number, crown: number) {
    const at = (dx: number, y: number, dz: number) =>
      new THREE.Vector3(x + dx, y, z + dz);
    const trunk = [
      at(0, 0.08, 0),
      at(-0.023, height * 0.28, 0.015),
      at(0.035, height * 0.49, -0.008),
      at(0.005, height * 0.73, 0.013),
    ];
    for (let i = 1; i < trunk.length; i++)
      branch(trunk[i - 1], trunk[i], 0.041 - i * 0.007);
    const tips: THREE.Vector3[] = [];
    for (let n = 0; n < 9; n++) {
      const angle = n * 2.39996;
      const y = height * (0.42 + (n % 3) * 0.105);
      const reach = crown * between(0.45, 0.8);
      const start = at(0.014, y, 0);
      const fork = at(
        Math.cos(angle) * reach * 0.62,
        y + height * 0.17,
        Math.sin(angle) * reach * 0.62,
      );
      const tip = at(
        Math.cos(angle) * reach,
        y + height * 0.3,
        Math.sin(angle) * reach,
      );
      branch(start, fork, 0.014 - (n % 3) * 0.002);
      branch(fork, tip, 0.0075);
      tips.push(tip);
      const secondary = at(
        Math.cos(angle + 0.45) * reach * 0.84,
        y + height * 0.26,
        Math.sin(angle + 0.45) * reach * 0.84,
      );
      branch(fork, secondary, 0.005);
      tips.push(secondary);
    }
    // The canopy is a set of overlapping irregular clusters around actual branch tips.
    for (let n = 0; n < 1450; n++) {
      const tip = tips[n % tips.length];
      const azimuth = random() * Math.PI * 2;
      const dy = between(-1, 1);
      const radius = Math.cbrt(random()) * crown * 0.45;
      const radial = Math.sqrt(1 - dy * dy) * radius;
      addLeaf(
        tip.x + Math.cos(azimuth) * radial,
        tip.y + dy * radius * 0.75,
        tip.z + Math.sin(azimuth) * radial,
        between(0.65, 1.3),
      );
    }
  }
  tree(1.79, 3.24, 1.19, 0.43);
  tree(4.04, -1.3, 1.7, 0.51);

  function hedge(
    x: number,
    z: number,
    width: number,
    depth: number,
    count: number,
  ) {
    for (let i = 0; i < count; i++) {
      const dx = between(-width / 2, width / 2),
        dz = between(-depth / 2, depth / 2);
      const edgeSoftness = Math.min(
        1,
        (1 - Math.abs(dx) / (width / 2)) * 3,
        (1 - Math.abs(dz) / (depth / 2)) * 3,
      );
      addLeaf(
        x + dx,
        0.083 + Math.pow(random(), 0.6) * (0.16 + edgeSoftness * 0.12),
        z + dz,
        between(0.6, 1.2),
      );
    }
  }
  hedge(1.85, 3.28, 1.5, 0.99, 1350);
  hedge(4.02, -1.53, 0.83, 1.98, 1400);
  hedge(-0.51, 1.9, 0.27, 0.29, 125);
  const leaves = new THREE.InstancedMesh(
    leafGeometry,
    leafSurface,
    leafMatrices.length,
  );
  leafMatrices.forEach((matrix, i) => {
    leaves.setMatrixAt(i, matrix);
    leaves.setColorAt(i, leafColors[i]);
  });
  leaves.castShadow = leaves.receiveShadow = true;
  root.add(leaves);
  const branchGeometry = own(new THREE.CylinderGeometry(0.65, 1, 1, 7));
  const stems = new THREE.InstancedMesh(
    branchGeometry,
    branchSurface,
    branches.length,
  );
  branches.forEach((matrix, i) => stems.setMatrixAt(i, matrix));
  stems.castShadow = stems.receiveShadow = true;
  root.add(stems);

  // Soft pools are transparent light decals, with two bounded non-shadow lights for foliage.
  const poolGeometry = own(new THREE.PlaneGeometry(1, 1));
  const poolMaterial = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(0xffce86) } },
    vertexShader:
      "varying vec2 p; void main(){ p=uv*2.-1.; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }",
    fragmentShader: `varying vec2 p;
      uniform vec3 color;
      void main() {
        float d = length(p);
        float a = pow(max(0., 1. - d), 2.8) * .3;
        gl_FragColor = vec4(color, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  materials.add(poolMaterial);
  const housing = material(0x242d2d, 0.56, 0.45);
  const lens = material(0xffd699, 0.25);
  lens.emissive.setHex(0xffc678);
  lens.emissiveIntensity = 2.3;
  for (const [x, z, spread] of [
    [1.31, 3.08, 0.84],
    [3.83, -0.81, 0.88],
  ]) {
    const fixture = mesh(
      new THREE.CylinderGeometry(0.044, 0.053, 0.045, 12),
      housing,
      x,
      0.103,
      z,
    );
    fixture.castShadow = false;
    mesh(new THREE.CircleGeometry(0.03, 12), lens, x, 0.127, z).rotation.x =
      -Math.PI / 2;
    const pool = mesh(poolGeometry, poolMaterial, x, 0.086, z);
    pool.rotation.x = -Math.PI / 2;
    pool.scale.set(spread, spread, 1);
    pool.castShadow = pool.receiveShadow = false;
    const light = new THREE.PointLight(0xffce88, 0.55, 1.45, 2);
    light.position.set(x, 0.19, z);
    light.castShadow = false;
    root.add(light);
    lights.push(light);
  }

  return {
    root,
    dispose() {
      leaves.dispose();
      stems.dispose();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((surface) => surface.dispose());
      textures.forEach((texture) => texture.dispose());
      lights.forEach((light) => light.dispose());
    },
  };
}
