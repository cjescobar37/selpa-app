# PRODUCT ROADMAP

## Estado del proyecto

Estado general estimado: **70% para MVP beta funcional**.

Ya está terminado o estabilizado:

- Base Next.js App Router en `apps/web`.
- Branding SELPA aplicado en gran parte de la experiencia.
- Deploy oficial documentado y funcionando por GitHub/Vercel.
- `apps/web/vercel.json` fijado para evitar deployments vacíos.
- Home pública, ranking público, clubes, torneos públicos y noticias públicas con diseño avanzado.
- Login, registro y recuperación de contraseña con identidad SELPA.
- Dashboard jugador en mejora mobile-first.
- Navegación por roles centralizada en `lib/navConfig.ts`.

Está en beta:

- Experiencia jugador autenticado.
- Perfil jugador y ranking del jugador.
- Torneos, inscripción, pagos/reportes operativos.
- Club admin: torneos, jugadores, mensajes, configuración, contenido y publicidad.
- Platform admin: clubes, usuarios, pagos, noticias, sponsors y auditoría.
- Mensajería y notificaciones.
- Sponsors/publicidad global y por club.

Falta:

- Sprint mobile profundo en pantallas clave.
- Auditoría formal de seguridad, RLS y permisos.
- Pulido de core deportivo: rankings, torneos, inscripciones, parejas, pagos y estados.
- QA real por roles y por dispositivo.
- Performance, accesibilidad, SEO y observabilidad.
- Cierre de placeholders, textos temporales y estados vacíos.

## Sprints

1. **Mobile Experience (actual)**
   - Dashboard jugador.
   - Navbar mobile.
   - Perfil jugador.
   - Comunidad SELPA.
   - Mensajes y torneos mobile.

2. **Seguridad**
   - RLS y permisos por rol.
   - Uso de service role.
   - API routes.
   - Storage.
   - Validaciones y exposición de datos.

3. **Core Deportivo**
   - Ranking jugador/club.
   - Torneos y estados.
   - Inscripciones.
   - Parejas e invitaciones.
   - Pagos y operación de club.

4. **Calidad y Performance**
   - Responsive final.
   - Accesibilidad.
   - Performance de queries/render.
   - SEO/metadata.
   - Limpieza de deuda técnica.

## Backlog Priorizado

### P0

- Terminar navegación mobile para jugador y club.
- Validar deploy oficial después de cada push.
- Ejecutar auditoría de seguridad antes de producción real.
- Corregir cualquier flujo crítico roto de login, inscripción, pago o mensajes.

### P1

- Optimizar dashboard jugador, perfil jugador y torneos para uso real en celular.
- QA completo de roles: invitado, jugador, club admin y platform admin.
- Revisar textos técnicos, placeholders y estados vacíos.
- Consolidar permisos y navegación desde `navConfig.ts`.

### P2

- Mejorar SEO/OpenGraph.
- Optimizar imágenes, renders y caché.
- Pulir UI secundaria de platform/admin.
- Documentar flujos operativos para clubes.

## Próxima tarea

**Mobile Navigation Sprint:** rediseñar solo el navbar mobile, menú mobile, selector de club mobile y menú de usuario mobile sin tocar desktop.

## Criterio de finalización

SELPA puede considerarse versión **1.0** cuando:

- Un jugador puede registrarse, iniciar sesión, elegir club, entender su estado deportivo, inscribirse a un torneo y comunicarse con el club desde el celular sin fricción.
- Un club puede administrar torneos, jugadores, ranking, inscripciones, mensajes, contenido y configuración básica sin romper operación.
- La experiencia mobile cumple la regla de los 20 segundos en pantallas principales.
- Seguridad, RLS, permisos y APIs fueron auditados.
- Build y deploy por GitHub/Vercel son repetibles.
- No quedan placeholders críticos ni botones importantes sin acción.
- La app se siente como producto deportivo/social premium, no como sistema administrativo.
