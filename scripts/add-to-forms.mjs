// Adds the "Card Studio" tab to the conversation forms (or removes it).
//
//   node scripts/add-to-forms.mjs --org https://yourorg.crm.dynamics.com [--forms "Active Conversation,Conversation Form"] [--remove]
//
// "all" (the default) = every main conversation form agents can open, except portal / web / mobile / card forms.
// Authentication: Azure CLI (az login) by default, or set DATAVERSE_TOKEN to a bearer token for the org.
// Idempotent. It changes the forms you name (unmanaged layer) and publishes them.
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf("--" + n); return i > -1 ? args[i + 1] : d; };
const ORG = (opt("org") || "").replace(/\/$/, "");
const FORMS = (opt("forms") || "all").split(",").map((s) => s.trim()).filter(Boolean);
const REMOVE = args.includes("--remove");
if (!ORG) { console.error('Usage: node scripts/add-to-forms.mjs --org <url> [--forms "<form name>,<form name>"] [--remove]'); process.exit(1); }

const token = process.env.DATAVERSE_TOKEN || execSync(`az account get-access-token --resource ${ORG} --query accessToken -o tsv`, { encoding: "utf8", shell: true }).trim();
const API = ORG + "/api/data/v9.2/";
async function call(method, path, body) {
  const r = await fetch(API + path, {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", Accept: "application/json", "OData-Version": "4.0" },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

const WR_NAME = "wacs_/cards.html";
const TAB = "wacs_cardstudio_tab", SECTION = "wacs_cardstudio_section";
const control = `<control id="WebResource_wacs_cards" classid="{9FDF5F91-88B1-47f4-AD53-C11EFC01A01D}"><parameters><Url>${WR_NAME}</Url><PassParameters>false</PassParameters><Security>false</Security><Scrolling>auto</Scrolling><Border>false</Border></parameters></control>`;
const tab = `<tab name="${TAB}" id="{c4d50001-0000-4000-8000-0000000000a1}" IsUserDefined="1" expanded="true" showlabel="true"><labels><label description="Card Studio" languagecode="1033" /></labels><columns><column width="100%"><sections><section name="${SECTION}" id="{c4d50001-0000-4000-8000-0000000000b1}" IsUserDefined="1" showlabel="false" showbar="false" columns="1"><labels><label description="Card Studio" languagecode="1033" /></labels><rows><row><cell id="{c4d50001-0000-4000-8000-0000000000b2}" showlabel="false" colspan="1" rowspan="14"><labels><label description="Card Studio" languagecode="1033" /></labels>${control}</cell></row>${"<row />".repeat(13)}</rows></section></sections></column></columns></tab>`;
const strip = (xml) => xml
  .replace(new RegExp(`<tab name="${TAB}"[\\s\\S]*?</tab>`), "")
  .replace(new RegExp(`<section name="${SECTION}"[\\s\\S]*?</section>`), "");

const SKIP = /portal|web form|mobile|card|in context|profile cases|timelinewall|interactive experience/i;
const all = FORMS.some((f) => f.toLowerCase() === "all");
let found = (await call("GET", `systemforms?$filter=${encodeURIComponent("objecttypecode eq 'msdyn_ocliveworkitem' and type eq 2")}&$select=formid,name,formxml`)).value;
found = all ? found.filter((f) => !SKIP.test(f.name)) : found.filter((f) => FORMS.includes(f.name));
if (!found.length) { console.log("! no matching conversation form found"); process.exit(1); }

for (const f of found) {
  let xml = strip(f.formxml);
  if (!REMOVE) {
    const m = /<tabs>/.exec(xml);
    if (!m) throw new Error("unexpected form XML (no <tabs>)");
    const at = m.index + m[0].length;
    xml = xml.slice(0, at) + tab + xml.slice(at);
  }
  await call("PATCH", `systemforms(${f.formid})`, { formxml: xml });
  console.log(`${REMOVE ? "removed from" : "updated"}: ${f.name}`);
}
await call("POST", "PublishXml", { ParameterXml: "<importexportxml><entities><entity>msdyn_ocliveworkitem</entity></entities></importexportxml>" });
console.log("published");
