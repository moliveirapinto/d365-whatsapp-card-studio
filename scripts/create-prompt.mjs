// Creates (or updates) the "Card Studio Suggest" AI Builder prompt that picks the best cards for the live conversation.
//   node scripts/create-prompt.mjs --org https://yourorg.crm.dynamics.com
// Sign in first with `az login` (or set DATAVERSE_TOKEN). Safe to run again: it republishes the prompt text.
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf("--" + n); return i > -1 ? args[i + 1] : d; };
const ORG = (opt("org") || "").replace(/\/$/, "");
if (!ORG) { console.error("Usage: node scripts/create-prompt.mjs --org <url>"); process.exit(1); }

export const PROMPT_NAME = "Card Studio Suggest";
const TEMPLATE_ID = "edfdb190-3791-45d8-9a6c-8f90a37c278a";

const token = process.env.DATAVERSE_TOKEN || execSync(`az account get-access-token --resource ${ORG} --query accessToken -o tsv`, { encoding: "utf8", shell: true }).trim();
const API = ORG + "/api/data/v9.2/";
async function call(method, path, body) {
  const r = await fetch(API + path, {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", Accept: "application/json", "OData-Version": "4.0", Prefer: "return=representation" },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

const lit = (text) => ({ type: "literal", text });
const v = (id) => ({ type: "inputVariable", id });
const CONFIG = {
  modelParameters: { gptParameters: { temperature: 0.1 }, modelType: "gpt-41-mini" },
  version: "GptDynamicPrompt-2",
  prompt: [
    lit("You help a customer service agent choose which rich message cards to send next on WhatsApp.\n\nBelow is the recent conversation between the customer and the agent, then a catalog of cards. Each card has an id, a name and an internal description that says when it should be used.\n\nPick up to 3 cards that clearly fit what the agent should send NEXT, ranked best first. Be selective: return only cards that genuinely match the card description and the latest customer need. One strong match is better than three weak ones, and an empty list is fine. Never pad the list. Greeting or welcome cards only make sense at the very beginning of a conversation, and rating cards only once the issue looks resolved. Consider what the customer asked or feels, what stage the conversation is at, and what the agent has already sent (do not suggest a card whose content was just sent, unless the customer clearly needs it again). If nothing fits, return an empty list.\n\nRules: use only ids from the catalog. Each reason is plain English, at most 12 words, no emojis, and speaks to the agent (for example: Customer is asking about delivery). Return ONLY valid JSON in exactly this shape and nothing else: {\"suggestions\":[{\"id\":\"card id\",\"reason\":\"short reason\"}]}\n\nCustomer first name: "),
    v("Customer"),
    lit("\n\nConversation (oldest first):\n"),
    v("Conversation"),
    lit("\n\nCard catalog:\n"),
    v("Cards"),
  ],
  definitions: {
    data: [],
    output: { formats: ["text"] },
    inputs: ["Customer", "Conversation", "Cards"].map((id) => ({ text: id, type: "text", id })),
  },
};

let model = (await call("GET", `msdyn_aimodels?$select=msdyn_aimodelid,statecode&$filter=${encodeURIComponent(`msdyn_name eq '${PROMPT_NAME}'`)}`)).value[0];
if (!model) {
  model = await call("POST", "msdyn_aimodels", { msdyn_name: PROMPT_NAME, "msdyn_TemplateId@odata.bind": `/msdyn_aitemplates(${TEMPLATE_ID})`, msdyn_sharewithorganizationoncreate: false });
  console.log("prompt created");
} else console.log("prompt exists, republishing");
const id = model.msdyn_aimodelid;
const config = JSON.stringify(CONFIG);
await call("POST", "AIModelPublish", { TemplateId: TEMPLATE_ID, ModelId: id, RunConfigurationId: id, ModelName: PROMPT_NAME, CustomConfiguration: config, RunConfiguration: config });
let m;
for (let i = 0; i < 15; i++) {
  m = await call("GET", `msdyn_aimodels(${id})?$select=statecode,_msdyn_activerunconfigurationid_value`);
  if (m.statecode === 1 && m._msdyn_activerunconfigurationid_value) break;
  await new Promise((r) => setTimeout(r, 2000));
}
if (m.statecode !== 1 || !m._msdyn_activerunconfigurationid_value) throw new Error("the prompt was created but is not published yet");
console.log(`prompt "${PROMPT_NAME}" published (${id})`);
