import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("factory reset is advanced-only, explains pairing limits and stays blocked without a provider", async ({page}) => {
  await page.goto('/');
  await page.getByLabel('Brukernavn',{exact:true}).fill('tester');
  await page.getByLabel('Passord',{exact:true}).fill('test-password-not-for-live');
  await page.getByRole('button',{name:'Logg inn',exact:true}).click();
  await page.getByRole('button',{name:'Innstillinger',exact:true}).first().click();
  await page.getByRole('button',{name:/^Avansert/}).click();
  await page.getByRole('navigation',{name:'Innstillingskategorier'}).getByRole('button',{name:'System',exact:true}).click();
  await page.getByRole('button',{name:'Se hva som tilbakestilles'}).click();
  const dialog=page.getByRole('dialog',{name:'Tilbakestill huben?'});
  await expect(dialog).toContainText('Noen paringer kan bli igjen');
  await expect(dialog).toContainText('Ingen data er slettet');
  await dialog.getByLabel('Sikkerhetskopi',{exact:true}).selectOption('skip');
  await dialog.getByRole('checkbox').nth(0).check();
  await dialog.getByRole('checkbox').nth(1).check();
  await dialog.getByLabel('Skriv RESET HUB for å bekrefte').fill('RESET HUB');
  await dialog.getByLabel('Passordet til din administratorkonto').fill('test-password-not-for-live');
  await expect(dialog.getByRole('button',{name:'Start tilbakestilling'})).toBeDisabled();
  await dialog.screenshot({path:`/tmp/smarti-factory-reset-${test.info().project.name}.png`});
  await dialog.getByRole('button',{name:'Avbryt',exact:true}).click();
  await page.getByRole('button',{name:'Se hva som tilbakestilles'}).click();
  await expect(page.getByLabel('Passordet til din administratorkonto')).toHaveValue('');
  await page.getByRole('button',{name:'Avbryt',exact:true}).click();
  await page.getByRole('button',{name:/^Normal/}).click();
  await expect(page.locator('.factory-reset-panel')).toHaveCount(0);
});

test("reset request shows durable incomplete report instead of success", async ({page}) => {
  await page.goto('/');
  await page.getByLabel('Brukernavn',{exact:true}).fill('tester');
  await page.getByLabel('Passord',{exact:true}).fill('test-password-not-for-live');
  await page.getByRole('button',{name:'Logg inn',exact:true}).click();
  await page.getByRole('button',{name:'Innstillinger',exact:true}).first().click();
  await page.getByRole('button',{name:/^Avansert/}).click();
  let job:any=null;let writes=0;
  await page.route('**/api/manage/settings/factory-reset', async route => {
    if(route.request().method()==='POST'){
      writes++;const body=route.request().postDataJSON();
      expect(body.acknowledge_manual_cleanup).toBe(true);
      expect(body.password).toBe('test-password-not-for-live');
      job={id:body.request_id,status:'incomplete',step:'finished',error:'',results:[{kind:'zigbee',name:'Testlampe',status:'done',reason:''},{kind:'manual',name:'Z-Wave',status:'manual',reason:'zwave_exclusion_required'}]};
      return route.fulfill({status:202,json:job});
    }
    return route.fulfill({json:{ready:true,blockers:[],job}});
  });
  await page.getByRole('navigation',{name:'Innstillingskategorier'}).getByRole('button',{name:'System',exact:true}).click();
  await page.getByRole('button',{name:'Se hva som tilbakestilles'}).click();
  const dialog=page.getByRole('dialog',{name:'Tilbakestill huben?'});
  await dialog.getByLabel('Sikkerhetskopi',{exact:true}).selectOption('saved');
  for(const checkbox of await dialog.getByRole('checkbox').all()) await checkbox.check();
  await dialog.getByLabel('Skriv RESET HUB for å bekrefte').fill('RESET HUB');
  await dialog.getByLabel('Passordet til din administratorkonto').fill('test-password-not-for-live');
  await dialog.getByRole('button',{name:'Start tilbakestilling',exact:true}).click();
  await expect(dialog).toContainText('Tilbakestillingen er ikke fullført');
  await expect(dialog).toContainText('Må følges opp manuelt');
  await expect(dialog).toContainText('Testlampe');
  expect(writes).toBe(1);
  await dialog.getByRole('button',{name:'Lukk',exact:true}).click();
  await page.getByRole('button',{name:'Se hva som tilbakestilles'}).click();
  await expect(page.getByRole('dialog')).toContainText('Tilbakestillingen er ikke fullført');
  expect(writes).toBe(1);
});
