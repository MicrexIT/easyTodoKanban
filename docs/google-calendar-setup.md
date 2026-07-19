# Google Calendar service-account setup

This is a one-time setup for easyTodoKanban. The app only syncs **from the kanban to Google Calendar**. Editing or deleting the Google event does not change its card.

Keep the downloaded service-account JSON private. It contains a private key that can edit every calendar you explicitly share with the service account.

## 1. Create a Google Cloud project

1. Open [Google Cloud Console](https://console.cloud.google.com/) and sign in.
2. Open the project picker in the top bar, then choose **New Project**.
3. Name it `easyTodoKanban`, leave the organization/location at their defaults, and select **Create**.
4. When creation finishes, use the project picker to make sure `easyTodoKanban` is selected.

## 2. Enable the Google Calendar API

1. In the left menu, open **APIs & Services → Library**.
2. Search for **Google Calendar API**.
3. Open that result and select **Enable**.

Enabling the API is separate from sharing a calendar. Both steps are required.

## 3. Create a service account

1. Open **IAM & Admin → Service Accounts**.
2. Select **Create service account**.
3. Use a name such as `easytodo-calendar`, then select **Create and continue**.
4. Do not assign a role. The service account does not need access to Google Cloud resources; it will only receive access to one Calendar in step 5.
5. Select **Done**.

## 4. Download its JSON key

1. Open the new service account from the Service Accounts list.
2. Open the **Keys** tab.
3. Select **Add key → Create new key → JSON → Create**.
4. Google downloads a `.json` file. Store it somewhere private and never commit it.

The two values needed by the app are:

- `client_email`: the service account address, ending in `iam.gserviceaccount.com`.
- `private_key`: the complete PEM value from `-----BEGIN PRIVATE KEY-----` through `-----END PRIVATE KEY-----`.

## 5. Share the Google Calendar

1. Open [Google Calendar](https://calendar.google.com/).
2. In the left sidebar, point at the calendar to sync, select its three-dot menu, then **Settings and sharing**.
3. Under **Share with specific people or groups**, select **Add people and groups**.
4. Paste the JSON file's `client_email`.
5. Choose **Make changes to events**, then select **Send**.

The service account does not receive an email. Sharing the calendar is what grants it access.

## 6. Find the calendar ID

On the same calendar settings page, scroll to **Integrate calendar** and copy **Calendar ID**. For a primary calendar this is usually the Gmail address. A secondary calendar normally has a longer address ending in `group.calendar.google.com`.

## 7. Add the three Worker secrets

Run each command from the repository root. Enter the matching value when Wrangler prompts. For `GOOGLE_SA_KEY`, paste the complete PEM with its real line breaks, then press **Ctrl-D** to finish the prompt.

### Web Worker

```bash
pnpm exec wrangler secret put GOOGLE_SA_EMAIL
pnpm exec wrangler secret put GOOGLE_SA_KEY
pnpm exec wrangler secret put GOOGLE_CALENDAR_ID
```

### MCP Worker

```bash
pnpm exec wrangler secret put GOOGLE_SA_EMAIL --config apps/mcp/wrangler.jsonc
pnpm exec wrangler secret put GOOGLE_SA_KEY --config apps/mcp/wrangler.jsonc
pnpm exec wrangler secret put GOOGLE_CALENDAR_ID --config apps/mcp/wrangler.jsonc
```

The MCP config also has a non-secret `WEB_ORIGIN` value. It is used to put the kanban card link in events created through MCP.

## 8. Configure local development

Create `.dev.vars` in the repository root and `apps/mcp/.dev.vars` with the same three values. Both paths are covered by the repository's `.gitignore`.

Use `\n` inside the quoted key so the PEM stays on one line; the app converts those sequences back to real newlines:

```dotenv
GOOGLE_SA_EMAIL="easytodo-calendar@your-project.iam.gserviceaccount.com"
GOOGLE_SA_KEY="-----BEGIN PRIVATE KEY-----\n...key contents...\n-----END PRIVATE KEY-----\n"
GOOGLE_CALENDAR_ID="you@gmail.com"
```

Then apply migration `0004_card_gcal_event.sql` and restart both local Workers:

```bash
pnpm db:migrate:local
pnpm dev
pnpm dev:mcp
```

## Troubleshooting

| Error | Likely cause | Fix |
|---|---|---|
| `404 Not Found` for the calendar | The calendar was not shared with the service account, or `GOOGLE_CALENDAR_ID` is wrong. | Repeat steps 5 and 6. Confirm the shared address exactly matches `GOOGLE_SA_EMAIL`. |
| `invalid_grant` | The private key is malformed, often because its newlines were mangled. | Re-enter `GOOGLE_SA_KEY`. For Worker secrets paste the PEM with real line breaks; in `.dev.vars` use the quoted `\n` form shown above. If needed, create a fresh JSON key. |
| `403 accessNotConfigured` | The Google Calendar API is not enabled in the selected Cloud project. | Select the correct project and repeat step 2. |
| `403 Forbidden` | The service account can see the project but cannot edit this calendar. | Give its `client_email` **Make changes to events** permission on the exact calendar ID in use. |

Calendar failures are logged but never roll back a card edit. The kanban remains the source of truth; saving the card again retries synchronization.
