import {test, expect} from "../../frontend/node_modules/@playwright/test";
test("edit native group options and find scene creation", async ({page}) => {
  await page.route("**/api/groups", r => r.fulfill({json:[{id:"ha:light.existing",name:"Stuelys",source:"home_assistant",config_entry_id:"helper",entities:["light.living_pendant"],revision:"",actions:[],available:true}]}));
  await page.route("**/api/manage/integration-setup/group-options/light.existing", r => r.fulfill({json:{type:"form",domain:"group",flow_id:"options",step_id:"light",translations:{"component.group.config.step.light.data.entities":"Medlemmer","component.group.config.step.light.data.hide_members":"Skjul medlemmer"},data_schema:[{name:"entities",required:true,selector:{entity:{domain:"light",multiple:true}},description:{suggested_value:["light.living_pendant"]}},{name:"hide_members",selector:{boolean:{}},default:true}]}}));
  let saved = false;
  await page.route("**/api/manage/integration-setup/flows/options", r => {
    if(r.request().method()==="POST") {const body=r.request().postDataJSON(); expect(body.entities).toEqual(["light.living_pendant"]); expect(body.hide_members).toBe(false); saved=true; return r.fulfill({json:{type:"create_entry",domain:"group",flow_id:"options",translations:{}}});}
    return r.fulfill({json:{cancelled:true}});
  });
  await page.goto("/");
  await page.getByLabel("Brukernavn",{exact:true}).fill("tester");
  await page.getByLabel("Passord",{exact:true}).fill("test-password-not-for-live");
  await page.getByRole("button",{name:"Logg inn",exact:true}).click();
  await page.getByRole("navigation",{name:"Hovedmeny"}).getByRole("button",{name:"Enheter",exact:true}).click();
  await page.getByRole("button",{name:"Grupper",exact:true}).click();
  await page.getByRole("button",{name:"Rediger gruppe",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"Rediger gruppe"});
  await expect(dialog.getByRole("listbox",{name:"Medlemmer *",exact:true})).toHaveValues(["light.living_pendant"]);
  await dialog.getByLabel("Skjul medlemmer",{exact:true}).uncheck();
  await dialog.getByRole("button",{name:"Fortsett",exact:true}).click();
  await expect(dialog).toContainText("Gruppen er oppdatert"); expect(saved).toBe(true);
  await dialog.getByRole("button",{name:"Ferdig",exact:true}).click();
  await page.getByRole("button",{name:"Scener",exact:true}).click();
  await page.getByRole("button",{name:"Lag scene",exact:true}).click();
  await expect(page.getByRole("dialog",{name:"Din nye scene"})).toBeVisible();
});
