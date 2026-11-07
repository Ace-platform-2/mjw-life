# MJW Life

Command Deck is a responsive personal workspace. It brings today's focus, capacity, follow-ups, goals, habits, weekly reflections and manual finance tracking into one place.

## Run locally

Run `npm ci` and `npm run dev`. Without a Supabase connection, development runs with fictional examples stored in the current browser. Production requires Supabase credentials and an enrolled account.

## Private rollout

1. Apply the migrations in `supabase/migrations` to the MJW Life Supabase project in order.
2. Set the two public Supabase environment variables from `.env.example` in Vercel. Use the publishable key.
3. Add the owner's lowercase email to `mjw_private.workspace_invitations` as a project administrator. Email confirmation must be enabled. Add the deployed origin to the Supabase Auth redirect allowlist. The invited owner sets their own password through **Activate invited account**. The database grants membership only after email confirmation. Alternatively, provision an Auth account and enrol its UUID directly in `public.life_workspace_members`.
4. Deploy from the GitHub repository. Use fictional records for staging. Planning guidance works with four aggregate planning numbers and verifies workspace access. The optional server-side OpenAI variables enable AI-generated suggestions.
5. Run `npm run build` and `npm run test:sites` to verify the build and static packaging.

The initial area names are editable. Personal data is scoped to its owner. Groups and shared commitments belong in a future invitation-only space with separate membership and sharing policies.

## Google sources

Enable Gmail API and Google Calendar API in the Google Cloud project. Configure the Google Auth consent screen and add your Google account as a test user while the app is in Testing. Create a **Web application** OAuth client with `https://mjw-life.vercel.app` as an authorized JavaScript origin. Set its client ID in the Vercel production variable `VITE_GOOGLE_CLIENT_ID` and redeploy.

Open **Settings → Connected accounts**. Each preview asks for only the selected source's read-only scope. Google access tokens are used in memory for that preview. The app reads Gmail subject lines and calendar event metadata and saves only selected items to the signed-in workspace. Preview and import are manual.

## Personal workspace features

Apply the workspace records migration before deploying this version. Notes, journal, calendar events, manual ZAR budgets and medication check-ins use the existing private workspace. Document uploads use the private life-documents bucket, with owner and enrolment checks. An area export includes metadata and record content. Download files separately.

Finance accepts manual bills, category budgets and spending. Optional spending CSV previews run locally in the browser. The template expects date,description,category,amount, ISO dates and positive ZAR expenses.

Medication scheduling and check-ins are user-entered. Calendar reminders are downloadable files. Users should verify notification behaviour in their calendar after importing and update it when their schedule changes.

## Inbox, home and finance

Apply the home and finance migration before deploying. The Inbox **Refresh Gmail** action saves the Google mailbox history checkpoint together with new email subjects. It checks the previous seven days on the first run and uses Gmail history on later runs. A configured Google OAuth Web client ID and Gmail read access are required. Access tokens are held only while the Inbox is open. Existing follow-ups stay editable.

Today opens the private Emergency card, and Areas opens Family, House and Finance. Bank account numbers are encrypted in the browser with an account vault passphrase and displayed as masked digits. The passphrase is required to reveal a number. Standard exports include the masked digits. Travel and receipt CSV exports are records for review. They are independent of the monthly budget and do not submit a tax return.

Audio transcription uses the pinned multilingual Whisper Tiny model in a browser worker. It begins when a file is chosen or a recording stops. The browser downloads model files on first use. It processes the recording locally and saves the transcript only after review. Set ONNXRUNTIME_NODE_INSTALL_CUDA=skip when installing this project to skip the unused CUDA download.

## FPG Properties

Open **Today → FPG Properties**, **Areas → FPG → Properties** or **Emergency → FPG property contacts**. Search tenant names, shop numbers, contacts and phone numbers across the portfolio, or open a building to see its tenant files and site numbers. Tap a number to call. Add control room, facilities and site office numbers under **Edit property**.

Select **Documents** on a building to add floorplans and other files. You can choose several files at once, up to 10 MB each. Edit a file to change its title, category or notes, or replace it.

