// One-command installer for WhatsApp Card Studio.
//
//   node scripts/install.mjs --org https://yourorg.crm.dynamics.com
//
// Every step is safe to run twice:
//   1. checks that the environment has Contact Center / Omnichannel (table msdyn_ocliveworkitem)
//   2. imports the managed solution (uses dist/ if built, otherwise downloads the latest release)
//   3. adds the "Card Studio" tab to the conversation forms
//   4. creates the "Card Studio Suggest" Copilot prompt that picks cards for the live conversation
//
// Options:
//   --org <url>        required. Your environment URL.
//   --forms <names>    conversation forms to extend. Default: "all" (every main conversation form).
//   --zip <path>       use this solution zip instead of dist/ or the latest release.
//   --skip-forms       do not touch any form.
//   --skip-prompt      do not create the Copilot prompt (suggestions then use keyword matching).
//   --force            import even if the same or a newer version is installed.
//   --dry-run          show what would happen and change nothing.
//
// Sign-in: Azure CLI (az login) or a bearer token in DATAVERSE_TOKEN. You sign in yourself.
import { execSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf("--" + n); return i > -1 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d; };
const flag = (n) => args.includes("--" + n);
const ORG = (opt("org") || "").replace(/\/$/, "");
const DRY = flag("dry-run");
if (!ORG) { console.error("Usage: node scripts/install.mjs --org https://yourorg.crm.dynamics.com [--dry-run]"); process.exit(1); }

const SOLUTION = "WhatsAppCardStudio";
const REPO = "moliveirapinto/d365-whatsapp-card-studio";
const step = (n, t) => console.log(`\n[${n}] ${t}`);
const ok = (t) => console.log("  OK   " + t);
const warn = (t) => console.log("  WARN " + t);
const fail = (t) => { console.error("  FAIL " + t); process.exit(1); };

let token = process.env.DATAVERSE_TOKEN;
if (!token) {
  try { token = execSync(`az account get-access-token --resource ${ORG} --query accessToken -o tsv`, { encoding: "utf8", shell: true, stdio: ["ignore", "pipe", "pipe"] }).trim(); }
  catch { fail("Not signed in. Run `az login` with an account that is System Administrator in this environment, then run this again."); }
}
const API = ORG + "/api/data/v9.2/";
async function call(method, path, body) {
  const r = await fetch(API + path, {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", Accept: "application/json", "OData-Version": "4.0" },
  });
  const text = await r.text();
  if (!r.ok) { const e = new Error(`${method} ${path} -> ${r.status} ${text.slice(0, 400)}`); e.status = r.status; throw e; }
  return text ? JSON.parse(text) : null;
}
const versionGte = (a, b) => {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 4; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return true;
};

step(1, "Checking the environment");
try { await call("GET", "WhoAmI"); } catch (e) { fail("Cannot reach " + ORG + ". " + e.message); }
ok("Signed in to " + ORG);
try { await call("GET", "EntityDefinitions(LogicalName='msdyn_ocliveworkitem')?$select=LogicalName"); }
catch { fail("This environment has no Conversation table (msdyn_ocliveworkitem). Install Dynamics 365 Contact Center or Omnichannel for Customer Service first."); }
ok("Contact Center / Omnichannel is installed");

step(2, "Installing the solution");
let zip = opt("zip");
if (!zip) {
  const dist = join(root, "dist");
  const found = existsSync(dist) ? readdirSync(dist).filter((f) => /_managed\.zip$/.test(f)).sort() : [];
  if (found.length) zip = join(dist, found[found.length - 1]);
}
if (!zip) {
  console.log("  No local zip. Downloading the latest release...");
  const rel = await (await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { "User-Agent": "card-studio-installer" } })).json();
  const asset = (rel.assets || []).find((a) => /_managed\.zip$/.test(a.name));
  if (!asset) fail("No managed zip found in the latest release. Download it manually and pass --zip <path>.");
  zip = join(mkdtempSync(join(tmpdir(), "cardstudio-")), asset.name);
  writeFileSync(zip, Buffer.from(await (await fetch(asset.browser_download_url)).arrayBuffer()));
}
if (!existsSync(zip)) fail("Solution zip not found: " + zip);
const m = /_(\d+\.\d+\.\d+)_/.exec(zip);
const zipVersion = m ? m[1] + ".0" : "0.0.0.0";
const installed = (await call("GET", `solutions?$filter=uniquename eq '${SOLUTION}'&$select=version`)).value[0];
if (installed && versionGte(installed.version, zipVersion) && !flag("force")) {
  ok(`Already installed (version ${installed.version}). Skipping import (use --force to reinstall).`);
} else if (DRY) {
  ok(`Would import ${zip} (${zipVersion})`);
} else {
  console.log(`  Importing ${zip} ...`);
  try {
    await call("POST", "ImportSolution", { CustomizationFile: readFileSync(zip).toString("base64"), OverwriteUnmanagedCustomizations: true, PublishWorkflows: true, ImportJobId: randomUUID() });
  } catch (e) {
    if (e.status) fail("Import failed. " + e.message);
    console.log("  The connection closed while the import was running. Waiting for it to finish...");
    let done = false;
    for (let i = 0; i < 40 && !done; i++) {
      await new Promise((res) => setTimeout(res, 15000));
      try { const s = (await call("GET", `solutions?$filter=uniquename eq '${SOLUTION}'&$select=version`)).value[0]; done = !!s && versionGte(s.version, zipVersion); } catch { /* keep waiting */ }
    }
    if (!done) fail("Import did not finish in 10 minutes. Check Solution History in the maker portal.");
  }
  ok("Solution imported (version " + zipVersion + ")");
}

step(3, "Adding the Card Studio tab to the conversation forms");
if (flag("skip-forms")) ok("Skipped (--skip-forms). Run scripts/add-to-forms.mjs later.");
else if (DRY) ok("Would add the tab to: " + opt("forms", "all"));
else {
  const r = spawnSync(process.execPath, [join(here, "add-to-forms.mjs"), "--org", ORG, "--forms", opt("forms", "all")], { stdio: "inherit", env: { ...process.env, DATAVERSE_TOKEN: token } });
  if (r.status !== 0) warn("Adding to the forms failed. See the README to add the tab by hand."); else ok("Forms updated and published");
}

step(4, "Creating the Copilot suggestion prompt");
if (flag("skip-prompt")) ok("Skipped (--skip-prompt). Suggestions will use keyword matching.");
else if (DRY) ok("Would create the prompt \"Card Studio Suggest\"");
else {
  const r = spawnSync(process.execPath, [join(here, "create-prompt.mjs"), "--org", ORG], { stdio: "inherit", env: { ...process.env, DATAVERSE_TOKEN: token } });
  if (r.status !== 0) warn("Could not create the prompt (AI Builder may not be available). Card Studio still works and uses keyword matching."); else ok("Prompt created and published");
}

console.log("\nDone. Open a live WhatsApp conversation and look for the Card Studio tab.");
console.log("Agents who cannot run the suggestions need the role \"WhatsApp Card Studio User\" (read access to AI Builder prompts).");
