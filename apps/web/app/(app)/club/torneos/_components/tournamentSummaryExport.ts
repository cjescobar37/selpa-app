import { jsPDF } from 'jspdf'
import type { PdfGroup, PdfMatch, TournamentExportData } from './tournamentExportData'

type SummaryKind = 'groups' | 'playoff'
type Dimensions = { width: number; height: number }

const palette = {
  navy: '#061b3a', ink: '#17253f', muted: '#64748b', cyan: '#0891b2', green: '#15803d',
  greenSoft: '#eef9f2', line: '#d7e1e8', surface: '#ffffff', canvas: '#f4f7fa',
}

const summaryLayoutDimensions: Record<SummaryKind, Dimensions> = {
  groups: { width: 1080, height: 1350 },
  playoff: { width: 1600, height: 900 },
}
export const summaryPngDimensions: Record<SummaryKind, Dimensions> = {
  groups: { width: 2160, height: 2700 },
  playoff: { width: 3200, height: 1800 },
}

const clean = (value: string) => value.replace(/[\u2010-\u2015\u2212]/g, '-').replace(/✓/g, 'OK')
const shortPair = (name: string) => name.startsWith('Ganador ') || name.startsWith('Pasa de ') ? name : name.split(' / ').map((player) => {
  const words = player.trim().split(/\s+/)
  return words.length > 1 ? `${words[0][0]}. ${words.at(-1)}` : player
}).join(' / ')

function compactDate(value: string) {
  if (!value) return ''
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return iso ? `${iso[3]}/${iso[2]}` : value
}

function scheduleLine(match: PdfMatch) {
  const parts = [compactDate(match.date), match.time, match.court].filter((value) => value && !/definir|pendiente/i.test(value))
  return parts.length ? parts.join(' · ') : 'Horario a definir'
}

export function assertSummaryFits(data: TournamentExportData, kind: SummaryKind) {
  if (kind === 'groups') {
    const gridRows = Math.ceil(data.groups.length / 2)
    const tallestRows = Math.max(0, ...data.groups.map((group) => group.rows.length))
    if (gridRows > 4 || tallestRows > 5) throw new Error('El resumen no entra de forma legible en una sola hoja. Usá el PDF completo.')
  } else {
    const firstRoundMatches = data.rounds[0]?.matches.length ?? 0
    if (data.rounds.length > 5 || firstRoundMatches > 8) throw new Error('La llave no entra de forma legible en una sola hoja. Usá el PDF completo.')
  }
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2)
  context.beginPath(); context.moveTo(x + r, y); context.arcTo(x + width, y, x + width, y + height, r)
  context.arcTo(x + width, y + height, x, y + height, r); context.arcTo(x, y + height, x, y, r)
  context.arcTo(x, y, x + width, y, r); context.closePath()
}

function font(context: CanvasRenderingContext2D, size: number, weight = 700) {
  context.font = `${weight} ${size}px Inter, Arial, sans-serif`
}

function fitted(context: CanvasRenderingContext2D, value: string, maxWidth: number) {
  const source = clean(value)
  if (context.measureText(source).width <= maxWidth) return source
  let result = source
  while (result.length > 3 && context.measureText(`${result}…`).width > maxWidth) result = result.slice(0, -1)
  return `${result.trim()}…`
}

function drawHeader(context: CanvasRenderingContext2D, data: TournamentExportData, kind: SummaryKind, width: number, height: number, scale: number) {
  const margin = width * .038
  context.fillStyle = palette.navy; context.fillRect(0, 0, width, height)
  context.fillStyle = palette.canvas; context.fillRect(0, height * .14, width, height * .86)
  context.fillStyle = '#22d3ee'; context.fillRect(0, 0, width * .58, Math.max(5, 5 * scale))
  context.fillStyle = '#ec4899'; context.fillRect(width * .58, 0, width * .42, Math.max(5, 5 * scale))
  font(context, 23 * scale, 700); context.fillStyle = '#22d3ee'; context.fillText('S E L P A', margin, height * .047)
  font(context, 14 * scale, 700); context.fillStyle = '#b9c9d8'; context.textAlign = 'right'
  context.fillText(`${kind === 'groups' ? 'GRUPOS' : 'PLAYOFF'} · RESUMEN`, width - margin, height * .047); context.textAlign = 'left'
  font(context, 30 * scale, 800); context.fillStyle = '#fff'; context.fillText(fitted(context, data.name, width - margin * 2), margin, height * .087)
  font(context, 14 * scale, 600); context.fillStyle = '#c8d5df'
  const dates = `${compactDate(data.startDate)}${data.endDate && data.endDate !== data.startDate ? ` - ${compactDate(data.endDate)}` : ''}`
  context.fillText(fitted(context, `${data.clubName} · ${data.categoryLabel} · ${data.gender} · ${dates}`, width - margin * 2), margin, height * .119)
  return { margin, top: height * .165, bottom: height * .955 }
}

