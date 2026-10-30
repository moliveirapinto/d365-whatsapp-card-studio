# Known gaps and channel limits

Findings from testing Card Studio against the first-party WhatsApp channel ("WhatsApp enabled through Meta") in Dynamics 365 Contact Center, on 2026-10-29. Each item says how it was observed, so the docs can state it precisely. Re-test when the channel changes.

## Channel gaps (outside Card Studio's control)

| # | Gap | Evidence | What Card Studio does instead |
|---|---|---|---|
| 1 | **Inbound WhatsApp location pins are not supported.** When a customer shares a location with the + menu, the agent sees only a system error and no coordinates, address or map. | A customer shared a location on 2026-10-29 at 7:37 PM. The Communication Panel showed: `Error: Customer sent an unsupported message type.` (message tag `unsupportedmessagetype`). | The Ask for location card tells customers not to use location pins and asks for a Google or Apple Maps link, or a typed address. Shared links and typed text arrive normally. |
| 2 | **No native "Send location" request button.** Meta's WhatsApp API has a location request message, but the channel did not send one. | Five formats were tried. Four were accepted and none produced a request button: a Submit action titled "Send location" became a plain reply button (tapping it only replied with the words "Send location"); a location-request payload under channel data, a Meta-style `interactive` object and a full Meta-style payload all arrived as plain text. The fifth, an `Action.Execute` card, was rejected with `Invalid adaptive card. Adaptive card should have either buttons, openUrl actions, or choice set`. | Ask for location sends a friendly request for a Maps link or typed address, plus reply buttons. It does not send a location request. |
| 3 | **Only three interactive shapes are converted:** reply buttons, link (openUrl) buttons and choice lists. | Same rejection message as above. No other shape produced an interactive message in any test. | Card Studio builds every card from those three. |
| 4 | **Maximum 3 reply buttons.** | Sending 4 buttons failed with `Too many reply buttons: 4. Meta WhatsApp supports a maximum of 3 reply buttons.` | Quick replies are capped at 3. Longer menus use the List menu type. |
| 5 | **List menus built from a choice set carry option titles only.** Option descriptions, the section title and the menu button text are not delivered. Whether the customer sees the configured button text is not confirmed. | A list sent as an adaptive card with a compact `Input.ChoiceSet` arrived as a menu on the customer's phone. A choice set has no field for descriptions or sections. No other list payload was tried. | The editor still has the description, section and button fields, with a note, but the phone preview shows only the titles, as delivered. |
| 6 | **No swipeable carousel and no images inside cards.** A hero-card carousel was delivered as plain text only. An adaptive card with an image arrived with its text and button but the photo was dropped. A web image link attached as an image was also dropped. | Tests [C1], [C2], [I1] and [I2] on 2026-10-29, checked on the customer's phone. | A carousel is sent as a sequence: intro text, then for each item a photo (uploaded through the chat panel's file attach) followed by a card with title, description and link button. Photos are re-encoded as standard JPEG first, because some originals were rejected with `Failed to download ACS Attachment ... Unsupported media type`. **Delivery of the uploaded photos to the customer's phone has not been confirmed.** |
| 7 | **Native map pin messages are not supported.** | Place and geo-location payloads arrived as plain text. | Share a place sends the name and address with an "Open in Maps" link button, which arrived as a real tappable button in test [P1]. |
| 8 | **The product's own Rich messages feature does not allow cards or carousels on WhatsApp.** In Copilot Service admin center > Productivity > Rich messages > New, the type list is Apple Pay, Authentication, Cards, Custom JSON, Forms, List Picker, Suggested Reply, Time Picker, Video Rich Link and Website Rich Link. Choosing Cards offers only the channel **Live chat**, and the preview says "Preview for this media type is not supported on this channel". The only WhatsApp rich message in the environment is a Suggested Reply. | Checked on 2026-10-29. Nothing was saved. Custom JSON, List Picker and Time Picker were not checked. | Card Studio sends reply buttons, link buttons and a choice list directly; a carousel is a photo-and-card sequence. |

## Verification status

What was checked on a real phone, and what was not.

| Message type | Confirmed on a phone | Not confirmed |
|---|---|---|
| Quick replies | Cards with 1 to 3 reply buttons arrived as WhatsApp reply buttons. Taps came back as messages. | |
| Link button | A card with a link button (test [C2], and "Open in Maps" in [P1]) arrived as a tappable link button. | |
| List menu | A menu of option titles arrived and could be opened (test "Pick a topic"). | How the final card looks (header, message and button text). The exact button text the customer sees. |
| Carousel | The channel drops hero-card carousels and images inside cards (see gap 6). | That the photos in the photo-and-card sequence reach the customer. |
| Ask for location | Reply buttons arrived (test [L1]). The channel does not send a location request (gap 2). | The final wording with the Maps-link instruction was not sent to a phone. |
| Share a place | A name and address card with an "Open in Maps" button arrived (test [P1]). | |

The Card Studio preview approximates WhatsApp. For list menus it shows the option titles only, because that is all the channel delivers.

## Card Studio limits (our side)

- **Custom cards and edited descriptions are saved in the browser** (local storage), per user and per browser. They do not follow the user to another machine and are not shared with the team.
- **Copilot suggestions need an AI Builder prompt** called "Card Studio Suggest" in each environment (`scripts/create-prompt.mjs`). Without it, the app falls back to keyword matching.
- **Each new message triggers one suggestion call**, which uses AI Builder credits.
- **Merge fields** cover first name, agent name and case number only.
- **Sample cards use placeholder text and example.com links.** Replace them before real use.
- **The chat connection is found by inspecting the Communication Panel's page.** A product update that changes the chat widget could break sending. Card Studio then falls back to formatted text or copy.
