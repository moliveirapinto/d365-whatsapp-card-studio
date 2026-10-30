# WhatsApp Card Studio for Dynamics 365 Contact Center

**Interactive WhatsApp messages for human agents.** Pick a ready-made card, edit it, see how it looks on a phone, and send it to the customer in the live conversation.

Out of the box, a human agent in Dynamics 365 Contact Center can send text and files on the WhatsApp channel but has no way to send reply buttons, menus or link buttons from the conversation. This free, open-source add-on adds a **Card Studio** tab to the conversation form.

> Community project. Not an official Microsoft product. Tested on the first-party WhatsApp channel ("WhatsApp enabled through Meta") in Contact Center, October 2026.

## What agents get

| Message type | What the customer sees | Sent as |
|---|---|---|
| **Quick replies** | Up to 3 tappable reply buttons | Native WhatsApp reply buttons |
| **List menu** | A menu of up to 10 options | Native WhatsApp list (titles only) |
| **Link button** | A button that opens a web page | Native WhatsApp link button |
| **Carousel** | A photo and a card for each item | A short sequence of messages (see limits) |
| **Ask for location** | A friendly note asking for a Maps link or address | Reply buttons plus text |
| **Share a place** | Name, address and an Open in Maps button | Native WhatsApp link button |

- **30 ready-made cards** across those six types, each with a plain-English description of when to use it.
- **Message types drive the navigation.** Pick a type on the left, then one of its cards.
- **Live phone preview** that mirrors how WhatsApp renders each message.
- **Copilot suggestions** that read the live conversation and pick the best cards, refreshing as the chat moves on.
- **Merge fields** for the customer's first name, the agent's name and the case.
- **Your own cards:** edit any card, then save it as a new one. The internal description is never sent to customers.
- Photos for the carousel templates come from [Pexels](https://www.pexels.com) (free to use). Icons are [Fluent UI System Icons](https://github.com/microsoft/fluentui-system-icons) (MIT).

## Read this first: what the channel can and cannot do

The first-party WhatsApp channel only converts three kinds of interactive content: **reply buttons (maximum 3), link buttons and choice lists**. Everything else is dropped or shown as text. These limits come from the channel, not from this add-on, and were tested on a real phone. The full list with evidence is in **[docs/KNOWN-GAPS.md](docs/KNOWN-GAPS.md)**. The main ones:

- **No swipeable carousel** and **no images inside cards.** Carousels are sent as photo messages followed by a card with the title, description and link.
- **No native "Send location" button**, and **customers' location pins arrive as "unsupported message type"** in the agent's panel. The Ask for location card asks for a Maps link or typed address instead.
- List menus show option titles only.
- Custom cards and edited descriptions are saved in the agent's browser, not shared with the team.

## Requirements

- Dynamics 365 Contact Center (or Omnichannel for Customer Service) with a WhatsApp channel.
- **System Administrator** in the environment to install.
- [Node.js](https://nodejs.org) 18 or later and the [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) (`az login`) to run the installer. You sign in yourself, including MFA.
- Optional: AI Builder / Copilot prompts for the suggestions. Without them, Card Studio falls back to keyword matching.

## Install

> **Try it in a sandbox or developer environment first.** It adds one web resource, one security role and a tab on the conversation forms.

### Option 1. One command

```
git clone https://github.com/moliveirapinto/d365-whatsapp-card-studio.git
cd d365-whatsapp-card-studio
az login
node scripts/install.mjs --org https://yourorg.crm.dynamics.com
```

The installer is safe to run twice. It checks the environment, imports the managed solution from the latest release, adds the **Card Studio** tab to the conversation forms and creates the "Card Studio Suggest" prompt. Use `--dry-run` to see what it would do, `--skip-forms` or `--skip-prompt` to leave those steps out.

### Option 2. Import the solution yourself

1. Download `WhatsAppCardStudio_1.0.0_managed.zip` from the [latest release](../../releases/latest).
2. In the Power Apps maker portal, open **Solutions > Import solution** and import it.
3. Add the tab to your forms: `node scripts/add-to-forms.mjs --org https://yourorg.crm.dynamics.com`, or add a new tab with a web resource control pointing at `wacs_/cards.html` on the conversation form.
4. Optional: create the suggestion prompt with `node scripts/create-prompt.mjs --org https://yourorg.crm.dynamics.com`.

An unmanaged zip is also attached to each release if you want to edit the page in your environment.

### Agents who can't see suggestions

Give them the **WhatsApp Card Studio User** role. It only grants read access to AI Builder prompts.

## Use it

1. Accept a WhatsApp conversation in the Customer Service workspace.
2. Open the **Card Studio** tab on the conversation.
3. Pick a message type, then a card. Copilot's suggestions for the current chat appear at the top.
4. Edit the text, buttons or photos. The phone preview updates as you type.
5. Press **Send card**. A status line shows whether the live chat is connected.

The delivery menu next to the button has **Auto** (recommended), **Interactive card** and **Plain text**. If there is no live chat, Card Studio offers to copy the message instead.

## How it works

Card Studio is one HTML web resource on the conversation form. It finds the chat widget in the Communication Panel and sends messages through the same pipeline the agent's own typing uses, shaped as adaptive cards that the channel converts to WhatsApp buttons and lists. Photos are attached through the panel's file attach, re-encoded as standard JPEG first. Suggestions call an AI Builder prompt through the Dataverse API with the recent conversation and each card's internal description.

Because it relies on the chat widget's page, a product update that changes the widget could affect sending. When that happens, Card Studio falls back to formatted text or copy.

## Remove it

```
node scripts/add-to-forms.mjs --org https://yourorg.crm.dynamics.com --remove
```

Then delete the **WhatsApp Card Studio** solution and the **Card Studio Suggest** prompt.

## Build from source

```
node build/build.mjs
```

Builds the managed and unmanaged zips into `dist/`. No dependencies. Source is in `src/cards.html` (the page) and `src/icons.json` (inlined Fluent icons).

## License

MIT. See [LICENSE](LICENSE). Fluent UI System Icons are MIT licensed by Microsoft. Pexels photos are used under the [Pexels license](https://www.pexels.com/license/).