function drawGroup(context: CanvasRenderingContext2D, group: PdfGroup, x: number, y: number, width: number, height: number, scale: number) {
  roundedRect(context, x, y, width, height, 12 * scale); context.fillStyle = palette.surface; context.fill(); context.strokeStyle = palette.line; context.lineWidth = 1.5 * scale; context.stroke()
  const pad = 13 * scale, titleH = 34 * scale, headH = 26 * scale, tieH = group.tiebreakLabel ? 25 * scale : 0
  font(context, 16 * scale, 800); context.fillStyle = palette.ink; context.fillText(fitted(context, group.name, width - pad * 2), x + pad, y + 22 * scale)
  const tableY = y + titleH
  context.fillStyle = palette.navy; context.fillRect(x + 1, tableY, width - 2, headH)
  const posW = 30 * scale, ptsW = 42 * scale, diffW = 43 * scale, nameX = x + pad + posW
  const ptsX = x + width - pad - diffW * 2 - ptsW
  font(context, 11 * scale, 700); context.fillStyle = '#fff'
  context.fillText('#', x + pad, tableY + 17 * scale); context.fillText('PAREJA', nameX, tableY + 17 * scale)
  context.textAlign = 'center'; context.fillText('PTS', ptsX + ptsW / 2, tableY + 17 * scale); context.fillText('DS', ptsX + ptsW + diffW / 2, tableY + 17 * scale); context.fillText('DG', ptsX + ptsW + diffW * 1.5, tableY + 17 * scale); context.textAlign = 'left'
  const rowH = Math.max(25 * scale, (height - titleH - headH - tieH) / Math.max(1, group.rows.length))
  group.rows.forEach((row, index) => {
    const rowY = tableY + headH + rowH * index
    if (row.qualified) { context.fillStyle = palette.greenSoft; context.fillRect(x + 1, rowY, width - 2, rowH) }
    context.strokeStyle = '#e6edf2'; context.beginPath(); context.moveTo(x + 1, rowY + rowH); context.lineTo(x + width - 1, rowY + rowH); context.stroke()
    font(context, 14 * scale, row.qualified ? 700 : 600); context.fillStyle = row.qualified ? palette.green : palette.muted
    context.fillText(`${row.qualified ? '✓' : ''}${index + 1}`, x + pad, rowY + rowH * .62)
    context.fillStyle = palette.ink; context.fillText(fitted(context, shortPair(row.name), ptsX - nameX - 7 * scale), nameX, rowY + rowH * .62)
    const [points, , , , setDiff, gameDiff] = row.metrics
    context.textAlign = 'center'; context.fillText(String(points), ptsX + ptsW / 2, rowY + rowH * .62); context.fillText(String(setDiff), ptsX + ptsW + diffW / 2, rowY + rowH * .62); context.fillText(String(gameDiff), ptsX + ptsW + diffW * 1.5, rowY + rowH * .62); context.textAlign = 'left'
  })
  if (group.tiebreakLabel) {
    font(context, 11 * scale, 600); context.fillStyle = palette.muted
    context.fillText(fitted(context, `Desempate · ${group.tiebreakLabel}`, width - pad * 2), x + pad, y + height - 8 * scale)
  }
}

function drawGroups(context: CanvasRenderingContext2D, data: TournamentExportData, width: number, height: number, scale: number, top: number, bottom: number, margin: number) {
  const columns = 2, gap = 18 * scale, rowGap = 14 * scale, gridRows = Math.ceil(data.groups.length / columns)
  const cardW = (width - margin * 2 - gap) / columns
  const cardH = (bottom - top - rowGap * Math.max(0, gridRows - 1)) / Math.max(1, gridRows)
  data.groups.forEach((group, index) => drawGroup(context, group, margin + (index % 2) * (cardW + gap), top + Math.floor(index / 2) * (cardH + rowGap), cardW, cardH, scale))
}

