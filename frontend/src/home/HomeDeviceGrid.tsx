import type { Control, Home } from "../types";
import { HomeGrid, type HomeGridCard } from "./HomeGrid";
import type { HomeGridPage } from "./homeGridModel";
import { HomeDeviceCard } from "./HomeDeviceCard";

export function deviceGridCards({
  controls,
  home,
  offline,
  lang,
  visible,
}: {
  controls: Control[];
  home: Home;
  offline: boolean;
  lang: string;
  visible?: Set<string>;
}): HomeGridCard[] {
  return controls.slice(0, 290).map((c) => ({
    id: `device:${c.entity_id}`,
    entityId: c.entity_id,
    title: c.name,
    hidden: visible ? !visible.has(c.entity_id) : false,
    content: <HomeDeviceCard c={c} home={home} lang={lang} offline={offline} />,
  }));
}

export function HomeDeviceGrid({
  page,
  controls,
  home,
  offline,
  lang,
  visible,
}: {
  page: HomeGridPage;
  controls: Control[];
  home: Home;
  offline: boolean;
  lang: string;
  visible?: Set<string>;
}) {
  return (
    <HomeGrid
      page={page}
      home={home}
      offline={offline}
      cards={deviceGridCards({ controls, home, offline, lang, visible })}
      lang={lang}
    />
  );
}
