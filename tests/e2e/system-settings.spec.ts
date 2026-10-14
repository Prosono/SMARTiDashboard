import { test, expect } from "../../frontend/node_modules/@playwright/test";
test("home settings location and household editing stay in dialogs", async ({ page }) => {
 let saved:any, personSaved:any;
 await page.route("**/api/manage/settings/**", async route=>{
  const req=route.request(),url=req.url();
  if(req.method()==="PUT"){saved=req.postDataJSON();return route.fulfill({json:{saved:true}});}
  if(req.method()==="POST"){personSaved=req.postDataJSON();return route.fulfill({json:{id:"p"}});}
  if(url.endsWith("/zones"))return route.fulfill({json:[]});
  if(url.endsWith("/operations"))return route.fulfill({json:[]});
  if(url.endsWith("/home"))return route.fulfill({json:{location_name:"Mitt hjem",latitude:58.1,longitude:8,elevation:12,time_zone:"Europe/Oslo"}});
  if(url.endsWith("/people"))return route.fulfill({json:{people:[],trackers:[{id:"device_tracker.phone",name:"Telefon"}]}});
  return route.fulfill({json:{demo:false,unavailable:[],host:{hostname:"SMARTi sentral",operating_system:"Home Assistant OS",disk_free:32,disk_used:32,disk_total:64},core:{cpu_percent:12,memory_percent:25,memory_usage:1024,memory_limit:4096},network:[{interface:"eth0",type:"ethernet",connected:true,primary:true,addresses:["192.168.1.2/24"]}],backups:[{slug:"a",name:"Home Assistant backup",date:"2026-10-14T08:00:00Z",size:300,type:"full",protected:true}]}});
 });
 await page.goto("/");
 await page.getByLabel("Brukernavn",{exact:true}).fill("tester");
 await page.getByLabel("Passord",{exact:true}).fill("test-password-not-for-live");
 await page.getByRole("button",{name:"Logg inn",exact:true}).click();
 await page.getByRole("navigation").getByRole("button",{name:"Mer",exact:true}).click();
 await expect(page.getByText("SMARTi backup",{exact:true})).toBeVisible();
 await expect(page.getByText("192.168.1.2/24",{exact:false})).toBeVisible();
 await page.getByRole("button",{name:"Endre plassering"}).click();
 const dialog=page.getByRole("dialog",{name:"Hjemmets plassering"});
 await dialog.getByLabel("Hjemmets navn").fill("Huset vårt");
 await dialog.getByRole("button",{name:"Lagre plassering"}).click();
 await expect(dialog).toHaveCount(0);expect(saved.location_name).toBe("Huset vårt");
 await page.getByRole("button",{name:"Legg til person uten innlogging",exact:true}).click();
 const person=page.getByRole("dialog",{name:"Legg til person"});
 await person.getByLabel("Navn",{exact:true}).fill("Ola");
 await person.getByLabel("Telefon",{exact:true}).check();
 await person.getByRole("button",{name:"Lagre person"}).click();
 await expect(person).toHaveCount(0);expect(personSaved).toEqual({name:"Ola",device_trackers:["device_tracker.phone"]});
 await page.locator(".home-settings").screenshot({path:`test-results/system-settings-${test.info().project.name}.png`});
});
