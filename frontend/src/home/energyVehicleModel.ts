import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/** Unbadged electric fastback. Longitudinal lofts keep the silhouette curved from every orbit. */
export function createEnergyVehicle() {
  const root = new THREE.Group();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const register = <T extends THREE.BufferGeometry>(geometry: T) => {
    geometries.add(geometry);
    return geometry;
  };
  const surface = (color: number, roughness = 0.35, metalness = 0.15) => {
    const value = new THREE.MeshPhysicalMaterial({
      color,
      roughness,
      metalness,
      clearcoat: 0.72,
      clearcoatRoughness: 0.18,
    });
    materials.add(value);
    return value;
  };
  const pearl = surface(0xe4eaeb, 0.24, 0.25);
  const glass = surface(0x203d4c, 0.17, 0.44);
  const trim = surface(0x17242b, 0.39, 0.2);
  const tyre = surface(0x182329, 0.93, 0);
  tyre.clearcoat = 0;
  const alloy = surface(0xb4c5ce, 0.23, 0.82);
  const brake = surface(0x46525b, 0.62, 0.5);
  const seam = surface(0x83969e, 0.58, 0.1);
  const headlight = surface(0xecf8ff, 0.18, 0.1);
  headlight.emissive.setHex(0xc3eaff);
  headlight.emissiveIntensity = 0.8;
  const tail = surface(0xb63a4c, 0.28, 0.1);
  tail.emissive.setHex(0x912432);
  tail.emissiveIntensity = 0.4;
  const mesh = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x = 0,
    y = 0,
    z = 0,
  ) => {
    const object = new THREE.Mesh(register(geometry), material);
    object.position.set(x, y, z);
    object.castShadow = object.receiveShadow = true;
    root.add(object);
    return object;
  };
  const box = (
    w: number,
    h: number,
    d: number,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    radius = 0.015,
  ) =>
    mesh(
      new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 2, h / 2, d / 2)),
      material,
      x,
      y,
      z,
    );
  const line = (
    points: THREE.Vector3[],
    radius: number,
    material: THREE.Material,
  ) =>
    mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        Math.max(12, points.length * 5),
        radius,
        6,
        false,
      ),
      material,
    );
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const bodyProfile = new THREE.CatmullRomCurve3(
    [
      v(0.37, 0.52, -1.47),
      v(0.54, 0.6, -1.37),
      v(0.6, 0.635, -1.1),
      v(0.603, 0.635, -0.75),
      v(0.591, 0.62, -0.25),
      v(0.598, 0.61, 0.25),
      v(0.611, 0.604, 0.7),
      v(0.597, 0.561, 1.04),
      v(0.545, 0.493, 1.31),
      v(0.45, 0.449, 1.47),
      v(0.32, 0.416, 1.52),
    ],
    false,
    "centripetal",
  );
  const points: number[] = [],
    indices: number[] = [];
  const rings = 96,
    circumference = 48;
  for (let i = 0; i <= rings; i++) {
    const station = bodyProfile.getPoint(i / rings);
    const w = station.x,
      top = station.y,
      bottom = 0.275;
    const ring = new THREE.CatmullRomCurve3(
      [
        v(0, top + 0.007, 0),
        v(w * 0.42, top + 0.006, 0),
        v(w * 0.8, top - 0.006, 0),
        v(w * 0.97, top - 0.055, 0),
        v(w, top - 0.135, 0),
        v(w * 0.975, bottom + 0.058, 0),
        v(w * 0.9, bottom, 0),
        v(0, bottom - 0.012, 0),
        v(-w * 0.9, bottom, 0),
        v(-w * 0.975, bottom + 0.058, 0),
        v(-w, top - 0.135, 0),
        v(-w * 0.97, top - 0.055, 0),
        v(-w * 0.8, top - 0.006, 0),
        v(-w * 0.42, top + 0.006, 0),
      ],
      true,
      "centripetal",
    );
    for (let j = 0; j < circumference; j++) {
      const point = ring.getPoint(j / circumference);
      // Sculpt real fender openings instead of placing wheels over a solid slab.
      const axleDistance = Math.min(
        Math.abs(station.z - 0.97),
        Math.abs(station.z + 0.96),
      );
      if (axleDistance < 0.268 && Math.abs(point.x) > w * 0.75) {
        const arch = 0.26 + Math.sqrt(0.268 ** 2 - axleDistance ** 2);
        const edge = THREE.MathUtils.smoothstep(
          Math.abs(point.x) / w,
          0.75,
          0.91,
        );
        point.y += Math.max(0, arch - point.y) * edge;
      }
      points.push(point.x, point.y, station.z);
      if (i < rings) {
        const a = i * circumference + j,
          b = i * circumference + ((j + 1) % circumference);
        indices.push(
          a,
          a + circumference,
          b,
          b,
          a + circumference,
          b + circumference,
        );
      }
    }
  }
  // Close the nose and tail with the same smoothly shaded paint.
  for (const i of [0, rings]) {
    const station = bodyProfile.getPoint(i / rings);
    const center = points.length / 3;
    points.push(0, (station.y + 0.275) / 2, station.z);
    for (let j = 0; j < circumference; j++) {
      const a = i * circumference + j,
        b = i * circumference + ((j + 1) % circumference);
      indices.push(...(i === 0 ? [center, a, b] : [center, b, a]));
    }
  }
  const body = new THREE.BufferGeometry();
  body.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  body.setIndex(indices);
  body.computeVertexNormals();
  mesh(body, pearl);
  box(0.99, 0.05, 2.37, trim, 0, 0.26, -0.03, 0.024);

  // One compound-curved panoramic canopy: no extruded flat roof or upright windscreen.
  const canopyProfile = new THREE.CatmullRomCurve3(
    [
      v(0.39, 0.648, -1.19),
      v(0.425, 0.747, -0.91),
      v(0.445, 0.89, -0.6),
      v(0.448, 0.966, -0.29),
      v(0.44, 0.97, 0.015),
      v(0.417, 0.891, 0.3),
      v(0.393, 0.739, 0.56),
      v(0.37, 0.612, 0.745),
    ],
    false,
    "centripetal",
  );
  const canopyPoint = (t: number, u: number, lift = 0) => {
    const p = canopyProfile.getPoint(t),
      angle = (u - 0.5) * Math.PI;
    const sill = THREE.MathUtils.lerp(0.628, 0.605, t);
    return v(
      p.x * Math.sin(angle),
      sill + (p.y - sill) * Math.pow(Math.max(0, Math.cos(angle)), 0.55) + lift,
      p.z,
    );
  };
  const canopyVertices: number[] = [],
    canopyIndices: number[] = [];
  const longitudinal = 56,
    transverse = 28;
  for (let i = 0; i <= longitudinal; i++)
    for (let j = 0; j <= transverse; j++) {
      const p = canopyPoint(i / longitudinal, j / transverse);
      canopyVertices.push(p.x, p.y, p.z);
      if (i < longitudinal && j < transverse) {
        const a = i * (transverse + 1) + j,
          b = a + transverse + 1;
        canopyIndices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  const canopy = new THREE.BufferGeometry();
  canopy.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(canopyVertices, 3),
  );
  canopy.setIndex(canopyIndices);
  canopy.computeVertexNormals();
  mesh(canopy, glass);
  for (const side of [0, 1]) {
    // Pearl roof rails follow the actual compound curve; the centre remains panoramic glass.
    line(
      Array.from({ length: 36 }, (_, i) =>
        canopyPoint(i / 35, side ? 0.91 : 0.09, 0.008),
      ),
      0.012,
      pearl,
    );
    line(
      Array.from({ length: 36 }, (_, i) => canopyPoint(i / 35, side, 0.004)),
      0.009,
      trim,
    );
    line(
      Array.from({ length: 9 }, (_, i) =>
        canopyPoint(0.48, side ? 0.91 + (i * 0.09) / 8 : (i * 0.09) / 8, 0.005),
      ),
      0.014,
      trim,
    );
  }
  // Front glass seal, rear hatch seal and the two restrained hood creases.
  for (const t of [0.015, 0.985])
    line(
      Array.from({ length: 24 }, (_, i) => canopyPoint(t, i / 23, 0.004)),
      0.006,
      trim,
    );
  for (const side of [-1, 1]) {
    line(
      [
        v(side * 0.36, 0.609, 0.73),
        v(side * 0.39, 0.562, 1.05),
        v(side * 0.34, 0.477, 1.4),
      ],
      0.0035,
      seam,
    );
    line(
      [
        v(side * 0.583, 0.56, 0.4),
        v(side * 0.605, 0.43, 0.31),
        v(side * 0.579, 0.315, 0.26),
      ],
      0.0035,
      seam,
    );
    line(
      [
        v(side * 0.581, 0.595, -0.45),
        v(side * 0.6, 0.43, -0.49),
        v(side * 0.572, 0.32, -0.55),
      ],
      0.0035,
      seam,
    );
    for (const z of [-0.62, 0.12])
      box(0.017, 0.022, 0.15, trim, side * 0.601, 0.558, z, 0.008);
    const mirror = mesh(
      new THREE.SphereGeometry(1, 16, 10),
      pearl,
      side * 0.651,
      0.656,
      0.48,
    );
    mirror.scale.set(0.091, 0.035, 0.092);
    box(0.095, 0.018, 0.035, trim, side * 0.603, 0.631, 0.47, 0.008);
    const headlampCurve = [
      v(side * 0.265, 0.443, 1.493),
      v(side * 0.391, 0.457, 1.449),
      v(side * 0.5, 0.474, 1.303),
    ];
    line(headlampCurve, 0.022, trim);
    line(
      headlampCurve.map((p) => p.clone().add(v(0, 0.008, 0.004))),
      0.0105,
      headlight,
    );
    line(
      [
        v(side * 0.24, 0.571, -1.415),
        v(side * 0.43, 0.558, -1.425),
        v(side * 0.547, 0.571, -1.33),
      ],
      0.018,
      tail,
    );
  }
  box(0.69, 0.028, 0.035, trim, 0, 0.307, 1.486, 0.012);
  box(0.185, 0.066, 0.019, pearl, 0, 0.364, 1.511, 0.009);
  box(0.81, 0.05, 0.06, trim, 0, 0.286, -1.434, 0.02);

  // Aerodynamic wheels with actual tyre shoulders, brake discs and five split spokes.
  const tyreGeometry = register(
    new THREE.CylinderGeometry(0.246, 0.246, 0.139, 40),
  );
  const shoulderGeometry = register(
    new THREE.TorusGeometry(0.214, 0.033, 10, 40),
  );
  const rimGeometry = register(new THREE.TorusGeometry(0.171, 0.014, 8, 40));
  const rotorGeometry = register(
    new THREE.CylinderGeometry(0.158, 0.158, 0.014, 32),
  );
  const hubGeometry = register(
    new THREE.CylinderGeometry(0.046, 0.046, 0.023, 20),
  );
  for (const side of [-1, 1])
    for (const z of [-0.96, 0.97]) {
      mesh(tyreGeometry, tyre, side * 0.566, 0.257, z).rotation.z = Math.PI / 2;
      mesh(shoulderGeometry, tyre, side * 0.638, 0.257, z).rotation.y =
        Math.PI / 2;
      mesh(rotorGeometry, brake, side * 0.645, 0.257, z).rotation.z =
        Math.PI / 2;
      mesh(rimGeometry, alloy, side * 0.656, 0.257, z).rotation.y = Math.PI / 2;
      mesh(hubGeometry, alloy, side * 0.665, 0.257, z).rotation.z = Math.PI / 2;
      for (let n = 0; n < 5; n++)
        for (const split of [-1, 1]) {
          const angle = (n * Math.PI * 2) / 5 + split * 0.095;
          const spoke = box(
            0.022,
            0.132,
            0.022,
            alloy,
            side * 0.665,
            0.257 + Math.cos(angle) * 0.101,
            z + Math.sin(angle) * 0.101,
            0.006,
          );
          spoke.rotation.x = angle;
        }
    }
  return {
    root,
    dispose() {
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
    },
  };
}
