# SELPA — autorización, Preview y pruebas físicas

2026-10-15. Paquete Fase 1 aceptado para preparar pruebas reales.
**Publicación aún NO autorizada. Sin commit, push, deploy ni prueba remota.**
Gutter de login de 18 px diferido expresamente a Fase 2; no modificarlo ahora.

## Revisión puntual, sin repetir auditorías

| Control | Evidencia / estado |
| --- | --- |
| Base | `2fb0628db8566e5d48e5e8b86faca84f6b4170bb`; worktree detached `output/pwa-universal-preview-20261015` |
| Scope | Ocho archivos de `publication-manifest.json`, sin paths adicionales ni staging |
| Integridad | Ocho hashes iguales al paquete aceptado y localhost; patch SHA-256 `285528224e6b740b2c24892b33c11257ebda618f381e290848630aee651a3d3c` |
| Reversión | `git apply --reverse --check --whitespace=error-all` PASS, sin aplicarla |
| Trabajo principal | 65 archivos inventariados de `apps/web` intactos; branch `codex/club-admin-iphone-preview`, HEAD `2fb0628` |
| main | Ref local `ed76585930346a61ce9c80bc37b9f5afd88b6442`, no modificada; Production Branch remota aún sin confirmar |
| Supabase | Cero consultas, migraciones, modificaciones o pruebas remotas en este turno |
| Vercel local | Vínculo a `selpa-app`, root `apps/web`; no prueba configuración remota vigente |
| Acceso | CLI 59.9.1 en caché; `whoami --non-interactive --json` falla por falta de credenciales. Consulta remota detenida |
| Production / costo | Pendientes de lectura autorizada: Production Branch, target Preview, protección, plan/cuotas y consumo incluido |

Sólo documentación; runtime/configuración intactos. No se repiten build,
viewports o auditorías SQL ya completados.

Faltan **autorización explícita de publicación y acceso autorizado a Vercel**.
El titular inicia sesión CLI en su PC con acceso al proyecto existente, sin crear
otro proyecto ni pegar tokens/passwords en el chat. Como alternativa puede aportar
evidencia no secreta de Settings/Production Branch y Billing/Usage; la ejecución
necesitará sesión autorizada o publicación manual del titular.

