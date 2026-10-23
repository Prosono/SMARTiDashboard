import { Check } from "lucide-react";
export const palettes = [
  {
    id: "smarti",
    nb: "SMARTi",
    en: "SMARTi",
    colors: ["#26312c", "#e66c22", "#f3f4f0"],
    note: ["Varm og original", "Warm and original"],
  },
  {
    id: "smarti-black",
    nb: "SMARTi Sort",
    en: "SMARTi Black",
    colors: ["#000000", "#ff7900", "#202020"],
    note: [
      "Rent svart og oransje i mørk visning",
      "Pure black and orange in dark mode",
    ],
  },
  {
    id: "midnight",
    nb: "Midnatt",
    en: "Midnight",
    colors: ["#101629", "#9bb8f3", "#edf1fa"],
    note: ["Dyp marineblå", "Deep navy blue"],
  },
  {
    id: "copper",
    nb: "Kobber",
    en: "Copper",
    colors: ["#291b18", "#e4a38c", "#faf1ed"],
    note: ["Varm terrakotta og kobber", "Warm terracotta and copper"],
  },
  {
    id: "graphite",
    nb: "Grafitt",
    en: "Graphite",
    colors: ["#18181b", "#bcbcc6", "#f1f1f3"],
    note: [
      "Nøytral grå, uten fargestikk",
      "Neutral grey, without a color cast",
    ],
  },
  {
    id: "fjord",
    nb: "Fjord",
    en: "Fjord",
    colors: ["#183b52", "#397895", "#eff4f8"],
    note: ["Kjølig blå og rolig", "Cool blue and calm"],
  },
  {
    id: "forest",
    nb: "Skog",
    en: "Forest",
    colors: ["#203f35", "#538365", "#eef3eb"],
    note: ["Naturlig grønn", "Natural green"],
  },
  {
    id: "sand",
    nb: "Sand",
    en: "Sand",
    colors: ["#493a30", "#ac7650", "#f6f0e6"],
    note: ["Lun og jordnær", "Warm and earthy"],
  },
  {
    id: "plum",
    nb: "Plomme",
    en: "Plum",
    colors: ["#443247", "#956285", "#f5eff5"],
    note: ["Dempet og elegant", "Soft and elegant"],
  },
] as const;
export function PalettePicker({
  value,
  change,
  lang,
}: {
  value: string;
  change: (value: string) => void;
  lang: string;
}) {
  const en = lang === "en";
  return (
    <fieldset className="palette-picker">
      <legend>{en ? "Color palette" : "Fargepalett"}</legend>
      <p>
        {en
          ? "Combine your palette with light or dark mode."
          : "Kombiner paletten med lys eller mørk visning."}
      </p>
      <div className="palette-options">
        {palettes.map((p) => (
          <button
            type="button"
            key={p.id}
            aria-pressed={value === p.id}
            aria-label={`${en ? "Palette" : "Palett"}: ${en ? p.en : p.nb}`}
            onClick={(e) => {
              change(p.id);
              const details = e.currentTarget.closest("details");
              if (details) {
                details.open = false;
                details.querySelector("summary")?.focus();
              }
            }}
          >
            <span className="palette-swatches" aria-hidden="true">
              {p.colors.map((c) => (
                <i key={c} style={{ background: c }} />
              ))}
            </span>
            <span>
              <strong>{en ? p.en : p.nb}</strong>
              <small>{p.note[en ? 1 : 0]}</small>
            </span>
            {value === p.id && <Check size={17} />}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
