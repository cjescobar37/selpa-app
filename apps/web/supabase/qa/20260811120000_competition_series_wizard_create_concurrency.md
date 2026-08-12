# QA manual de concurrencia — alta APB de Circuito

Requiere dos sesiones PostgreSQL reales; no puede certificarse desde SQL Editor con una sola transacción.

1. En ambas sesiones autenticadas como el mismo OWNER/ADMIN, preparar exactamente el mismo `club_id`, `payload` y `idempotency_key` de al menos ocho caracteres.
2. Ejecutar en paralelo `select public.create_competition_series_from_wizard(...)`.
3. Ambas respuestas deben contener el mismo `series_id`.
4. Verificar una sola fila en `competition_series`, `competition_series_divisions`, `competition_series_rules` y `competition_series_eligibility` para ese `series_id`.
5. Repetir con la misma key y payload distinto: debe devolver conflicto controlado, sin nuevas filas.

No marcar esta prueba como PASS sin dos conexiones PostgreSQL concurrentes.