function drawPlayoffCard(context: CanvasRenderingContext2D, match: PdfMatch, x: number, y: number, width: number, height: number, scale: number) {
  roundedRect(context, x, y, width, height, 8 * scale); context.fillStyle = match.teams.length === 1 ? palette.greenSoft : palette.surface; context.fill(); context.strokeStyle = palette.line; context.lineWidth = 1.4 * scale; context.stroke()
  const pad = 9 * scale
  font(context, 13 * scale, 700); context.fillStyle = palette.cyan; context.fillText(match.code, x + pad, y + 15 * scale)
  const teams = match.teams.length ? match.teams : [{ name: match.sources[0] ?? 'Equipo por definir', seed: null, winner: false, scores: [] }]
  font(context, 15 * scale, 700); context.fillStyle = palette.ink
  context.fillText(fitted(context, shortPair(teams[0].name), width - pad * 2), x + pad, y + 32 * scale)
  if (teams[1]) context.fillText(fitted(context, shortPair(teams[1].name), width - pad * 2), x + pad, y + 48 * scale)
  else { font(context, 11 * scale, 600); context.fillStyle = palette.green; context.fillText('Pasa directo', x + pad, y + 48 * scale) }
  font(context, 11 * scale, 500); context.fillStyle = palette.muted; context.fillText(fitted(context, scheduleLine(match), width - pad * 2), x + pad, y + height - 8 * scale)
}

function drawPlayoff(context: CanvasRenderingContext2D, data: TournamentExportData, width: number, height: number, scale: number, top: number, bottom: number, margin: number) {
  const rounds = data.rounds, gap = 22 * scale, colW = (width - margin * 2 - gap * Math.max(0, rounds.length - 1)) / Math.max(1, rounds.length)
  const firstCount = Math.max(1, rounds[0]?.matches.length ?? 1), pitch = (bottom - top - 28 * scale) / firstCount, cardH = Math.min(72 * scale, pitch - 7 * scale)
  const center = (roundIndex: number, slotIndex: number) => top + 28 * scale + ((slotIndex + .5) * 2 ** roundIndex) * pitch
  rounds.forEach((round, roundIndex) => {
    const x = margin + roundIndex * (colW + gap)
    font(context, 14 * scale, 700); context.fillStyle = palette.cyan; context.fillText(round.name.toUpperCase(), x, top + 14 * scale)
    round.matches.forEach((match, slotIndex) => {
      const cy = center(roundIndex, slotIndex), y = cy - cardH / 2
      if (rounds[roundIndex + 1]?.matches[Math.floor(slotIndex / 2)]) {
        const nextY = center(roundIndex + 1, Math.floor(slotIndex / 2)), elbow = x + colW + gap / 2
        context.strokeStyle = '#9cb0bf'; context.lineWidth = 1.5 * scale; context.beginPath(); context.moveTo(x + colW, cy); context.lineTo(elbow, cy); context.lineTo(elbow, nextY); context.lineTo(x + colW + gap, nextY); context.stroke()
      }
      drawPlayoffCard(context, match, x, y, colW, cardH, scale)
    })
  })
  if (data.champion) {
    font(context, 11 * scale, 900); context.fillStyle = palette.green
    context.textAlign = 'right'; context.fillText(fitted(context, `CAMPEÓN · ${data.champion}`, width * .42), width - margin, bottom + 22 * scale); context.textAlign = 'left'
  }
}

function renderCanvas(data: TournamentExportData, kind: SummaryKind, dimensions: Dimensions, renderScale = 1) {
  assertSummaryFits(data, kind)
  const canvas = document.createElement('canvas'); canvas.width = dimensions.width * renderScale; canvas.height = dimensions.height * renderScale
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Este navegador no permite generar la exportación gráfica.')
  context.scale(renderScale, renderScale)
  context.textBaseline = 'alphabetic'
  const scale = Math.min(dimensions.width / 1200, dimensions.height / 900)
  const frame = drawHeader(context, data, kind, dimensions.width, dimensions.height, scale)
  if (kind === 'groups') drawGroups(context, data, dimensions.width, dimensions.height, scale, frame.top, frame.bottom, frame.margin)
  else drawPlayoff(context, data, dimensions.width, dimensions.height, scale, frame.top, frame.bottom - 28 * scale, frame.margin)
  font(context, 8 * scale, 700); context.fillStyle = palette.muted; context.fillText('SELPA · Resumen para compartir', frame.margin, dimensions.height * .982)
  return canvas
}

