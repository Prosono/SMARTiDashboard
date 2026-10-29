import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Settings2 } from "lucide-react";
import { LightDefault, LightBulb, LightPendant, LightFloor, LightDesk, LightCeiling, LightStrip, LightSpot, LightOutdoor } from "./LightIcons";
import type { Control } from "./types";
import { SettingsDialog } from "./home/SettingsDialog";
import { api } from "./api";
import "./lightAppearance.css";
const icons = [
  {id:"auto", nb:"Standard", en:"Default", Icon:LightDefault},
  {id:"bulb", nb:"Lyspære", en:"Bulb", Icon:LightBulb},
  {id:"pendant", nb:"Pendellampe", en:"Pendant", Icon:LightPendant},
  {id:"floor", nb:"Gulvlampe", en:"Floor lamp", Icon:LightFloor},
  {id:"desk", nb:"Bordlampe", en:"Table lamp", Icon:LightDesk},
  {id:"ceiling", nb:"Taklys", en:"Ceiling light", Icon:LightCeiling},
  {id:"strip", nb:"LED-list", en:"LED strip", Icon:LightStrip},
  {id:"sun", nb:"Spotlys", en:"Spotlight", Icon:LightSpot},
  {id:"outdoor", nb:"Vegg / utelys", en:"Wall / outdoor", Icon:LightOutdoor},
];
export function lightIcon(c: Control) {
  return icons.find(i => i.id === c.attributes.smarti_icon)?.Icon || LightDefault;
}
export function LightAppearance({c, lang, disabled}: {c:Control;lang:string;disabled:boolean}) {
  const [open,setOpen]=useState(false), [name,setName]=useState(c.name), [icon,setIcon]=useState(String(c.attributes.smarti_icon || "auto"));
  const [busy,setBusy]=useState(false), [error,setError]=useState("");
  const qc=useQueryClient();
  const t=(nb:string,en:string)=>lang==="en"?en:nb;
  async function save(reset=false) {
    setBusy(true);setError("");
    try {
      await api(`controls/${encodeURIComponent(c.entity_id)}/appearance`,"PUT",{name:reset?"":name.trim(),icon:reset?"auto":icon});
      await qc.invalidateQueries({queryKey:["home"]});setOpen(false);
    } catch {setError(t("Kunne ikke lagre. Prøv igjen.","Could not save. Try again."));}
    finally {setBusy(false);}
  }
  return <>
    <button className="light-appearance-open" disabled={disabled} onClick={()=>{setName(c.name);setIcon(String(c.attributes.smarti_icon||"auto"));setError("");setOpen(true);}}><Settings2 size={18}/>{t("Tilpass lys","Customize light")}</button>
    {open && <SettingsDialog title={t("Tilpass lys","Customize light")} lang={lang} busy={busy} compact onClose={()=>{if(!busy)setOpen(false);}}>
      <form className="light-appearance-form" onSubmit={e=>{e.preventDefault();void save();}}>
        <p>{t("Navn og ikon vises for alle i dette SMARTi-hjemmet. Automasjonene beholdes.","Name and icon apply to everyone in this SMARTi home. Automations are preserved.")}</p>
        <label>{t("Navn","Name")}<input value={name} maxLength={80} required disabled={busy} onChange={e=>setName(e.target.value)}/></label>
        <fieldset disabled={busy}><legend>{t("Velg ikon","Choose icon")}</legend><div className="light-icon-options">{icons.map(({id,nb,en,Icon})=><button type="button" key={id} aria-pressed={icon===id} onClick={()=>setIcon(id)}><Icon size={48}/><span>{t(nb,en)}</span></button>)}</div></fieldset>
        {error && <p role="alert">{error}</p>}
        <footer><button type="button" disabled={busy} onClick={()=>void save(true)}>{t("Bruk standard","Use defaults")}</button><button className="primary" disabled={busy||!name.trim()}>{busy?t("Lagrer…","Saving…"):t("Lagre","Save")}</button></footer>
      </form>
    </SettingsDialog>}
  </>;
}
