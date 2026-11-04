import { useContext, useId, useState, type CSSProperties } from "react";
import { CardPresentation } from "./CardPresentation";
import type { Control } from "../types";
import { equipmentPortraitKinds } from "./equipmentAssets";
import {
  equipmentArt,
  finiteReading,
  lightColor,
  type EquipmentArt,
} from "./equipmentModel";

/** Decorative product art. Geometry and light tint follow reported state, never invent a reading. */
export function EquipmentArtwork({
  c,
  available = true,
  kind: override,
}: {
  c: Control;
  available?: boolean;
  kind?: EquipmentArt;
}) {
  const appearance = useContext(CardPresentation);
  const kind = override || equipmentArt(c),
    id = useId().replaceAll(":", "");
  const [failed, fail] = useState("");
  const active =
    available && ["on", "open", "heat", "cool", "auto"].includes(c.state);
  const position = available
    ? (finiteReading(c.attributes.current_position, 0, 100) ??
      (c.state === "closed" ? 0 : c.state === "open" ? 100 : null))
    : null;
  const level = (position ?? 50) / 100;
  const portrait =
    kind === "window"
      ? available && ["on", "open"].includes(c.state)
        ? "window-open"
        : available && ["off", "closed"].includes(c.state)
          ? "window-closed"
          : null
      : equipmentPortraitKinds.has(kind)
        ? kind
        : null;
  const image = portrait
    ? new URL(`home/equipment/${portrait}.webp`, document.baseURI).href
    : null;
  if (appearance.image && appearance.image !== "auto") return null;
  if (image && image !== failed)
    return (
      <div
        className={`equipment-art art-${kind}`}
        data-lit={active}
        data-light={c.domain === "light" || undefined}
        aria-hidden="true"
        style={{ "--lamp-color": lightColor(c) } as CSSProperties}
      >
        <img
          src={image}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => fail(image)}
        />
      </div>
    );
  return (
    <div
      className={`equipment-art art-${kind}`}
      aria-hidden="true"
      data-lit={active}
    >
      <svg viewBox="0 0 180 150" fill="none">
        <defs>
          <linearGradient id={`${id}metal`} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#77818c" />
            <stop offset=".25" stopColor="#3e4651" />
            <stop offset=".65" stopColor="#1a2029" />
            <stop offset="1" stopColor="#3e4651" />
          </linearGradient>
          <linearGradient id={`${id}edge`} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#c0c7ce" />
            <stop offset=".5" stopColor="#434b57" />
            <stop offset="1" stopColor="#909ba8" />
          </linearGradient>
          <linearGradient id={`${id}glass`} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#adc9df" stopOpacity=".35" />
            <stop offset=".5" stopColor="#607a92" stopOpacity=".12" />
            <stop offset="1" stopColor="#c1d2de" stopOpacity=".45" />
          </linearGradient>
          <linearGradient id={`${id}linen`}>
            <stop stopColor="#8f939a" />
            <stop offset=".2" stopColor="#535962" />
            <stop offset=".5" stopColor="#858a92" />
            <stop offset=".8" stopColor="#414954" />
            <stop offset="1" stopColor="#8b929a" />
          </linearGradient>
          <radialGradient id={`${id}warm`}>
            <stop stopColor="#ffcd70" stopOpacity={active ? ".7" : ".15"} />
            <stop offset="1" stopColor="#ffb13c" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${id}white`} cx=".35" cy=".2">
            <stop stopColor="#f2f4f5" />
            <stop offset=".7" stopColor="#b5bdc4" />
            <stop offset="1" stopColor="#717b87" />
          </radialGradient>
        </defs>
        {["lock", "plug", "contact", "generic"].includes(kind) ? (
          <g>
            <rect
              x={kind === "contact" ? 40 : 46}
              y="18"
              width={kind === "contact" ? 55 : 90}
              height="116"
              rx="15"
              fill={`url(#${id}metal)`}
              stroke={`url(#${id}edge)`}
              strokeWidth="2"
            />
            {kind === "lock" ? (
              <>
                <rect
                  x="57"
                  y="29"
                  width="68"
                  height="48"
                  rx="4"
                  fill="#1e2630"
                />
                <path
                  d="M85 100H154"
                  stroke={`url(#${id}edge)`}
                  strokeWidth="12"
                  strokeLinecap="round"
                />
              </>
            ) : kind === "plug" ? (
              <>
                <circle
                  cx="91"
                  cy="76"
                  r="33"
                  fill="#161e28"
                  stroke="#8e99a6"
                />
                <circle cx="77" cy="76" r="5" fill="#070e18" />
                <circle cx="105" cy="76" r="5" fill="#070e18" />
              </>
            ) : kind === "contact" ? (
              <rect
                x="110"
                y="35"
                width="26"
                height="83"
                rx="10"
                fill={`url(#${id}metal)`}
                stroke="#8e99a6"
              />
            ) : (
              <path
                d="M68 53H113V99H68ZM58 64H66M58 84H66M115 64H123M115 84H123"
                stroke="#aab7c3"
                strokeWidth="3"
              />
            )}
          </g>
        ) : kind === "strip" ? (
          <g>
            <path
              d="M148 32C62 17 29 36 39 60C49 83 121 76 152 88L147 113C96 98 28 112 18 77C5 29 64 10 151 25Z"
              fill={`url(#${id}metal)`}
              stroke="#9295a0"
            />
            <path
              d="M147 36C68 22 39 39 47 55C59 73 129 67 152 80L149 100C101 88 41 95 32 71"
              stroke={active ? lightColor(c) : "#676b78"}
              strokeWidth="10"
            />
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <rect
                key={i}
                x={51 + i * 14}
                y={74 + i * 0.9}
                width="5"
                height="6"
                rx="2"
                fill={active ? "#fff3ff" : "#8a8d98"}
              />
            ))}
          </g>
        ) : ["blind", "roller", "curtain", "awning", "garage"].includes(
            kind,
          ) ? (
          <g>
            {kind === "awning" ? (
              <>
                <path d="M25 40H147V119H25Z" fill="#483c30" stroke="#9eabb8" />
                <path d="M36 50H138V120H36Z" fill={`url(#${id}warm)`} />
                <path
                  d={`M26 40H147L${158 + level * 12} ${53 + level * 30}H${14 - level * 8}Z`}
                  fill={`url(#${id}linen)`}
                  stroke="#aeb6bf"
                />
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <path
                    key={i}
                    d={`M${35 + i * 19} 40L${24 + i * 23} ${53 + level * 30}`}
                    stroke="#b8bec6"
                    strokeWidth="5"
                    opacity=".65"
                  />
                ))}
                <path
                  d={`M14 ${53 + level * 30}H170V${60 + level * 30}H14Z`}
                  fill={`url(#${id}metal)`}
                />
              </>
            ) : (
              <>
                <rect
                  x="23"
                  y="18"
                  width="134"
                  height="118"
                  rx="3"
                  fill="#202831"
                  stroke={`url(#${id}edge)`}
                  strokeWidth="4"
                />
                <rect
                  x="30"
                  y="25"
                  width="120"
                  height="103"
                  fill={kind === "garage" ? "#111a24" : `url(#${id}glass)`}
                />
                {kind !== "garage" && (
                  <path
                    d="M90 25V128M30 77H150"
                    stroke="#aeb5bd"
                    strokeWidth="2"
                    opacity=".7"
                  />
                )}
                {kind === "curtain" ? (
                  <>
                    <path
                      d={`M27 19H${83 - level * 40}L${80 - level * 38} 135H27Z`}
                      fill={`url(#${id}linen)`}
                      stroke="#a3aab2"
                    />
                    <path
                      d={`M${97 + level * 40} 19H154V135H${100 + level * 38}Z`}
                      fill={`url(#${id}linen)`}
                      stroke="#a3aab2"
                    />
                    {[35, 44, 53, 62, 118, 127, 136, 145].map((x) => (
                      <path
                        key={x}
                        d={`M${x} 20V134`}
                        stroke="#c1c5cc"
                        opacity=".17"
                      />
                    ))}
                  </>
                ) : kind === "roller" ? (
                  <>
                    <rect
                      x="25"
                      y="21"
                      width="130"
                      height={Math.max(5, 104 * (1 - level))}
                      fill={`url(#${id}linen)`}
                    />
                    <path
                      d={`M24 ${24 + 104 * (1 - level)}H156`}
                      stroke={`url(#${id}edge)`}
                      strokeWidth="5"
                    />
                  </>
                ) : (
                  <>
                    {Array.from({ length: 11 }, (_, i) => (
                      <rect
                        key={i}
                        x="28"
                        y={25 + i * 9.1 * (1 - level * 0.86)}
                        width="124"
                        height={
                          kind === "garage" ? Math.max(2, 8 * (1 - level)) : 4.5
                        }
                        rx="1"
                        fill={`url(#${id}metal)`}
                        stroke="#a6afb8"
                        strokeWidth=".5"
                      />
                    ))}
                  </>
                )}
                <rect
                  x="20"
                  y="14"
                  width="140"
                  height="9"
                  rx="2"
                  fill={`url(#${id}metal)`}
                  stroke="#a7b0ba"
                />
              </>
            )}
          </g>
        ) : kind === "window" ? (
          <g>
            <rect
              x="35"
              y="18"
              width="103"
              height="119"
              rx="2"
              fill={`url(#${id}metal)`}
              stroke="#b2bcc6"
              strokeWidth="3"
            />
            <rect
              x="42"
              y="25"
              width="89"
              height="104"
              fill={`url(#${id}glass)`}
            />
            <path
              d={active ? "M45 24L112 38V118L45 130Z" : "M43 25H131V129H43Z"}
              fill={`url(#${id}glass)`}
              stroke="#8d9baa"
              strokeWidth="6"
            />
            <path
              d={active ? "M105 72V85" : "M121 72V85"}
              stroke="#c6d0d7"
              strokeWidth="4"
            />
          </g>
        ) : ["motion", "smoke", "leak"].includes(kind) ? (
          <g>
            <ellipse
              cx="91"
              cy="110"
              rx={kind === "motion" ? 42 : 61}
              ry="16"
              fill="#111923"
              opacity=".2"
            />
            {kind === "motion" ? (
              <>
                <path
                  d="M44 54C44 5 135 5 135 54V94C134 140 45 140 44 94Z"
                  fill={`url(#${id}white)`}
                  stroke="#afb7c2"
                />
                <path
                  d="M55 65H125V91C124 121 56 121 55 91Z"
                  fill="#bec8d2"
                  stroke="#f0f2f4"
                />
                <path
                  d="M66 69V109M79 68V116M93 68V116M107 68V109M56 86H124M61 99H119"
                  stroke="#939eab"
                  strokeWidth="1"
                />
              </>
            ) : (
              <>
                <ellipse
                  cx="91"
                  cy="88"
                  rx="63"
                  ry="35"
                  fill={`url(#${id}metal)`}
                />
                <ellipse
                  cx="89"
                  cy="79"
                  rx="65"
                  ry="36"
                  fill={`url(#${id}white)`}
                  stroke="#e3e7eb"
                />
                {kind === "smoke" && (
                  <>
                    <ellipse cx="89" cy="72" rx="38" ry="17" stroke="#84909d" />
                    <path
                      d="M43 91L57 98M50 99L65 104M125 89L113 97M129 96L114 104"
                      stroke="#657180"
                      strokeWidth="3"
                    />
                  </>
                )}
                {kind === "leak" && (
                  <path
                    d="M150 86C166 82 171 90 180 95"
                    stroke="#596474"
                    strokeWidth="4"
                  />
                )}
                {available && (
                  <circle
                    cx="87"
                    cy="75"
                    r="3"
                    fill={active ? "#f76b65" : "#6fae8a"}
                  />
                )}
              </>
            )}
          </g>
        ) : kind === "movement" ? (
          <g
            stroke="#9aa9b8"
            strokeWidth="10"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="99" cy="28" r="11" fill="#9aa9b8" strokeWidth="1" />
            <path d="M91 48L77 85L56 126M80 84L111 97L128 126M89 52L118 72L140 72M88 54L65 67L43 88" />
          </g>
        ) : kind === "presence" ? (
          <g stroke={active ? "#40d38a" : "#79889a"}>
            {[22, 40, 58].map((r) => (
              <circle
                key={r}
                cx="90"
                cy="80"
                r={r}
                opacity={r === 22 ? 1 : 0.3}
              />
            ))}
            <circle
              cx="90"
              cy="80"
              r="8"
              fill={active ? "#40d38a" : "#79889a"}
            />
          </g>
        ) : kind === "battery" ? (
          <g transform="rotate(12 90 75)">
            <rect
              x="52"
              y="26"
              width="76"
              height="112"
              rx="10"
              fill={`url(#${id}metal)`}
              stroke={`url(#${id}edge)`}
              strokeWidth="3"
            />
            <rect
              x="74"
              y="17"
              width="32"
              height="12"
              rx="3"
              fill={`url(#${id}edge)`}
            />
            <path
              d="M90 47V70M79 58H101M79 110H101"
              stroke="#c8d1da"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </g>
        ) : kind === "alarm" ? (
          <g>
            <path
              d="M90 18C108 31 122 34 139 36V78C139 111 114 130 90 139C66 130 41 111 41 78V36C58 34 72 31 90 18Z"
              fill={`url(#${id}metal)`}
              stroke={c.state === "triggered" ? "#ff716c" : "#f4ad52"}
              strokeWidth="4"
            />
            <path
              d="M70 76L84 91L112 60"
              stroke="#f4ad52"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        ) : kind === "air-conditioner" ? (
          <g>
            <path
              d="M24 45L156 41L164 51V95L154 109L24 108L16 98V56Z"
              fill={`url(#${id}white)`}
              stroke="#929fab"
              strokeWidth="2"
            />
            <path
              d="M24 48H153L157 54V88H23Z"
              fill="#e4e9ed"
              stroke="#bac4cd"
            />
            <path d="M26 91H152L147 102H30Z" fill="#34424e" />
            <path d="M32 94H147M33 98H146" stroke="#8a9ba9" strokeWidth="2" />
            <path d="M27 57H152M27 61H152" stroke="#c0cad2" />
            <circle
              cx="141"
              cy="80"
              r="2"
              fill={active ? "#68d3ba" : "#83939f"}
            />
          </g>
        ) : ["switch", "thermostat"].includes(kind) ? (
          <g>
            <rect
              x="40"
              y="20"
              width="105"
              height="118"
              rx="13"
              fill={`url(#${id}metal)`}
              stroke={`url(#${id}edge)`}
              strokeWidth="2"
            />
            <rect
              x="51"
              y="30"
              width="83"
              height="97"
              rx="7"
              fill="#303743"
              stroke="#131c25"
              strokeWidth="3"
            />
            {kind === "thermostat" && (
              <>
                <rect
                  x="62"
                  y="42"
                  width="61"
                  height="43"
                  rx="3"
                  fill="#17212c"
                />
                <path
                  d="M75 104H85M105 100V110M100 105H110"
                  stroke="#aab5c0"
                  strokeWidth="3"
                />
              </>
            )}
          </g>
        ) : kind === "track" ? (
          <g stroke="#adb8c2" strokeWidth="2">
            <path d="M18 29H162V39H18Z" fill={`url(#${id}metal)`} />
            {[42, 90, 138].map((x) => (
              <g key={x}>
                <path d={`M${x} 39V63`} strokeWidth="5" />
                <rect
                  x={x - 14}
                  y="59"
                  width="28"
                  height="54"
                  rx="8"
                  fill={`url(#${id}metal)`}
                />
                <ellipse
                  cx={x}
                  cy="110"
                  rx="12"
                  ry="5"
                  fill={active ? lightColor(c) : "#c0c5cb"}
                />
              </g>
            ))}
          </g>
        ) : kind === "charger" ? (
          <g stroke="#adb8c2" strokeWidth="2" fill="none">
            <rect
              x="37"
              y="15"
              width="84"
              height="90"
              rx="18"
              fill={`url(#${id}metal)`}
            />
            <path
              d="M64 106V127C64 151 149 151 149 115V59"
              stroke="#343e49"
              strokeWidth="9"
            />
            <rect
              x="138"
              y="39"
              width="21"
              height="35"
              rx="7"
              fill={`url(#${id}metal)`}
            />
          </g>
        ) : kind === "fan" ? (
          <g>
            <path
              d="M90 94V135M64 138H117"
              stroke={`url(#${id}edge)`}
              strokeWidth="9"
              strokeLinecap="round"
            />
            <circle
              cx="90"
              cy="63"
              r="49"
              fill={`url(#${id}metal)`}
              stroke="#adb8c2"
              strokeWidth="3"
            />
            {[0, 120, 240].map((angle) => (
              <path
                key={angle}
                d="M90 63C54 41 76 10 97 26C116 41 105 59 90 63Z"
                fill="#808e9c"
                transform={`rotate(${angle} 90 63)`}
              />
            ))}
            <circle cx="90" cy="63" r="9" fill="#c4cbd0" />
          </g>
        ) : (
          <g>
            {kind === "floor" && (
              <path
                d="M96 49V138M71 140H120"
                stroke={`url(#${id}edge)`}
                strokeWidth="5"
              />
            )}
            {kind === "desk" && (
              <path
                d="M92 70L70 115M70 115H115M66 118H119"
                stroke={`url(#${id}edge)`}
                strokeWidth="6"
              />
            )}
            {kind === "ceiling" || kind === "spot" ? (
              <>
                <ellipse
                  cx="90"
                  cy="75"
                  rx="65"
                  ry="30"
                  fill={`url(#${id}metal)`}
                  stroke="#aeb7c0"
                  strokeWidth="3"
                />
                <ellipse
                  cx="90"
                  cy="79"
                  rx="47"
                  ry="17"
                  fill={active ? "#ffe0a1" : "#c0c5cb"}
                />
              </>
            ) : kind === "bulb" ? (
              <>
                <path
                  d="M65 97C63 84 43 74 47 50C53 9 118 8 130 45C137 70 116 84 114 97Z"
                  fill={`url(#${id}white)`}
                  stroke="#aeb7c0"
                />
                <path d="M65 98H113L108 119H70Z" fill={`url(#${id}metal)`} />
                <path d="M71 123H107" stroke="#9ca8b4" strokeWidth="5" />
              </>
            ) : (
              <>
                <path d="M89 14V39" stroke="#7f8b97" strokeWidth="2" />
                <path
                  d="M68 42H112L146 98H34Z"
                  fill={`url(#${id}metal)`}
                  stroke="#aeb7c0"
                />
                <ellipse
                  cx="90"
                  cy="99"
                  rx="56"
                  ry="10"
                  fill={active ? "#ffdda2" : "#aeb7c0"}
                />
              </>
            )}
            {active && (
              <ellipse
                cx="90"
                cy="108"
                rx="75"
                ry="38"
                fill={`url(#${id}warm)`}
              />
            )}
          </g>
        )}
      </svg>
    </div>
  );
}
