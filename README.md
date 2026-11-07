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
