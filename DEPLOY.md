# Despliegue oficial de SELPA

Este documento define el proceso oficial para desplegar SELPA en produccion y deja documentado el incidente de Vercel que genero deployments `Ready` con `X-Vercel-Error: NOT_FOUND`.

## Proyecto

- Repositorio local: `D:\SELPA`
- Aplicacion canonica: `D:\SELPA\apps\web`
- Proyecto Vercel: `selpa-app`
- Framework: `Next.js`
- Root Directory en Vercel: `apps/web`
- Deploy oficial: GitHub hacia Vercel, desde la rama `main`
- URL de produccion: `https://selpa-app.vercel.app`

## Configuracion obligatoria de Vercel

El archivo `apps/web/vercel.json` es obligatorio y no debe eliminarse.

Contenido requerido:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs"
}
```

Este archivo fuerza el preset de framework `nextjs`. Sin esta configuracion, Vercel puede interpretar el proyecto como `Other`, ejecutar `npm run build`, marcar el deployment como `Ready`, pero publicar un output vacio. El sintoma final es:

- `curl https://selpa-app.vercel.app` devuelve `HTTP/1.1 404 Not Found`
- Header: `X-Vercel-Error: NOT_FOUND`
- `npx vercel inspect` muestra `Builds . [0ms]`

Cuando la configuracion es correcta, `npx vercel inspect` debe mostrar output real de Next.js, por ejemplo lambdas y muchos output items.

## Variables de entorno requeridas

Configurar estas variables en Vercel para Production:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Tambien pueden existir variables locales en `apps/web/.env.local`, pero nunca deben commitearse.

## Flujo obligatorio para cualquier cambio

Ejecutar todo desde `D:\SELPA\apps\web`, salvo comandos Git que pueden ejecutarse desde la raiz si se prefiere.

1. Validar build local.

```powershell
npm run build
```

El build debe terminar correctamente. No hacer commit con build roto.

2. Revisar exactamente que archivos cambiaron.

```powershell
git status --short
git diff --stat
```

3. Hacer commits pequenos.

Regla: un commit = una mejora visible o una correccion concreta.

Ejemplos:

- `Improve mobile dashboard`
- `Optimize player profile`
- `Fix tournament cards`
- `Improve mobile navbar`
- `Force Vercel Next.js framework preset`

Evitar mezclar varias funcionalidades o pantallas en un mismo commit.

4. Subir a GitHub.

```powershell
git push origin main
```

No usar deploy manual de Vercel salvo casos excepcionales. El despliegue oficial es mediante GitHub.

5. Esperar a que Vercel termine el deployment.

Se puede revisar desde el dashboard de Vercel o con:

```powershell
npx vercel ls selpa-app
npx vercel inspect https://selpa-app.vercel.app
```

6. Verificar produccion.

```powershell
curl.exe -I https://selpa-app.vercel.app
```

Debe devolver `HTTP/1.1 200 OK`.

7. Validacion mobile real.

Despues de cada deploy, abrir `https://selpa-app.vercel.app` desde el celular y probar solo la funcionalidad modificada.

Anotar:

- Que mejoro.
- Que todavia molesta.
- Cual deberia ser la siguiente iteracion.

## Incidente: Framework `Other` / deployment Ready con 404

### Sintomas observados

Vercel mostraba:

- Status: `Ready`
- Environment: `Production`
- Current: `Yes`
- Build logs finalizados correctamente:
  - `Build Completed in /vercel/output`
  - `Deploying outputs...`
  - `Deployment completed`

Pero todas las URLs respondian:

```text
HTTP/1.1 404 Not Found
X-Vercel-Error: NOT_FOUND
```

Incluso la URL unica del deployment.

Ademas:

```powershell
npx vercel inspect https://selpa-app.vercel.app
```

mostraba:

```text
Builds
.
0ms
```

### Causa

El proyecto remoto de Vercel estaba quedando sin preset efectivo de Next.js (`framework: null` / `Other`). Vercel corria `npm run build`, Next.js compilaba correctamente, pero el adapter de Next no quedaba aplicado para empaquetar las rutas y funciones como output servible.

Por eso el deployment podia terminar en `Ready`, pero el sitio publicado quedaba vacio y respondia `NOT_FOUND`.

### Solucion definitiva

Agregar y mantener versionado:

```text
apps/web/vercel.json
```

con:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs"
}
```

El commit que corrigio el incidente fue:

```text
df342e8 Force Vercel Next.js framework preset
```

Despues de ese cambio:

- `npx vercel inspect` mostro lambdas/output items reales de Next.js.
- `curl.exe -I https://selpa-app.vercel.app` devolvio `HTTP/1.1 200 OK`.
- El header incluyo `X-Matched-Path: /`.

## Troubleshooting de deploy

Si Vercel vuelve a mostrar `Ready` pero la URL devuelve `404 NOT_FOUND`, no empezar modificando codigo de la app.

Revisar en este orden:

1. Confirmar que `apps/web/vercel.json` existe en GitHub y tiene `"framework": "nextjs"`.
2. Confirmar en Vercel:
   - Project: `selpa-app`
   - Framework: `Next.js`
   - Root Directory: `apps/web`
3. Revisar logs completos del deployment.
4. Ejecutar:

```powershell
npx vercel inspect https://selpa-app.vercel.app
```

Si vuelve a aparecer solo:

```text
Builds
.
0ms
```

el problema esta en la configuracion de Vercel/output, no en una pantalla de SELPA.

5. Verificar que el deploy nuevo corresponda al ultimo commit:

```powershell
git log --oneline -3
npx vercel ls selpa-app
```

6. Confirmar la respuesta HTTP:

```powershell
curl.exe -I https://selpa-app.vercel.app
```

## Reglas que no deben romperse

- No eliminar `apps/web/vercel.json`.
- No cambiar el Framework de Vercel.
- No cambiar Root Directory: debe ser `apps/web`.
- No crear proyectos nuevos de Vercel salvo decision explicita.
- No hacer deploy manual salvo caso excepcional.
- No mezclar fixes de deploy con cambios funcionales o visuales.

## Estructura relevante

```text
D:\SELPA
├── apps
│   └── web
│       ├── app
│       ├── components
│       ├── lib
│       ├── public
│       ├── next.config.ts
│       ├── package.json
│       └── vercel.json
├── docs
├── supabase_full.sql
├── AGENTS.md
└── DEPLOY.md
```

La app canonica es `apps/web`.

