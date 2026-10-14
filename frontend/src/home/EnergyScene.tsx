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
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { flowRoles, type FlowRole, type FlowSnapshot } from "./energyFlowModel";
import { createEnergyHouse } from "./energyHouseModel";
import { FlowHistory, type FlowPoint } from "./FlowHistory";

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
function lightRibbon(curve: THREE.Curve<THREE.Vector3>, role: FlowRole) {
  const positions: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  const segments = 140,
    up = new THREE.Vector3(0, 1, 0);
  const facade =
    role === "solar" || role === "battery"
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 0, 1);
  let previousSide: THREE.Vector3 | null = null;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments,
      p = curve.getPointAt(t),
      tangent = curve.getTangentAt(t);
    // Blend from ground to facade orientation before an ascent becomes vertical.
    // Keeping consecutive sides in the same hemisphere avoids ribbon flips.
    const vertical = THREE.MathUtils.smoothstep(Math.abs(tangent.y), 0.2, 0.88);
    const normal = up.clone().lerp(facade, vertical).normalize();
    const side = new THREE.Vector3().crossVectors(tangent, normal);
    if (side.lengthSq() < 0.0001) {
      side.copy(previousSide || new THREE.Vector3(1, 0, 0));
      side.addScaledVector(tangent, -side.dot(tangent));
    }
    side.normalize();
    if (previousSide && side.dot(previousSide) < 0) side.negate();
    previousSide = side.clone();
    side.multiplyScalar(0.12);
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
function lightMaterial(color: number, length: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tint: { value: new THREE.Color(color) },
      phase: { value: 0 },
      direction: { value: 1 },
      length: { value: length },
    },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `varying vec2 vUv;
      uniform vec3 tint;
      uniform float phase, direction, length;
      void main() {
        float edge = abs(vUv.x - .5) * 2.;
        float wave = fract((vUv.y * length - phase) / 1.75);
        float head = exp(-pow((wave - .5) * 19., 2.));
        float trail = .5 + (wave - .5) * direction;
        float tail = smoothstep(.08, .46, trail) * (1. - smoothstep(.48, .63, trail));
        float core = 1. - smoothstep(.07 + .07 * head, .23 + .1 * head, edge);
        float glow = pow(1. - edge, 3.);
        vec3 light = mix(tint, vec3(1.), core * (.14 + .72 * head + .25 * tail));
        float alpha = glow * (.10 + .26 * tail) + core * (.24 + .40 * tail + .34 * head);
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
  historySeries,
  onConfigure,
  canConfigure,
}: {
  flows: FlowSnapshot;
  animate: boolean;
  lang: string;
  readings: Record<FlowRole, Reading>;
  historySeries?: Partial<Record<FlowRole, FlowPoint[]>>;
  onConfigure: (role: FlowRole) => void;
  canConfigure: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const hotspots = useRef<Partial<Record<FlowRole, HTMLButtonElement | null>>>(
    {},
  );
  const tethers = useRef<Partial<Record<FlowRole, SVGLineElement | null>>>({});
  const anchors = useRef<Partial<Record<FlowRole, SVGGElement | null>>>({});
  const tetherLayer = useRef<SVGSVGElement>(null);
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
    renderer.setPixelRatio(
      Math.min(Math.max(window.devicePixelRatio, 1.25), 1.7),
    );
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Architecture and lighting stay still while ribbons animate. Reuse the
    // shadow atlas until equipment visibility changes rather than redrawing it.
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.96;
    renderer.setClearColor(0x000000, 0);
    element.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-hidden", "true");
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-6, 6, 5, -5, 0.1, 70);
    const studio = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const reflection = pmrem.fromScene(studio, 0.045);
    scene.environment = reflection.texture;
    scene.environmentIntensity = 0.28;
    studio.dispose();
    pmrem.dispose();
    const model = createEnergyHouse();
    scene.add(model.root);
    // Fit actual mesh bounds, not the enclosing house/mast box whose empty top
    // corners would shrink the building unnecessarily in an isometric camera.
    model.root.updateMatrixWorld(true);
    const corners: THREE.Vector3[] = [];
    model.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const originalBounds = object.userData.energyFitPoints as
        THREE.Vector3[] | undefined;
      if (originalBounds) {
        corners.push(
          ...originalBounds.map((point) =>
            point.clone().applyMatrix4(object.matrixWorld),
          ),
        );
        return;
      }
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

    scene.add(new THREE.HemisphereLight(0xb9cee0, 0x26343c, 0.9));
    const sun = new THREE.DirectionalLight(0xe1e8f0, 1.7);
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
    const rim = new THREE.DirectionalLight(0xabc4da, 1.55);
    rim.position.set(5, 4, -5);
    scene.add(rim);

    const tracks = flowRoles.map((role, index) => {
      const curve = new THREE.CatmullRomCurve3(
        model.routes[role],
        false,
        "centripetal",
      );
      const material = lightMaterial(colors[role], curve.getLength());
      const geometry = lightRibbon(curve, role);
      const ribbon = new THREE.Mesh(geometry, material);
      ribbon.renderOrder = 2;
      scene.add(ribbon);
      return {
        role,
        material,
        geometry,
        ribbon,
        phase: index * 0.31,
        speed: 0.35,
      };
    });
    let angle = 0.62,
      visible = true,
      lost = false,
      lastFrame = 0;
    // Keep animation time separate from wall time: pause/reduced motion really freeze it.
    let previousTime: number | null = null;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    function positionHotspots() {
      const width = element.clientWidth,
        height = element.clientHeight;
      const small = width < 600;
      if (tetherLayer.current) {
        tetherLayer.current.style.display = small ? "none" : "block";
        tetherLayer.current.setAttribute("viewBox", `0 0 ${width} ${height}`);
      }
      // Stable reading positions frame the house. The fine leaders keep their
      // physical attachment as it rotates, without cards covering the rooms.
      const desktopSlots: Record<FlowRole, [number, number]> = {
        solar: [0.55, 0.23],
        home: [0.18, 0.39],
        ev: [0.12, 0.64],
        battery: [0.54, 0.96],
        grid: [0.86, 0.43],
      };
      // Phones put two labels above and three below the model. The architecture
      // remains unobscured; names and colors map to the visible equipment.
      const mobileSlots: Record<FlowRole, [number, number]> = {
        solar: [0.27, 0.24],
        grid: [0.73, 0.24],
        ev: [0.17, 0.96],
        home: [0.5, 0.96],
        battery: [0.83, 0.96],
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
            anchorX: ((point.x + 1) / 2) * width,
            anchorY: ((1 - point.y) / 2) * height,
            x: small
              ? mobileSlots[role][0] * width
              : desktopSlots[role][0] * width,
            y: small
              ? mobileSlots[role][1] * height
              : desktopSlots[role][1] * height,
          },
        ];
      });
      const clamp = (value: number, lo: number, hi: number) =>
        Math.min(Math.max(value, lo), Math.max(lo, hi));
      // A compact screen-space collision pass keeps labels usable as the camera turns.
      for (let pass = 0; pass < 8; pass++) {
        for (const a of items) {
          a.x = clamp(a.x, a.w / 2 + 12, width - a.w / 2 - 12);
          a.y = clamp(a.y, a.h + 48, height - 16);
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
        const x = clamp(item.x, item.w / 2 + 12, width - item.w / 2 - 12);
        const y = clamp(item.y, item.h + 48, height - 16);
        item.node.style.left = `${x}px`;
        item.node.style.top = `${y}px`;
        item.node.dataset.positioned = "true";
        const line = tethers.current[item.role],
          dot = anchors.current[item.role];
        if (line && dot) {
          // Connect the physical part to the nearest card edge, rather than its centre.
          const ex = clamp(
            item.anchorX,
            x - item.w / 2 + 10,
            x + item.w / 2 - 10,
          );
          const ey = clamp(item.anchorY, y - item.h + 8, y - 8);
          line.setAttribute("x1", String(item.anchorX));
          line.setAttribute("y1", String(item.anchorY));
          line.setAttribute("x2", String(ex));
          line.setAttribute("y2", String(ey));
          dot.setAttribute(
            "transform",
            `translate(${item.anchorX} ${item.anchorY})`,
          );
        }
      }
    }
    function view() {
      const width = element.clientWidth,
        height = Math.max(element.clientHeight, 1),
        aspect = width / height;
      camera.position.set(12 * Math.sin(angle), 7.7, 12 * Math.cos(angle));
      camera.lookAt(0, 1, 0.45);
      camera.updateMatrixWorld(true);
      const cameraBounds = new THREE.Box3().setFromPoints(
        corners.map((v) => v.clone().applyMatrix4(camera.matrixWorldInverse)),
      );
      const size = cameraBounds.getSize(new THREE.Vector3());
      const viewHeight = Math.max(
        size.y / (width < 600 ? 0.63 : 0.85),
        size.x / (aspect * (width < 600 ? 0.97 : 0.94)),
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
      const dt =
        previousTime !== null && value.animate && !reduced.matches
          ? Math.max(0, Math.min((ms - previousTime) / 1000, 0.1))
          : 0;
      previousTime = ms;
      for (const item of tracks) {
        const flow = value.flows[item.role];
        const active =
          flow.status === "ok" &&
          flow.watts !== null &&
          Math.abs(flow.watts) > 0.5;
        const forward =
          item.role === "home" || item.role === "ev"
            ? false
            : (flow.watts || 0) > 0;
        const targetSpeed =
          0.38 +
          Math.min(0.52, Math.sqrt(Math.abs(flow.watts || 0) / 8000) * 0.4);
        if (active && flow.visible && dt > 0) {
          item.speed += (targetSpeed - item.speed) * (1 - Math.exp(-dt * 3));
          item.phase =
            (item.phase + dt * item.speed * (forward ? 1 : -1)) % 1.75;
        }
        // Integrate each stream's travelled distance. A changing meter never
        // teleports the pulse, and paused readings cannot move its position.
        item.ribbon.visible = flow.visible && active;
        const pulse = 0.5 + 0.5 * Math.cos((item.phase / 1.75) * Math.PI * 2);
        model.setActivity(item.role, flow.visible && active, pulse);
        const component = model.components[item.role];
        if (component && component.visible !== flow.visible) {
          component.visible = flow.visible;
          renderer.shadowMap.needsUpdate = true;
        }
        item.material.uniforms.direction.value = forward ? 1 : -1;
        item.material.uniforms.phase.value = item.phase;
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
      reflection.dispose();
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
          <svg
            ref={tetherLayer}
            className="energy-hotspot-tethers"
            aria-hidden="true"
          >
            {flowRoles
              .filter((role) => flows[role].visible)
              .map((role) => (
                <g key={role}>
                  <line
                    ref={(node) => {
                      tethers.current[role] = node;
                    }}
                    className="energy-hotspot-tether"
                    data-role={role}
                  />
                  <g
                    ref={(node) => {
                      anchors.current[role] = node;
                    }}
                    className="energy-hotspot-anchor"
                    data-role={role}
                  >
                    <circle className="energy-anchor-ring" r="9" />
                    <circle className="energy-anchor-core" r="4.5" />
                  </g>
                </g>
              ))}
          </svg>
        )}
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
                    <span
                      className="energy-hotspot-sparkline"
                      aria-hidden="true"
                    >
                      <FlowHistory
                        points={historySeries?.[role] || []}
                        lang={lang}
                        compact
                      />
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
