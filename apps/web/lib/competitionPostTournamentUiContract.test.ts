import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const operations = readFileSync(join(process.cwd(), 'app/(app)/club/competition/EventOperationsDashboard.tsx'), 'utf8')
const operationStyles = readFileSync(join(process.cwd(), 'app/(app)/club/competition/EventOperationsDashboard.module.css'), 'utf8')
const homologation = readFileSync(join(process.cwd(), 'app/(app)/club/competition/EventHomologationAdmin.tsx'), 'utf8')
const homologationStyles = readFileSync(join(process.cwd(), 'app/(app)/club/competition/EventHomologationAdmin.module.css'), 'utf8')
const settlement = readFileSync(join(process.cwd(), 'app/(app)/club/competition/EventSettlementPanel.tsx'), 'utf8')

test('operation exposes one human post-tournament action instead of technical lifecycle buttons', () => {
  assert.match(operations, /'Cerrar fecha'/)
  assert.match(operations, />Revisar resultados<\/Link>/)
  assert.match(operations, />Publicar puntos<\/Link>/)
  assert.doesNotMatch(operations, />Preparar fecha<\/button>/)
  assert.doesNotMatch(operations, />Cerrar fecha deportiva<\/button>/)
  assert.doesNotMatch(operations, />Generar homologación<\/Link>/)
})

test('navy primary action always has visible centered text and AA contrast colors', () => {
  assert.match(operationStyles, /\.primary\{font-size:13px;line-height:1\.2;text-align:center;white-space:nowrap\}/)
  assert.match(operationStyles, /\.primary,\.action\{min-height:44px;color:#fff\}/)
  assert.match(operationStyles, /background:#071a38;color:#fff/)
})

test('homologation uses state-derived banner, three review tabs and a sticky mobile approval', () => {
  assert.match(homologation, /h\.status === 'APPROVED'[\s\S]*h\.status === 'SUBMITTED'[\s\S]*extracted/)
  assert.match(homologation, /Participantes <span>/)
  assert.match(homologation, /Resultados <span>/)
  assert.match(homologation, /Incidencias <span>/)
  assert.match(homologationStyles, /\.reviewHeader\{position:sticky/)
  assert.match(homologationStyles, /\.stickyAction\{position:fixed/)
  assert.match(homologation, /useState<ReviewTab>\('results'\)/)
  assert.match(homologation, /DRAFT: 'Pendiente de aprobación'/)
  assert.match(homologation, /Ya podés calcular los puntos\./)
  assert.doesNotMatch(homologation, /#\{value\(row, \['final_position'\]/)
})

test('settlement shows a preview before its single publish action', () => {
  assert.match(settlement, /prepareCompetitionPointsPreview/)
  assert.match(settlement, /DISTRIBUCIÓN/)
  assert.match(settlement, /'Publicar puntos'/)
  assert.doesNotMatch(settlement, />Enviar a revisión<\/button>/)
  assert.doesNotMatch(settlement, />Aprobar puntos<\/button>/)
})

test('points preview names its immutable source and offers a safe per-date adjustment', () => {
  assert.match(settlement, /Esquema usado/)
  assert.match(settlement, /Snapshot de \{sourceName\}/)
  assert.match(settlement, /Ajustar puntos de esta fecha/)
  assert.match(settlement, /Se creará una copia privada/)
  assert.match(settlement, /Editar tabla del circuito para próximas fechas/)
})

test('homologation keeps correction friendly and manual supersede behind diagnostics', () => {
  assert.match(homologation, /'Corregir resultados'/)
  assert.match(homologation, /Diagnóstico: reemplazar homologación/)
  assert.match(homologation, /Motivo obligatorio/)
  assert.doesNotMatch(homologation, />Crear corrección<\/button>/)
})

test('team rows stay compact at 390 and 430 while desktop switches at 768', () => {
  assert.match(homologationStyles, /\.page\{width:100%;max-width:900px/)
  assert.match(homologationStyles, /\.rows article>div,\.results span,\.evidence span\{min-width:0;flex:1\}/)
  assert.match(homologationStyles, /\.results\.results b\{width:auto;flex:none/)
  assert.match(homologationStyles, /@media\(min-width:768px\)/)
})
