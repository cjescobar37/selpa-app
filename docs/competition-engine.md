# Motor competitivo de SELPA

## Propósito

El motor competitivo define la estructura deportiva configurable de cada club. Es una base compartida para rankings, torneos, inscripciones, fixtures, seeds, estadísticas, Master Final y reportes; no es una extensión exclusiva del ranking.

La Etapa 1 es aditiva. No reemplaza `club_players.gender`, `club_players.category`, `club_players.ranking_points`, `categories`, `club_categories` ni los campos competitivos de `tournaments`.

## Entidades

### Temporada

`competition_seasons` delimita una estructura competitiva en el tiempo. Solo puede existir una temporada `ACTIVE` por club. La Etapa 1 no automatiza cierres, renovaciones ni arrastre de puntos.

### Rama

`competition_branches` contiene competencias configurables como Caballeros, Damas, Mixto u Open. Es un dato del club, no un enum.

Una rama no es el género de una persona. `profiles.gender` describe identidad global y `club_players.gender` es una clasificación legacy; ninguna de las dos puede determinar por sí sola dónde compite un jugador o una pareja.

`accent_kind` es exclusivamente visual. No participa en validaciones deportivas.

### Segmento

`competition_segments` contiene divisiones configurables como Libres, Veteranos o Escuela. Un club puede no utilizar segmentos.

El segmento competitivo no proviene de `tournaments.segment`: ese campo describe un torneo legacy concreto y no clasifica canónicamente jugadores, parejas ni temporadas.

### Categoría

`competition_categories` reemplazará progresivamente al catálogo numérico global como configuración propia del club. Puede representar tanto `5ª` como `Inicial` o `Intermedio`.

`legacy_category_id` es únicamente una referencia temporal para futuros backfills. `categories` y `club_categories` siguen vigentes durante la compatibilidad.

### División competitiva

`competition_divisions` es la entidad central. Define una combinación válida de:

- club;
- temporada;
- modalidad (`INDIVIDUAL` o `PAIRS`);
- rama;
- segmento opcional;
- categoría opcional.

Las foreign keys compuestas `(club_id, id)` impiden combinar entidades de clubes diferentes. La unicidad con `NULLS NOT DISTINCT` impide duplicar también divisiones sin segmento o sin categoría.

## Relaciones

```text
clubs
├── competition_seasons
├── competition_branches
├── competition_segments
├── competition_categories
└── competition_divisions
    ├── season_id
    ├── branch_id
    ├── segment_id (opcional)
    └── category_id (opcional)
```

## Plantilla inicial

`create_default_competition_structure(club_id, 'PADEL_TRADITIONAL')` crea de forma idempotente:

- una temporada del año actual en estado `DRAFT`, si no existe una que incluya la fecha actual;
- tres ramas;
- tres segmentos;
- siete categorías.

La plantilla no activa temporadas ni crea divisiones. Los nombres resultantes son datos normales editables y no enums ni reglas de negocio.

## Seguridad

Todas las tablas tienen RLS.

- Lectura administrativa: `ranking:view` o platform admin.
- Gestión: `ranking:manage` o platform admin.
- No existe lectura pública directa en esta etapa.

La RPC usa `SECURITY DEFINER`, `search_path` explícito y vuelve a validar actor, club, capability y template. No confía en parámetros de identidad enviados por el cliente.

## Compatibilidad legacy

La Etapa 1 no realiza backfill ni modifica:

- puntos;
- jugadores;
- parejas;
- torneos;
- endpoints;
- UI.

El diagnóstico `20260731_competition_engine_stage1_preflight.sql` permite inventariar los valores legacy antes de diseñar su migración.

## Asignación individual de jugadores (Etapa 2)

`competition_player_entries` vincula un `club_player` con una división `INDIVIDUAL` sin alterar su identidad ni los campos legacy. El jugador es la persona deportiva dentro del club; la entrada es una pertenencia competitiva temporal, con estado, vigencia, motivo y actor.

### Recorrido competitivo

Un recorrido se identifica mediante:

```text
club + temporada + jugador + rama + segmento opcional
```

La categoría no forma parte del recorrido. Por eso un cambio de categoría cierra la entrada anterior como `TRANSFERRED` y crea otra enlazada mediante `previous_entry_id`.

Un jugador puede mantener simultáneamente recorridos diferentes, por ejemplo Libres y Veteranos, o Caballeros y Open. `NULL` representa explícitamente un recorrido sin segmento.

### Estados

- `ACTIVE`: pertenencia vigente y elegible para futuros rankings.
- `SUSPENDED`: conserva la pertenencia, pero no es elegible para rankings activos. Puede reactivarse sobre la misma entrada.
- `WITHDRAWN`: cierre definitivo y con `valid_until`.
- `TRANSFERRED`: cierre por cambio de división dentro del mismo recorrido.

Ascenso y descenso son tipos explícitos de asignación (`PROMOTION` y `RELEGATION`); todavía no existen automatismos.

### Historial y concurrencia

