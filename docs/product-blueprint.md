# SELPA Product Blueprint

## Competencias

- **Torneo:** competencia independiente.
- **Circuito:** competencia compuesta por varias fechas.
- Toda fecha de circuito es un torneo; no todo torneo pertenece a un circuito.

Tournament Engine administra inscripciones, parejas, seed, grupos, fixture,
partidos, resultados, playoff y campeón. Competition Engine administra
temporadas, circuitos, reglas longitudinales, puntos, homologación, settlement,
ledger y ranking. Estas responsabilidades no se duplican.

## Modelo deportivo visible

- Género: Caballeros, Damas y Mixto. Mixto exige una jugadora y un jugador por pareja.
- Grupo: Libres, Menores y Veteranos.
- Libres: categorías 1ra a 8va.
- Menores: Sub 10, Sub 12, Sub 14, Sub 16 y Sub 18.
- Veteranos: +35, +40, +45, +50, +55 y +60.
- En V1 las edades no difieren entre Damas y Caballeros.
- Jerarquía: solo valores soportados por Tournament Engine.
- Modalidad: regla de participantes (categoría fija o Suma XX), sin redefinir su lógica.
- Formato: forma de disputa, separado de género, grupo, jerarquía y modalidad.

## Decisiones de producto

- La UI usa lenguaje de pádel argentino y oculta códigos, IDs y revisiones.
- Las opciones avanzadas permanecen cerradas por defecto.
- Crear Torneo conserva un wizard horizontal de siete pasos.
- Flyer y sponsors pertenecen a Publicación; la revisión final es independiente.
- El modelo actual aún no vincula torneos con categorías etarias configurables;
  la UI no debe simular una elegibilidad que el motor no pueda aplicar.
