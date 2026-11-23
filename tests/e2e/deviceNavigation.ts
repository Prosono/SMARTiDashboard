import { expect, type Page } from "../../frontend/node_modules/@playwright/test";

export const deviceWorkspace = (page: Page) =>
  page.getByRole("region", { name: "Enheter", exact: true });

const categoryNames = {
  all: "Alle kontroller",
  groups: "Grupper",
  scenes: "Scener",
  zigbee2mqtt: "Zigbee",
  zwave_js: "Z-Wave",
  discovered: /^Oppdaget(?: \d+)?$/,
  hidden: "Skjulte enheter",
};

export async function selectDeviceCategory(
  page: Page,
  category: keyof typeof categoryNames,
) {
  const workspace = deviceWorkspace(page);
  await expect(workspace).toBeVisible();
  const picker = workspace.getByRole("combobox", { name: "Enhetskategori" });
  if (await picker.isVisible()) {
    await picker.selectOption(category);
  } else {
    await workspace
      .getByRole("navigation", { name: "Enhetskategorier" })
      .getByRole("button", { name: categoryNames[category], exact: true })
      .click();
  }
}

export async function openDeviceOverview(page: Page, type: "light" | "climate") {
  const workspace = deviceWorkspace(page);
  await workspace
    .getByRole("combobox", { name: "Type", exact: true })
    .selectOption(type);
  await workspace
    .getByRole("button", {
      name: type === "light" ? "Lysstyring" : "Klimastyring",
      exact: true,
    })
    .click();
}

export const deviceSearch = (page: Page) =>
  deviceWorkspace(page).getByRole("searchbox", {
    name: "Søk etter kontroll eller rom",
  });

export const deviceRow = (page: Page, name: string) =>
  deviceWorkspace(page)
    .getByRole("list", { name: "Enheter", exact: true })
    .getByRole("button")
    .filter({ has: page.getByText(name, { exact: true }) });

export async function openDeviceControl(page: Page, name: string) {
  await deviceSearch(page).fill(name);
  await deviceRow(page, name).click();
  await page
    .getByRole("button", { name: "Åpne kontroll", exact: true })
    .click();
  return page.getByRole("dialog", { name, exact: true });
}
