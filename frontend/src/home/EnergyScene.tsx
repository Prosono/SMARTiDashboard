import { useEffect, useRef, useState } from "react";
import {
  BatteryCharging,
  CarFront,
  House,
  RotateCcw,
  RotateCw,
  Sun,
  UtilityPole,
} from "lucide-react";
import * as THREE from "three";
import { flowRoles, type FlowRole, type FlowSnapshot } from "./energyFlowModel";
import { createEnergyHouse } from "./energyHouseModel";

const colors: Record<FlowRole, number> = {
  solar: 0xffba45,
  home: 0xff7554,
  ev: 0xb787ff,
  battery: 0x48e8b1,
  grid: 0x59c8ff,
};
const icons = {
  solar: Sun,
  home: House,
  ev: CarFront,
  battery: BatteryCharging,
  grid: UtilityPole,
};
type Reading = { label: string; value: string; detail: string };

// A flat ribbon of light, rather than a physical cable. UV.y follows the path;
// UV.x fades the edges so the same surface supplies the soft spill and white core.
function lightRibbon(curve: THREE.Curve<THREE.Vector3>) {
  const positions: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  const segments = 140,
    up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments,
      p = curve.getPointAt(t),
      tangent = curve.getTangentAt(t);
    const side = new THREE.Vector3().crossVectors(tangent, up);
    if (side.lengthSq() < 0.01) side.set(1, 0, 0);
    side.normalize().multiplyScalar(0.17);
    positions.push(
      p.x - side.x,
      p.y - side.y,
      p.z - side.z,
      p.x + side.x,
      p.y + side.y,
      p.z + side.z,
    );
    uv.push(0, t, 1, t);
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  return geometry;
}
function lightMaterial(color: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tint: { value: new THREE.Color(color) },
      phase: { value: 0 },
      direction: { value: 1 },
      strength: { value: 1 },
    },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `varying vec2 vUv;
      uniform vec3 tint;
      uniform float phase, direction, strength;
      void main() {
        float edge = abs(vUv.x - .5) * 2.;
        float core = 1. - smoothstep(.1, .27, edge);
        float halo = pow(1. - edge, 2.8);
        float wave = fract(vUv.y * 2. - phase * direction);
        float pulse = smoothstep(.38, .78, wave) * (1. - smoothstep(.78, 1., wave));
        vec3 light = mix(tint, vec3(1.), core * (.32 + .65 * pulse));
        float alpha = (halo * .42 + core * (.66 + .34 * pulse)) * strength;
        gl_FragColor = vec4(light, alpha);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

export default function EnergyScene({
  flows,
  animate,
  lang,
  readings,
  onConfigure,
  canConfigure,
}: {
  flows: FlowSnapshot;
  animate: boolean;
  lang: string;
  readings: Record<FlowRole, Reading>;
  onConfigure: (role: FlowRole) => void;
  canConfigure: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const hotspots = useRef<Partial<Record<FlowRole, HTMLButtonElement | null>>>(
    {},
  );
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
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setClearColor(0x000000, 0);
    element.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-hidden", "true");
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-6, 6, 5, -5, 0.1, 70);
    const model = createEnergyHouse();
    scene.add(model.root);
    // Fit actual mesh bounds, not the enclosing house/mast box whose empty top
    // corners would shrink the building unnecessarily in an isometric camera.
    model.root.updateMatrixWorld(true);
    const corners: THREE.Vector3[] = [];
    model.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      let bounds: THREE.Box3 | null;
      if (object instanceof THREE.InstancedMesh) {
        object.computeBoundingBox();
        bounds = object.boundingBox;
      } else {
        object.geometry.computeBoundingBox();
        bounds = object.geometry.boundingBox;
      }
      if (!bounds) return;
      for (const x of [bounds.min.x, bounds.max.x])
        for (const y of [bounds.min.y, bounds.max.y])
          for (const z of [bounds.min.z, bounds.max.z])
            corners.push(
              new THREE.Vector3(x, y, z).applyMatrix4(object.matrixWorld),
            );
    });

    scene.add(new THREE.HemisphereLight(0xe8f4ff, 0x73716d, 1.8));
    const sun = new THREE.DirectionalLight(0xffeedb, 3.1);
    sun.position.set(-3, 8, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -8;
    sun.shadow.camera.right = 8;
    sun.shadow.camera.top = 8;
    sun.shadow.camera.bottom = -8;
    sun.shadow.normalBias = 0.028;
    sun.shadow.bias = -0.00015;
    sun.shadow.radius = 3;
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0xa7d8ff, 1.5);
    rim.position.set(5, 4, -5);
    scene.add(rim);

    const tracks = flowRoles.map((role) => {
      const curve = new THREE.CatmullRomCurve3(
        model.routes[role],
        false,
        "centripetal",
      );
      const material = lightMaterial(colors[role]);
      const geometry = lightRibbon(curve);
      const ribbon = new THREE.Mesh(geometry, material);
      ribbon.renderOrder = 2;
      scene.add(ribbon);
      return { role, material, geometry, ribbon };
    });
    let angle = 0.62,
      visible = true,
      lost = false,
      lastFrame = 0;
    // Keep animation time separate from wall time: pause/reduced motion really freeze it.
    let animationTime = 0,
      previousTime: number | null = null;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    function positionHotspots() {
      const width = element.clientWidth,
        height = element.clientHeight;
      const small = width < 600;
      const offsets: Record<FlowRole, [number, number]> = {
        solar: [-25, -52],
        home: [-185, -30],
        ev: [-130, 35],
        battery: [-45, 132],
        grid: [65, -4],
      };
      // Phones put two labels above and three below the model. The architecture
      // remains unobscured; names and colors map to the visible equipment.
      const mobileSlots: Record<FlowRole, [number, number]> = {
        solar: [0.27, 0.25],
        grid: [0.73, 0.25],
        ev: [0.17, 0.9],
        home: [0.5, 0.9],
        battery: [0.83, 0.9],
      };
      const items = flowRoles.flatMap((role) => {
        const node = hotspots.current[role];
        if (!node || !values.current.flows[role].visible) return [];
        const point = model.anchors[role].clone().project(camera);
        const w = node.offsetWidth,
          h = node.offsetHeight;
        return [
          {
            role,
            node,
            w,
            h,
            x: small
              ? mobileSlots[role][0] * width
              : ((point.x + 1) / 2) * width + offsets[role][0],
            y: small
              ? mobileSlots[role][1] * height
              : ((1 - point.y) / 2) * height + offsets[role][1],
          },
        ];
      });
      const clamp = (value: number, lo: number, hi: number) =>
        Math.min(Math.max(value, lo), Math.max(lo, hi));
      // A compact screen-space collision pass keeps labels usable as the camera turns.
      for (let pass = 0; pass < 8; pass++) {
        for (const a of items) {
          a.x = clamp(a.x, a.w / 2 + 12, width - a.w / 2 - 12);
          a.y = clamp(a.y, a.h + 66, height - 16);
        }
        for (let i = 0; i < items.length; i++)
          for (let j = i + 1; j < items.length; j++) {
            const a = items[i],
              b = items[j];
            const overlapX = (a.w + b.w) / 2 + 10 - Math.abs(a.x - b.x);
            const aCenter = a.y - a.h / 2,
              bCenter = b.y - b.h / 2;
            const overlapY = (a.h + b.h) / 2 + 12 - Math.abs(aCenter - bCenter);
            if (overlapX > 0 && overlapY > 0) {
              const sign = aCenter < bCenter ? -1 : 1;
              a.y += (sign * overlapY) / 2;
              b.y -= (sign * overlapY) / 2;
            }
          }
      }
      for (const item of items) {
        item.node.style.left = `${clamp(item.x, item.w / 2 + 12, width - item.w / 2 - 12)}px`;
        item.node.style.top = `${clamp(item.y, item.h + 66, height - 16)}px`;
        item.node.dataset.positioned = "true";
      }
    }
    function view() {
      const width = element.clientWidth,
        height = Math.max(element.clientHeight, 1),
        aspect = width / height;
      camera.position.set(12 * Math.sin(angle), 8.7, 12 * Math.cos(angle));
      camera.lookAt(0, 1, 0.45);
      camera.updateMatrixWorld(true);
      const cameraBounds = new THREE.Box3().setFromPoints(
        corners.map((v) => v.clone().applyMatrix4(camera.matrixWorldInverse)),
      );
      const size = cameraBounds.getSize(new THREE.Vector3());
      const viewHeight = Math.max(
        size.y / (width < 600 ? 0.63 : 0.78),
        size.x / (aspect * (width < 600 ? 0.97 : 0.91)),
      );
      const center = cameraBounds.getCenter(new THREE.Vector3());
      camera.left = center.x - (viewHeight * aspect) / 2;
      camera.right = center.x + (viewHeight * aspect) / 2;
      camera.top = center.y + viewHeight / 2;
      camera.bottom = center.y - viewHeight / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      positionHotspots();
    }
    function draw(ms = 0) {
      if (ms && ms - lastFrame < 33) return;
      lastFrame = ms;
      const value = values.current;
      if (previousTime !== null && value.animate && !reduced.matches)
        animationTime += Math.min((ms - previousTime) / 1000, 0.1);
      previousTime = ms;
      for (const item of tracks) {
        const flow = value.flows[item.role];
        const active =
          flow.status === "ok" &&
          flow.watts !== null &&
          Math.abs(flow.watts) > 0.5;
        // Unknown or stale data must not imply electricity is flowing.
        item.ribbon.visible = flow.visible && active;
        model.setActivity(
          item.role,
          flow.visible && active,
          0.5 + 0.5 * Math.sin(animationTime * 2.6),
        );
        const component = model.components[item.role];
        if (component) component.visible = flow.visible;
        const forward =
          item.role === "home" || item.role === "ev"
            ? false
            : (flow.watts || 0) > 0;
        const speed = 0.26 + Math.min(0.5, Math.abs(flow.watts || 0) / 18000);
        item.material.uniforms.direction.value = forward ? 1 : -1;
        item.material.uniforms.phase.value = animationTime * speed;
      }
      renderer.render(scene, camera);
    }
    function sync() {
      if (lost || !visible || document.hidden) {
        previousTime = null;
        renderer.setAnimationLoop(null);
        return;
      }
      draw(performance.now());
      const shouldAnimate =
        !reduced.matches &&
        values.current.animate &&
        Object.values(values.current.flows).some(
          (f) =>
            f.visible &&
            f.status === "ok" &&
            f.watts !== null &&
            Math.abs(f.watts) > 0.5,
        );
      if (!shouldAnimate) previousTime = null;
      renderer.setAnimationLoop(shouldAnimate ? draw : null);
    }
    function resize() {
      view();
      lastFrame = 0;
      sync();
    }
    api.current = {
      sync: () => {
        positionHotspots();
        lastFrame = 0;
        sync();
      },
      rotate: (amount) => {
        angle = Math.max(0.2, Math.min(1.17, angle + amount));
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
      tracks.forEach((t) => {
        t.geometry.dispose();
        t.material.dispose();
      });
      model.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);
  useEffect(() => api.current?.sync(), [flows, animate, readings]);
  const en = lang === "en";
  return (
    <div className="energy-scene-wrap">
      <div className="energy-scene-stage">
        <div
          ref={host}
          className="energy-scene"
          role="img"
          aria-label={
            en
              ? "Interactive 3D energy home with solar roof, EV charger, battery and utility pole. Measurements available beside each component and below."
              : "Interaktivt 3D-energihus med soltak, elbillader, batteri og strømmast. Målinger ved hver del og under modellen."
          }
        />
        {!failed && (
          <div className="energy-hotspots">
            {flowRoles
              .filter((r) => flows[r].visible)
              .map((role) => {
                const Icon = icons[role],
                  reading = readings[role];
                const action =
                  flows[role].status === "unconfigured"
                    ? en
                      ? "Add measurement"
                      : "Legg til måling"
                    : en
                      ? "View history"
                      : "Vis historikk";
                return (
                  <button
                    key={role}
                    ref={(node) => {
                      hotspots.current[role] = node;
                    }}
                    className="energy-hotspot"
                    data-hotspot={role}
                    data-status={flows[role].status}
                    aria-label={`${reading.label}: ${reading.value}. ${reading.detail}. ${action}`}
                    title={`${action} · ${reading.label}`}
                    disabled={!canConfigure}
                    onClick={() => onConfigure(role)}
                  >
                    <span className="energy-hotspot-icon">
                      <Icon size={19} aria-hidden="true" />
                    </span>
                    <span className="energy-hotspot-copy">
                      <span>{reading.label}</span>
                      <strong>{reading.value}</strong>
                      <small>{reading.detail}</small>
                    </span>
                  </button>
                );
              })}
          </div>
        )}
        {failed && (
          <div className="energy-scene-fallback" role="status">
            {en
              ? "3D view is unavailable in this browser. Live readings remain available below."
              : "3D-visningen er ikke tilgjengelig i denne nettleseren. Målingene vises fortsatt under."}
          </div>
        )}
      </div>
      {!failed && (
        <div className="energy-scene-tools">
          <button
            aria-label={en ? "Rotate house left" : "Drei huset mot venstre"}
            onClick={() => api.current?.rotate(-0.15)}
          >
            <RotateCcw size={16} />
          </button>
          <span>
            {en
              ? "Your energy home · drag to rotate"
              : "Ditt energihus · dra for å dreie"}
          </span>
          <button
            aria-label={en ? "Rotate house right" : "Drei huset mot høyre"}
            onClick={() => api.current?.rotate(0.15)}
          >
            <RotateCw size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
