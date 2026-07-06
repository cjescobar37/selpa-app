# AI Rules for SELPA

## Product Philosophy

SELPA is a sports and social app for padel players, not an administrative system.

Every UX decision must answer:

> Would a player waiting beside the court, using one hand and looking at the phone for less than 20 seconds, understand and use this comfortably?

If the answer is no, the screen is not finished.

## Core Rules

- Design mobile first for real phone use.
- Prioritize the player experience over internal/admin convenience.
- Keep the interface compact, premium, fast, and clear.
- Maintain SELPA identity: navy, cyan, magenta, glass, soft borders, subtle glow.
- Use color as an accent, not decoration.
- Make surgical changes. Avoid broad redesigns unless explicitly approved.
- One screen should have one clear primary objective.
- Every visible block must justify its space.

## Safety Boundaries

- Do not touch backend, Supabase, queries, schema, migrations, or routes unless explicitly requested.
- Do not touch desktop behavior or layout unless explicitly requested.
- Do not change business logic while doing UX/UI work.
- Do not add new features during UX polish sprints.
- Use `apps/web` as the canonical app.
- Use `lib/navConfig.ts` as the source of truth for navigation.

## Before Modifying

Always provide:

- exact files involved;
- brief plan;
- problem being solved;
- expected risk;
- wait for approval when structure, navigation, or behavior may change.

## After Modifying

Always run:

```bash
npm run build
```

Then:

- review mobile and desktop impact;
- commit only the intended files;
- push to `main` when requested;
- do not advance to another sprint without approval.

## Git and Deploy

- One commit equals one visible improvement.
- Keep commits small and named clearly.
- Official deploy is by `git push origin main`.
- Do not use manual Vercel deploys unless explicitly requested.
- Keep `apps/web/vercel.json` in place.
- Required Vercel setting:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs"
}
```

- Use `DEPLOY.md` for deploy procedure and troubleshooting.

## Sprint Discipline

- Do not move to another screen until the user tests and approves.
- Prefer ten strong iterations on one screen over shallow work across many screens.
- The goal is not only that SELPA works.
- The goal is that SELPA feels excellent on a phone.