Preview estándar es predeterminado; una branch Preview está disponible en todos
los planes sin contratar Custom Environment. Esto **no confirma $0 incremental
para esta cuenta**: verificar consumo incluido, build y ausencia de extras antes
del push. No activar builds pagos, dominio, add-ons o upgrade; detenerse ante un
requisito de compra o riesgo de cargo adicional.
[Entornos Vercel](https://vercel.com/docs/deployments/environments).
No asumir que Hobby es aplicable: tiene límites y restricción personal/no comercial.
No cambiar de plan como atajo. [Condiciones Hobby](https://vercel.com/docs/plans/hobby).

## Publicación futura — sólo tras autorización

1. Reconfirmar hashes/scope y mantener intacto el checkout principal.
2. Verificar proyecto/root `apps/web`, Production Branch distinta de
   `codex/pwa-universal-preview`, reglas y overrides Preview. No modificar variables,
   aliases, dominios o configuración de Production.
3. Confirmar condiciones $0 y acceso de teléfonos. Si Deployment Protection impide
   abrir la URL, pedir decisión; no quitar protección ni contratar bypass.
4. Crear la rama `codex/pwa-universal-preview` en el worktree aceptado desde
   `2fb0628`, si el nombre sigue libre. Stage explícito de ocho paths; no `git add .`.
5. Revisar staged: ocho archivos, 212 inserciones/cuatro eliminaciones. Un commit,
   SHA completo y push sólo de esa rama. Push puede disparar Preview automáticamente:
   no duplicar por CLI si ya existe. No PR, merge, promote, `--prod` o target Production.
6. Esperar Ready; comprobar target Preview, repo/branch/SHA y Production en su
   deployment previo. Build desde fuentes, nunca `.next` local con fixtures.
7. Entregar URL HTTPS inmutable exacta, deployment ID y commit desplegado; no
   inventar URL desde la branch ni confundirla con un alias Production.
8. Smoke público acotado: TLS/HTTPS, manifest 200/MIME/identidad, íconos
   192/512/maskable/Apple, startup links y render de `/`, `/login` sin submit,
   `/ranking` y perfil existente. Bloquear mutaciones browser en automatización.
9. Si falla un gate, marcar FAIL/BLOQUEADO y detenerse. No corregir deporte,
   permisos, pagos, migraciones, diseño o infraestructura como efecto secundario.

## Límites de la base compartida

La PWA no agrega firewall read-only. No registros, altas, inscripciones, pagos,
solicitudes, edición, cambio de club/rol o marcado de mensajes/notificaciones.
No cuentas simuladas contra servicios reales ni exportación de storageState/JWTs.

Login/logout reales crean/renuevan/revocan sesiones Auth. Bajo prohibición literal
de cero escrituras, quedan **BLOQUEADOS hasta permiso específico de autenticación**
con cuentas existentes. Publicar Preview no autoriza por sí solo operaciones Auth.

Cambiar club activo tiene un `user_settings.upsert` existente. La home pública
de un club `/clubs/[clubId]` puede enviar impresiones publicitarias al abrirse si
hay campañas: evitar esa ruta/clicks en el smoke. Abrir una pantalla no siempre es
read-only. No modificar el paquete aceptado para desactivar tracking.

## Registro físico — todos PENDIENTES

Registrar modelo, OS/versión, navegador/versión, fecha, orientación, escala de
texto/zoom, URL Preview, deployment ID y SHA. Resultado por caso: PASS / FAIL /
BLOQUEADO / NO SOPORTADO / NO EJECUTADO. Evidencia sin PII, tokens o saldos.

### iPhone / Safari

- [ ] Abrir Preview HTTPS en Safari normal y comprobar la web antes de instalar.
- [ ] Compartir → Agregar a pantalla de inicio; apertura como app si el OS lo ofrece.
  Abrir ícono y distinguir standalone de simple acceso directo al navegador.
- [ ] Identidad/icono SELPA, status bar, notch/island y controles visibles.
- [ ] Ambos giros, scroll/footer, menús con poca altura, zoom/texto OS.
- [ ] Teclado en login sin enviar: focus, autozoom y controles accesibles.
- [ ] Cerrar/reabrir; verificar URL/origen, links internos, Atrás disponible y
  externos no sensibles, sin rutas con tracking o acciones persistentes.
- [ ] Modo avión y vuelta a red: error normal sin promesa offline; recarga recupera.

### Android / Chrome

- [ ] Abrir la misma Preview HTTPS y comprobar web normal antes de instalar.
- [ ] Menú → Instalar aplicación / Agregar a inicio, según opción disponible.
  Si no aparece, registrar y continuar como web; no forzar un PASS.
- [ ] Abrir ícono: identidad/maskable, standalone, barras/cámara perforada.
- [ ] Giros, scroll, menús de poca altura, teclado sin submit y zoom/texto OS.
- [ ] Atrás del sistema, links, cierre/reapertura y pérdida/retorno de conexión.
- [ ] Repetir en otro tamaño/DPR/relación de aspecto cuando sea posible, sin CSS
  específico por Samsung, Motorola, Xiaomi, Pixel u otra marca.

### Samsung Internet — cuando haya acceso

- [ ] Registrar equipo/versión y probar primero como web.
- [ ] Instalar desde la opción disponible; distinguir app de acceso directo.
  Identidad, barras, safe areas, orientación y contenido conservados.
- [ ] Teclado, zoom/texto, Atrás, cierre/reapertura y recuperación de red.
- [ ] Sin dispositivo: NO EJECUTADO; no heredar PASS de Chrome.

### Sesión/club/rol — condicional a autorización Auth

- [ ] Con permiso específico y cuenta existente del titular, login en la propia
  instalación; no crear usuarios ni cambiar OAuth/proveedor.
- [ ] Mantener club/rol guardados sin seleccionar otro club.
- [ ] Mi ranking/perfil en lectura, recarga, Atrás y cierre/reapertura.
- [ ] Logout/Atrás no reabren ruta privada; no copiar tokens entre orígenes.
- [ ] PLAYER/OWNER sólo con cuentas autorizadas y sin editar datos.
- [ ] Read models ausentes: BLOQUEADO CONOCIDO, no ejecutar migraciones para PASS.

Sin certificación física hoy. WebKit automatizado no equivale a Safari real;
Chrome desktop no equivale a Android o Samsung Internet.

## Retiro o reversión limitada a esta Preview

Hoy no hay deployment nuevo que retirar. Tras publicar, identificar por ID/URL/SHA
**sólo esta Preview** y retirar su alias o eliminarla tras autorización, sin
rollback/promote Production. Prevenir auto-redeploy de la rama de prueba cuando
se retire, sin modificar otras ramas o borrar trabajo. Conservar patch/evidencias;
revertir código sólo en la rama aislada si se elige esa vía. Retirar también la
instalación de prueba del teléfono si se desea.

**Estado: paquete inalterado; autorización, acceso/costo Vercel y pruebas físicas
pendientes. Sin URL nueva, commit/push/deploy, cambios Supabase, escrituras
económicas, ajuste de gutter, modificación de diseños o Fase 2.**
