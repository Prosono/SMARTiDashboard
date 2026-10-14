import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Batch only opaque, immovable architecture. Equipment, glazing, instancing and lights retain their own objects. */
export function mergeEnergyArchitecture(
  architecture: THREE.Group,
  registerGeometry: (geometry: THREE.BufferGeometry) => THREE.BufferGeometry,
) {
  architecture.updateWorldMatrix(true, true);
  const inverse = architecture.matrixWorld.clone().invert();
  const buckets = new Map<string, THREE.Mesh[]>();
  architecture.traverse((object) => {
    if (
      !(object instanceof THREE.Mesh) ||
      object instanceof THREE.InstancedMesh ||
      object instanceof THREE.SkinnedMesh ||
      Array.isArray(object.material) ||
      object.material.transparent ||
      object.morphTargetInfluences ||
      !object.visible
    )
      return;
    const key = [
      object.material.uuid,
      object.castShadow,
      object.receiveShadow,
      object.renderOrder,
      object.layers.mask,
    ].join(":");
    const bucket = buckets.get(key) || [];
    bucket.push(object);
    buckets.set(key, bucket);
  });
  for (const meshes of buckets.values()) {
    if (meshes.length < 2) continue;
    const transformed: THREE.BufferGeometry[] = [];
    const fitPoints: THREE.Vector3[] = [];
    for (const mesh of meshes) {
      const matrix = inverse.clone().multiply(mesh.matrixWorld);
      mesh.geometry.computeBoundingBox();
      const bounds = mesh.geometry.boundingBox;
      if (bounds)
        for (const x of [bounds.min.x, bounds.max.x])
          for (const y of [bounds.min.y, bounds.max.y])
            for (const z of [bounds.min.z, bounds.max.z])
              fitPoints.push(new THREE.Vector3(x, y, z).applyMatrix4(matrix));
      const geometry = mesh.geometry.index
        ? mesh.geometry.toNonIndexed()
        : mesh.geometry.clone();
      geometry.applyMatrix4(matrix);
      transformed.push(geometry);
    }
    const combined = mergeGeometries(transformed, false);
    transformed.forEach((geometry) => geometry.dispose());
    // Keep the original hierarchy if future geometry introduces incompatible attributes.
    if (!combined) continue;
    registerGeometry(combined);
    const first = meshes[0];
    const batch = new THREE.Mesh(combined, first.material);
    batch.name = "static-architecture";
    batch.castShadow = first.castShadow;
    batch.receiveShadow = first.receiveShadow;
    batch.renderOrder = first.renderOrder;
    batch.layers.mask = first.layers.mask;
    // Combining distant surfaces must not enlarge the camera fit to empty AABB corners.
    batch.userData.energyFitPoints = fitPoints;
    architecture.add(batch);
    meshes.forEach((mesh) => mesh.removeFromParent());
  }
}