The directory exports the full building or portfolio tenant list as a landscape A4 PDF. **Edit tenant** supports changing the property and deleting a tenant file. Linked work history stays in the work log. **Important FPG numbers** is available from Emergency, the FPG area and the property directory.

Use the work log for incidents, tenant concerns, maintenance, site reports, leasing, meetings, arrears and vacancies. Entries can link to a tenant and carry an owner, follow-up date and escalation flag. Meetings and dated follow-ups appear in Calendar. Photos are resized on the device and saved in the private documents bucket.

Open **Arrears**, **Vacancies** or **Budgets** in the property directory to see the portfolio or one building. Arrears and vacancy records keep dated follow-up notes. Use **Needs attention** to see due or escalated work. Property budget items track submissions and follow-ups.

Apply the FPG property migrations before deploying. Keep tenant records, documents and phonebook entries in the enrolled user's workspace and out of source and demo data.

## Brand identity

**Primary MJW Life wordmark:** metallic teal/blue ribbon followed by the approved “MJW Life” name. Used in the platform header, sign-in screen and branded outputs. **Standalone ribbon:** official symbol for app installation, splash/loading, favicon and Today navigation. Source artwork is preserved. See `public/brand/BRAND_USAGE.md` for asset replacement and trademark guidelines. The app's current binary assets must be replaced with the approved uploaded artwork if they still contain earlier variants; the documented brand implementation is not a trademark registration.


## Two-hour device audio recordings and live transcripts

Open **Records → Audio**. **Record voice note** captures audio for up to 120 minutes, and saves chunks to IndexedDB in the signed-in user's browser profile as recording continues. A saved or partially recoverable recording appears under **Saved recordings on this device**, where **Download audio** saves a separate WebM, M4A or Ogg file depending on browser support. An optional automatic download is attempted when recording stops, but mobile browsers may require the user to tap **Download audio**. Download important recordings before clearing site data or browser storage. The app does not upload recordings to Supabase.

Live dictation updates the transcript textarea while recording on browsers with the Web Speech API. This browser feature is separate from the Wispr Flow subscription. Some browsers, offline environments and devices do not support simultaneous capture and browser speech recognition; audio recording is still available. Select English or Afrikaans explicitly for live recognition. Automatic language detection applies to file transcription only.

On-device file transcription uses the existing Whisper Tiny model and currently accepts audio up to 50 MB and 30 minutes. Long recording support applies to **recording and audio download**, not to Whisper Tiny batch transcription. The transcript can be edited before saving as a note. A repeated-word quality filter rejects obvious hallucinated output. Keep this screen open and prevent the phone from sleeping during recording; browsers can pause background microphone access. Local storage is device-specific and may be evicted or removed by browser settings.

Wispr Flow's official ChatGPT connector is read-only for existing notes and meeting transcripts; it is not a live transcription SDK for a separate web app. Paste or dictate with Wispr Flow into the transcript field where the native Wispr keyboard/app supports it. Do not request Wispr Flow login tokens, patch its application, or use reverse-engineered APIs.


## Catch-up and action control (private preview)

Open **Today → Catch-up and action control**, or **Areas → FPG → Catch-up**. Review saved open work, overdue follow-ups, escalations and property budgets by property. Missing owner, next action and date are visible. The date-range view lists items dated within a selected range; it does not certify when emails arrived or automatically reconcile MRI, MDA, Outlook or Google Calendar. All values are from existing private records. Open an item to verify/update it manually.

The Today priority now ranks overdue and escalated tasks before routine items while honouring a manually chosen focus. The Property directory shows open, urgent, budget and overdue counts from saved work logs. An arrears total is explicitly a sum of known manually saved balances, with missing balances counted separately; this is not a live debtor ledger.

Release gates and the 14-day acceptance criteria are maintained in [docs/RELEASE_GATES.md](docs/RELEASE_GATES.md). User acceptance on mobile, full backup/recovery, FPG organisation data governance, Outlook/MRI integration, notification delivery and long-audio transcription are not marked complete.