Las entradas no se borran ni se convierten en otra categoría. La FK a `club_players` usa `ON DELETE RESTRICT` para impedir que una eliminación en cascada borre silenciosamente el historial.

Un trigger valida modalidad, club, cadena histórica y solapamientos. La unicidad por recorrido usa un advisory lock transaccional basado en club, jugador, temporada, rama y segmento, más bloqueos de las filas involucradas. Un índice parcial agrega una segunda defensa contra duplicados idénticos.

Los eventos mínimos de asignación, transferencia y cambios de estado se anexan en `metadata.events`. Este registro no reemplaza al futuro ledger de puntos.

### RPCs canónicas

`assign_player_to_competition_division(...)` crea, reactiva o transfiere una entrada de manera idempotente y atómica.

`set_competition_player_entry_status(...)` permite suspender, reactivar o retirar respetando temporada, división y entradas posteriores.

Los clientes autenticados no tienen permisos directos de INSERT, UPDATE o DELETE. Toda mutación ordinaria debe pasar por estas RPCs.

## Inicialización y backfill controlado (Etapa 2.5)

`initialize_club_competition_season(...)` crea o reutiliza una temporada anual `DRAFT` y los catálogos de `PADEL_TRADITIONAL`. Nunca activa una segunda temporada. Las siete divisiones legacy mínimas se crean solamente cuando se solicita: modalidad individual, rama Caballeros, sin segmento y categorías 1ª–7ª. No se genera un producto cartesiano.

`ensure_competition_division(club_id, season_id, modality, branch_id, segment_id, category_id, name)` es la operación idempotente para crear explícitamente una combinación válida. Verifica permisos, temporada y pertenencia al mismo club de todos los catálogos. No recibe ni persiste un slug porque `competition_divisions` no posee esa columna.

El diagnóstico legacy mapea exclusivamente `M → caballeros`, `F → damas` y categorías numéricas 1–7 mediante `legacy_category_id`. Solo considera divisiones `INDIVIDUAL`, sin segmento y de una temporada `ACTIVE`. Mixto, Veteranos y Menores no se infieren. Las ambigüedades o datos faltantes quedan para revisión manual.

El flujo separa cuatro momentos:

1. diagnóstico de solo lectura;
2. creación de un lote `DRAFT`, sin entradas competitivas;
3. revisión de cada item y aprobación explícita del lote;
4. ejecución transaccional mediante `assign_player_to_competition_division(..., 'LEGACY_BACKFILL', ...)`.

La identidad siempre es `club_player_id`. Los nombres duplicados son válidos y nunca se usan para fusionar registros. El proceso no almacena ni migra puntos, género o categoría legacy.

Solo puede existir un lote abierto por club y temporada. Crear el mismo lote nuevamente devuelve el existente. Ejecutar un lote ya ejecutado también es idempotente. Si falla un item, PostgreSQL revierte la ejecución completa: el lote permanece `APPROVED` y no quedan items parcialmente ejecutados.

## Pendiente

Todavía no existen:

- asignaciones de parejas;
- cuentas y ledger de puntos;
- standings y snapshots;
- endpoint V2;
- ABM visual;
- vínculo canónico con torneos;
- backfill aplicado de datos actuales; la infraestructura revisable existe, pero requiere aprobación operativa por lote.

## API de ranking individual (Etapa 3)

El endpoint existente `/api/clubs/{clubId}/ranking` conserva su body y selecciona el motor mediante la variable privada `RANKING_ENGINE_SOURCE` (`competition` por defecto; `legacy` permite rollback explícito). Se normalizan espacios y mayúsculas; cualquier otro valor falla explícitamente. La UI no conoce el flag ni consulta tablas competitivas. El header `X-Ranking-Engine-Source` permite diagnosticar el motor elegido sin alterar el contrato JSON ni hacer fallback silencioso.

En modo `competition`, la pertenencia, temporada, rama y categoría provienen exclusivamente de la temporada `ACTIVE`, divisiones `INDIVIDUAL` activas sin segmento y `competition_player_entries` `ACTIVE` vigentes. Un jugador con puntos legacy pero sin entrada no aparece; una entrada válida con cero puntos sí aparece. Los puntos continúan transitoriamente en `club_players.ranking_points` hasta que exista ledger. Un error del Competition Engine se devuelve al cliente y nunca activa el listado legacy. Las parejas y el catálogo `categories` del contrato permanecen en su fuente legacy durante esta transición.

Repository, service y mapper aíslan respectivamente acceso a Supabase, orden/empates y compatibilidad con el contrato anterior. El orden mantiene puntos, títulos, victorias y nombre, agregando `player_id` como desempate determinístico final.

## Próximas etapas

1. Validar y aplicar el modelo base.
2. Diseñar un backfill explícito y revisable.
3. Crear cuentas y ledger de puntos por temporada/división.
4. Incorporar asignaciones de jugadores y parejas.
5. Publicar API V2 y adaptar UI.
6. Integrar torneos, resultados, seeds y Master Final.
7. Retirar gradualmente las fuentes legacy.
