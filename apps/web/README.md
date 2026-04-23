# PAMPrax Web

Esta es la app canónica de PAMPrax.

PAMPrax esta hecho con Next.js App Router + Supabase. Todo cambio funcional nuevo debe hacerse en `apps/web`, no en las copias paralelas `apps/web2` o `apps/web3`, salvo pedido explícito de comparación o migración.

## Contexto obligatorio

Antes de tocar auth, perfiles, clubes, membresías, jugadores, torneos, platform admin, mensajes, notificaciones o integración con Supabase, revisar:

- `../../AGENTS.md`
- `../../supabase_full.sql`
- `../../docs/schema-summary.md`
- `../../docs/pamprax-db-rules.md`

No asumir estructura de Supabase sin revisar esos archivos. El schema `public` es el modelo de negocio de Pamprax; los schemas internos de Supabase deben tratarse como infraestructura.

## App canónica

- Usar `apps/web` como base única de desarrollo.
- No implementar cambios nuevos en `apps/web2` ni `apps/web3`.
- Si aparece una diferencia útil en `web2` o `web3`, migrarla manualmente a `apps/web` después de revisar que respete el schema real.
- No resolver bugs copiando carpetas completas entre apps.

## Puntos sensibles

- Auth y post-login: `app/auth/*`, `components/session/SessionProvider.tsx`, `app/(app)/RoleGate.tsx`.
- Navbar compartida: `components/navbar/AppNavbarClient.tsx`, `lib/navConfig.ts`.
- Supabase client/admin: `lib/supabaseClient.ts`, `lib/supabaseAdmin.ts`, `lib/platformApiAuth.ts`.
- Clubes y membresías: `clubs`, `club_memberships`, `club_players`, `club_player_private`, `user_settings`.
- Torneos: `tournaments`, `tournament_teams`, `tournament_registrations`.
- Platform admin: `platform_admins`, `platform_news`, `platform_sponsors`, `platform_ad_campaigns`.

Prestar especial atención a duplicaciones legacy, triggers redundantes, problemas de RLS y campos que convendría unificar.

## Getting Started

Desde `apps/web`, correr:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Checks recomendados

```bash
npm run lint
npm run build
```

## Nota de fase

Fase 1 del plan de ejecución: `apps/web` queda congelada como app canónica. Las próximas fases deben partir de esta carpeta.
