# MJW Life release gates and operational pilot

Owner: MJW Life
Scope: Personal/private prototype, with optional authorised FPG records.
Date: 2026-11-07

## Status definitions
- VERIFIED: automated check passed, or direct production provider status confirmed.
- IMPLEMENTED / NOT DEVICE-VERIFIED: feature code shipped, but actual device workflow not yet proven.
- BLOCKED: external permission, credentials, production configuration or real-world test required.
- PLANNED: not implemented. Never label it complete.

## Stage 0: Baseline protection
- Production target: GitHub main and connected Vercel project mjw-life.
- Branch release tests: run task/workspace, property, personal/finance, Gmail, audio and action-control Node tests before Vite bundling.
- Validate Sites packaging tests after Vite builds the distribution files.
- Preview deployment must be READY and logs show passing unit tests before merge.
- Production release must be READY on the merge SHA, and provider project domain must map to that release.
- A READY deployment proves build success only, not operational browser or live data accuracy.

## Stage 1: Everyday action and budget control
- Today provides access to Catch-up.
- Catch-up summarises open/urgent/overdue/waiting FPG and personal records.
- Open property budgets remain visible even when no follow-up date was entered.
- For FPG records, missing owner, next action and follow-up date are explicitly displayed.
- Portfolio snapshots distinguish zero arrears, known balances, and missing balance values.
- Date filter is based only on stored record dates. It does NOT represent an automatic Microsoft 365, Gmail, MRI/MDA or Google Calendar sync.
- Every item can be opened to edit; no status or balance is silently changed.
- Test source fixtures must contain no actual tenant or family data.

## Stage 2: Security, reliability and connectivity (not complete)
- Obtain employer approval before personal-platform processing of FPG contact, financial or operational data.
- Separate personal and organisation-owned data into independent workspaces with delegated RBAC, rather than relying solely on a single user_id namespace.
- Implement and verify complete backup and restore (metadata plus attachments).
- Verify Supabase RLS, document-bucket policies and membership for two separate test users.
- Add Microsoft 365 and authorised financial/portfolio imports with review and de-duplication. Never scrape credentials.
- Add sync checkpoints with last-success, last-error and explicit source timestamps.
- Implement browser-independent reminders and notifications with permission controls.
- Add fully offline incident capture and conflict-safe resynchronisation.
- Implement audit history for high-consequence FPG edits.
- Establish privacy/data-retention policy before expanding sign-ups.

## Stage 3: Operational workflows (not complete)
- Incident: reported -> assigned -> acknowledged -> contractor instructed -> attended -> evidence -> verified -> closed.
- Arrears: debtor snapshot -> amount as of date -> collection action -> promise -> follow-up -> outcome -> escalation.
- Vacancy: unit/area -> marketing -> prospective tenants -> offer -> lease -> handover.
- Property budget: period and version -> assumptions -> review -> approval -> submission evidence -> variance.
- Audio: long recording -> multi-part transcript -> timestamps -> verified summary -> actions -> local export.
- Connect real outcomes to the Today queue and test both happy and failure paths.

## Stage 4: Pilot and product readiness (not complete)
- Test Samsung Android web/PWA; test iPhone Safari separately.
- Test 90 and 120-minute audio, backgrounding, low battery, storage denial, download and recovery.
- Validate keyboard overlap, bottom navigation, contrast and accessibility.
- 14-day personal pilot: priority found <30 seconds, new task <20s, contact <10s, issue + photo <60s, follow-up <20s, daily review <5 minutes.
- Measure action closure rate, missed deadlines, stale records, time to capture, crash and sync errors.
- Publish for other users only after workspace isolation, security review and pilot evidence.

## Safety and decision guardrails
- No employer data imported without explicit approval and an authorised source.
- No inference of current tenant arrears from a case history or a dated note.
- Avoid changing database schema in production without migration review, backup and verification.
- Do not imply that a programmatic file download is guaranteed on mobile.
- Do not imply Wispr Flow's read-only connector is a live transcription SDK.
- The existing platform's user-scoped data is not a shared-team model.


## Partial Stage 2 improvement

Settings now provides a local metadata archive inventory and saved Gmail checkpoint status. The archive explicitly excludes file binaries, device-local audio and encrypted bank vault data, so it is not a restorable backup. Work records are excluded by default. Full backup/restore, cross-user RLS tests and organisation data segregation remain BLOCKED and tracked separately.


## Partial Stage 3 improvement

Budget entries now support an explicitly chosen stage, period, revision and a dated submission reference, with a test proving that submission does not automatically close the case. This is not a substitute for financial forecast sheets, lease assumptions or approval workflows; data validation against MRI/MDA is still pending.

## Stage 4 operational activation

The Catch-up empty state now directs the user to create the first verified budget, arrears or vacancy record. These are manual entry points, not source synchronisation or sample FPG data. Real-world results still depend on authorised data population and device acceptance.
