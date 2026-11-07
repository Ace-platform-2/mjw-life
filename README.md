# MJW Life

Command Deck is a responsive personal workspace. It brings today's focus, capacity, follow-ups, goals, habits, weekly reflections and manual finance tracking into one place.

## Run locally

Run `npm ci` and `npm run dev`. Without a Supabase connection, development runs with fictional examples stored in the current browser. Production requires Supabase credentials and an enrolled account.

## Private rollout

1. Apply the migrations in `supabase/migrations` to the MJW Life Supabase project in order.
2. Set the two public Supabase environment variables from `.env.example` in Vercel. Use the publishable key.
3. Add the owner's lowercase email to `mjw_private.workspace_invitations` as a project administrator. Email confirmation must be enabled. Add the deployed origin to the Supabase Auth redirect allowlist. The invited owner sets their own password through **Activate invited account**. The database grants membership only after email confirmation. Alternatively, provision an Auth account and enrol its UUID directly in `public.life_workspace_members`.
4. Deploy from the GitHub repository. Use fictional records for staging. Configure the optional server-side OpenAI variables to enable AI guidance. The AI endpoint accepts only four aggregate planning numbers and verifies workspace access.
5. Run `npm run build` and `npm run test:sites` to verify the build and static packaging.

The initial area names are editable. Personal data is scoped to its owner. Groups and shared commitments belong in a future invitation-only space with separate membership and sharing policies.

## Google sources

Enable Gmail API and Google Calendar API in the Google Cloud project. Configure the Google Auth consent screen and add your Google account as a test user while the app is in Testing. Create a **Web application** OAuth client with `https://mjw-life.vercel.app` as an authorized JavaScript origin. Set its client ID in the Vercel production variable `VITE_GOOGLE_CLIENT_ID` and redeploy.

Open **Calendar → Google sources**. Each preview asks for only the selected source's read-only scope. Google access tokens are used in memory for that preview. The app reads Gmail subject lines and calendar event metadata and saves only selected items to the signed-in workspace. Preview and import are manual.

## Personal workspace features

Apply the workspace records migration before deploying this version. Notes, journal, calendar events, manual ZAR budgets and medication check-ins use the existing private workspace. Document uploads use the private life-documents bucket, with owner and enrolment checks. An area export includes metadata and record content. Download files separately.

Finance accepts manual bills, category budgets and spending. Optional spending CSV previews run locally in the browser. The template expects date,description,category,amount, ISO dates and positive ZAR expenses.

Medication scheduling and check-ins are user-entered. Calendar reminders are downloadable files. Users should verify notification behaviour in their calendar after importing and update it when their schedule changes.

Audio transcription requires the server-only OPENAI_API_KEY environment variable. The app asks for permission before sending the selected audio. It accepts clips up to 3 MB. Users can also paste and review transcripts without a configured provider.

## Inbox, home and finance

Apply the home and finance migration before deploying. The Inbox **Refresh Gmail** action saves the Google mailbox history checkpoint together with new email subjects. It checks the previous seven days on the first run and uses Gmail history on later runs. A configured Google OAuth Web client ID and Gmail read access are required. Access tokens are held only while the Inbox is open. Existing follow-ups stay editable.

Today opens the private Emergency card, and Areas opens Family, House and Finance. Bank account numbers are encrypted in the browser with an account vault passphrase and displayed as masked digits. The passphrase is required to reveal a number. Standard exports include the masked digits. Travel and receipt CSV exports are records for review. They are independent of the monthly budget and do not submit a tax return.

Audio transcription uses the pinned multilingual Whisper Tiny model in a browser worker. It begins when a file is chosen or a recording stops. The browser downloads model files on first use. It processes the recording locally and saves the transcript only after review. Set ONNXRUNTIME_NODE_INSTALL_CUDA=skip when installing this project to skip the unused CUDA download.
