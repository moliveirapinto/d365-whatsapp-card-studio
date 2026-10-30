// Builds the importable Dataverse solution (managed + unmanaged zips) from ./src with no dependencies.
// Usage: node build/build.mjs [--version 1.0.0.0]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > -1 ? process.argv[i + 1] : d; };
const VERSION = arg("version", JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version + ".0");
const SOLUTION = "WhatsAppCardStudio";

// Fixed ids so that upgrades replace the same components in every environment.
const WEB_RESOURCE = { id: "7c1f2d58-3b8e-4f4a-9a6d-1e5b0c9d4a21", name: "wacs_/cards.html", display: "WhatsApp Card Studio" };
// Lets agents run the "Card Studio Suggest" Copilot prompt that picks cards for the live conversation.
const ROLE = { id: "b4e7a9c2-5d13-4c68-8f0a-3a2d6e91c755", name: "WhatsApp Card Studio User",
  privileges: ["prvReadmsdyn_AIModel", "prvReadmsdyn_AITemplate"] };

const br = (id) => "{" + id.toLowerCase() + "}";
const partName = (w) => w.name.replace(/[/.]/g, "") + w.id.toUpperCase();

// The page is one file; the Fluent System Icons (MIT) are inlined at build time.
const html = readFileSync(join(root, "src", "cards.html"), "utf8").replace(/\r\n/g, "\n")
  .replace("/*__ICONS__*/{}", () => readFileSync(join(root, "src", "icons.json"), "utf8").trim());
if (html.includes("/*__ICONS__*/")) throw new Error("icons placeholder was not replaced");

function solutionXml(managed) {
  return `<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml version="9.2.0.0" SolutionPackageVersion="9.2" languagecode="1033" generatedBy="CrmLive" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <SolutionManifest>
    <UniqueName>${SOLUTION}</UniqueName>
    <LocalizedNames><LocalizedName description="WhatsApp Card Studio" languagecode="1033" /></LocalizedNames>
    <Descriptions><Description description="Interactive WhatsApp messages for human agents: quick replies, list menus, link buttons, photo carousels and location messages, with Copilot suggestions." languagecode="1033" /></Descriptions>
    <Version>${VERSION}</Version>
    <Managed>${managed ? 1 : 0}</Managed>
    <Publisher>
      <UniqueName>whatsappcardstudio</UniqueName>
      <LocalizedNames><LocalizedName description="WhatsApp Card Studio" languagecode="1033" /></LocalizedNames>
      <Descriptions />
      <EMailAddress xsi:nil="true"></EMailAddress>
      <SupportingWebsiteUrl xsi:nil="true"></SupportingWebsiteUrl>
      <CustomizationPrefix>wacs</CustomizationPrefix>
      <CustomizationOptionValuePrefix>41532</CustomizationOptionValuePrefix>
      <Addresses />
    </Publisher>
    <RootComponents>
      <RootComponent type="20" id="${br(ROLE.id)}" behavior="0" />
      <RootComponent type="61" schemaName="${WEB_RESOURCE.name}" behavior="0" />
    </RootComponents>
    <MissingDependencies />
  </SolutionManifest>
</ImportExportXml>`;
}

function customizationsXml() {
  return `<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Entities></Entities>
  <Roles>
    <Role id="${br(ROLE.id)}" name="${ROLE.name}">
      <IsCustomizable>1</IsCustomizable>
      <IsAutoAssigned>0</IsAutoAssigned>
      <RolePrivileges>
${ROLE.privileges.map((p) => `        <RolePrivilege name="${p}" level="Global" />`).join("\n")}
      </RolePrivileges>
    </Role>
  </Roles>
  <Workflows></Workflows>
  <FieldSecurityProfiles></FieldSecurityProfiles>
  <Templates />
  <EntityMaps />
  <EntityRelationships />
  <OrganizationSettings />
  <optionsets />
  <WebResources>
    <WebResource>
      <WebResourceId>${br(WEB_RESOURCE.id)}</WebResourceId>
      <Name>${WEB_RESOURCE.name}</Name>
      <DisplayName>${WEB_RESOURCE.display}</DisplayName>
      <WebResourceType>1</WebResourceType>
      <IntroducedVersion>${VERSION}</IntroducedVersion>
      <IsEnabledForMobileClient>0</IsEnabledForMobileClient>
      <IsAvailableForMobileOffline>0</IsAvailableForMobileOffline>
      <IsCustomizable>1</IsCustomizable>
      <CanBeDeleted>1</CanBeDeleted>
      <IsHidden>0</IsHidden>
      <FileName>/WebResources/${partName(WEB_RESOURCE)}</FileName>
    </WebResource>
  </WebResources>
  <CustomControls />
  <EntityDataProviders />
  <Languages><Language>1033</Language></Languages>
</ImportExportXml>`;
}

function contentTypes() {
  return `<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/octet-stream" /><Override PartName="/WebResources/${partName(WEB_RESOURCE)}" ContentType="application/octet-stream" /></Types>`;
}

// Minimal zip writer (deflate, fixed timestamp so builds are reproducible).
function zip(entries) {
  const local = [], central = []; let offset = 0;
  const dosTime = 0, dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const [name, data] of entries) {
    const nameBuf = Buffer.from(name, "utf8"), raw = Buffer.from(data), comp = deflateRawSync(raw), crc = crc32(raw) >>> 0;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    local.push(lh, nameBuf, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(dosTime, 12); ch.writeUInt16LE(dosDate, 14); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}

mkdirSync(join(root, "dist"), { recursive: true });
for (const managed of [false, true]) {
  const entries = [
    ["[Content_Types].xml", contentTypes()],
    ["solution.xml", solutionXml(managed)],
    ["customizations.xml", customizationsXml()],
    ["WebResources/" + partName(WEB_RESOURCE), html],
  ];
  const out = join(root, "dist", `${SOLUTION}_${VERSION.replace(/\.0$/, "")}_${managed ? "managed" : "unmanaged"}.zip`);
  writeFileSync(out, zip(entries));
  console.log("built", out);
}