function renderVectorPdf(data: TournamentExportData, kind: SummaryKind) {
  assertSummaryFits(data, kind)
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4', compress: true })
  doc.setProperties({ title: `${data.name} - ${kind === 'groups' ? 'Grupos' : 'Playoff'} - Resumen`, author: 'SELPA', creator: 'SELPA' })
  const pageW = doc.internal.pageSize.getWidth()
  const design = { width: 1684, height: 1190 }, unit = pageW / design.width
  const u = (value: number) => value * unit
  const setColor = (color: string, target: 'fill' | 'text' | 'draw') => {
    if (target === 'fill') doc.setFillColor(color)
    else if (target === 'text') doc.setTextColor(color)
    else doc.setDrawColor(color)
  }
  const text = (value: string, x: number, y: number, size: number, weight: 'normal' | 'bold' = 'normal', color = palette.ink, align: 'left' | 'right' | 'center' = 'left') => {
    doc.setFont('helvetica', weight); doc.setFontSize(u(size)); setColor(color, 'text'); doc.text(clean(value), u(x), u(y), { align })
  }
  const fit = (value: string, maxWidth: number, size: number, weight: 'normal' | 'bold' = 'normal') => {
    doc.setFont('helvetica', weight); doc.setFontSize(u(size))
    const source = clean(value)
    if (doc.getTextWidth(source) <= u(maxWidth)) return source
    let result = source
    while (result.length > 3 && doc.getTextWidth(`${result}...`) > u(maxWidth)) result = result.slice(0, -1)
    return `${result.trim()}...`
  }
  const rect = (x: number, y: number, width: number, height: number, fill: string, stroke = palette.line, radius = 0) => {
    setColor(fill, 'fill'); setColor(stroke, 'draw'); doc.setLineWidth(u(1.5))
    if (radius) doc.roundedRect(u(x), u(y), u(width), u(height), u(radius), u(radius), 'FD')
    else doc.rect(u(x), u(y), u(width), u(height), 'FD')
  }
  const line = (x1: number, y1: number, x2: number, y2: number, color = '#9cb0bf', width = 1.5) => {
    setColor(color, 'draw'); doc.setLineWidth(u(width)); doc.line(u(x1), u(y1), u(x2), u(y2))
  }
  const margin = design.width * .038, top = design.height * .165, bottom = design.height * .955
  rect(0, 0, design.width, design.height, palette.navy, palette.navy)
  rect(0, design.height * .14, design.width, design.height * .86, palette.canvas, palette.canvas)
  rect(0, 0, design.width * .58, 6, '#22d3ee', '#22d3ee'); rect(design.width * .58, 0, design.width * .42, 6, '#ec4899', '#ec4899')
  text('S E L P A', margin, design.height * .047, 23, 'bold', '#22d3ee')
  text(`${kind === 'groups' ? 'GRUPOS' : 'PLAYOFF'} · RESUMEN`, design.width - margin, design.height * .047, 14, 'bold', '#b9c9d8', 'right')
  text(fit(data.name, design.width - margin * 2, 30, 'bold'), margin, design.height * .087, 30, 'bold', '#ffffff')
  const dates = `${compactDate(data.startDate)}${data.endDate && data.endDate !== data.startDate ? ` - ${compactDate(data.endDate)}` : ''}`
  text(fit(`${data.clubName} · ${data.categoryLabel} · ${data.gender} · ${dates}`, design.width - margin * 2, 14), margin, design.height * .119, 14, 'normal', '#c8d5df')

  if (kind === 'groups') {
    const gap = 24, rowGap = 18, gridRows = Math.ceil(data.groups.length / 2), cardW = (design.width - margin * 2 - gap) / 2
    const cardH = (bottom - top - rowGap * Math.max(0, gridRows - 1)) / Math.max(1, gridRows)
    data.groups.forEach((group, index) => {
      const x = margin + (index % 2) * (cardW + gap), y = top + Math.floor(index / 2) * (cardH + rowGap), pad = 17, titleH = 45, headH = 34, tieH = group.tiebreakLabel ? 31 : 0
      rect(x, y, cardW, cardH, palette.surface, palette.line, 12)
      text(fit(group.name, cardW - pad * 2, 18, 'bold'), x + pad, y + 29, 18, 'bold')
      const tableY = y + titleH; rect(x + 1, tableY, cardW - 2, headH, palette.navy, palette.navy)
      const posW = 38, ptsW = 54, diffW = 54, nameX = x + pad + posW, ptsX = x + cardW - pad - diffW * 2 - ptsW
      text('#', x + pad, tableY + 23, 12, 'bold', '#fff'); text('PAREJA', nameX, tableY + 23, 12, 'bold', '#fff')
      text('PTS', ptsX + ptsW / 2, tableY + 23, 12, 'bold', '#fff', 'center'); text('DS', ptsX + ptsW + diffW / 2, tableY + 23, 12, 'bold', '#fff', 'center'); text('DG', ptsX + ptsW + diffW * 1.5, tableY + 23, 12, 'bold', '#fff', 'center')
      const rowH = Math.max(32, (cardH - titleH - headH - tieH) / Math.max(1, group.rows.length))
      group.rows.forEach((row, rowIndex) => {
        const rowY = tableY + headH + rowH * rowIndex
        if (row.qualified) rect(x + 1, rowY, cardW - 2, rowH, palette.greenSoft, palette.greenSoft)
        line(x + 1, rowY + rowH, x + cardW - 1, rowY + rowH, '#e6edf2', 1)
        if (row.qualified) { line(x + pad, rowY + rowH * .54, x + pad + 4, rowY + rowH * .64, palette.green, 2); line(x + pad + 4, rowY + rowH * .64, x + pad + 11, rowY + rowH * .42, palette.green, 2) }
        text(String(rowIndex + 1), x + pad + (row.qualified ? 14 : 0), rowY + rowH * .64, 14, row.qualified ? 'bold' : 'normal', row.qualified ? palette.green : palette.muted)
        text(fit(shortPair(row.name), ptsX - nameX - 9, 14, row.qualified ? 'bold' : 'normal'), nameX, rowY + rowH * .64, 14, row.qualified ? 'bold' : 'normal')
        const [points, , , , setDiff, gameDiff] = row.metrics
        text(String(points), ptsX + ptsW / 2, rowY + rowH * .64, 14, 'bold', palette.ink, 'center'); text(String(setDiff), ptsX + ptsW + diffW / 2, rowY + rowH * .64, 14, 'normal', palette.ink, 'center'); text(String(gameDiff), ptsX + ptsW + diffW * 1.5, rowY + rowH * .64, 14, 'normal', palette.ink, 'center')
      })
      if (group.tiebreakLabel) text(fit(`Desempate · ${group.tiebreakLabel}`, cardW - pad * 2, 11), x + pad, y + cardH - 10, 11, 'normal', palette.muted)
    })
  } else {
    const rounds = data.rounds, gap = 24, playoffBottom = bottom - 38, colW = (design.width - margin * 2 - gap * Math.max(0, rounds.length - 1)) / Math.max(1, rounds.length)
    const firstCount = Math.max(1, rounds[0]?.matches.length ?? 1), pitch = (playoffBottom - top - 38) / firstCount, cardH = Math.min(88, pitch - 8)
    const center = (roundIndex: number, slotIndex: number) => top + 38 + ((slotIndex + .5) * 2 ** roundIndex) * pitch
    rounds.forEach((round, roundIndex) => {
      const x = margin + roundIndex * (colW + gap)
      text(round.name.toUpperCase(), x, top + 18, 14, 'bold', palette.cyan)
      round.matches.forEach((match, slotIndex) => {
        const cy = center(roundIndex, slotIndex), y = cy - cardH / 2
        if (rounds[roundIndex + 1]?.matches[Math.floor(slotIndex / 2)]) {
          const nextY = center(roundIndex + 1, Math.floor(slotIndex / 2)), elbow = x + colW + gap / 2
          line(x + colW, cy, elbow, cy); line(elbow, cy, elbow, nextY); line(elbow, nextY, x + colW + gap, nextY)
        }
        rect(x, y, colW, cardH, match.teams.length === 1 ? palette.greenSoft : palette.surface, palette.line, 9)
        const pad = 11, teams = match.teams.length ? match.teams : [{ name: match.sources[0] ?? 'Equipo por definir', seed: null, winner: false, scores: [] }]
        text(match.code, x + pad, y + 18, 13, 'bold', palette.cyan)
        text(fit(shortPair(teams[0].name), colW - pad * 2, 15, 'bold'), x + pad, y + 39, 15, 'bold')
        if (teams[1]) text(fit(shortPair(teams[1].name), colW - pad * 2, 15, 'bold'), x + pad, y + 57, 15, 'bold')
        else text('Pasa directo', x + pad, y + 57, 11, 'normal', palette.green)
        text(fit(scheduleLine(match), colW - pad * 2, 11), x + pad, y + cardH - 9, 11, 'normal', palette.muted)
      })
    })
    if (data.champion) text(fit(`CAMPEÓN · ${data.champion}`, design.width * .42, 13, 'bold'), design.width - margin, playoffBottom + 29, 13, 'bold', palette.green, 'right')
  }
  text('SELPA · Resumen para compartir', margin, design.height * .982, 9, 'normal', palette.muted)
  return doc
}

export function tournamentSummaryPdf(data: TournamentExportData, kind: SummaryKind) {
  return renderVectorPdf(data, kind).output('blob')
}

export async function tournamentSummaryPng(data: TournamentExportData, kind: SummaryKind) {
  await document.fonts.ready
  const canvas = renderCanvas(data, kind, summaryLayoutDimensions[kind], 2)
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('No pudimos generar la imagen PNG.')), 'image/png'))
}
