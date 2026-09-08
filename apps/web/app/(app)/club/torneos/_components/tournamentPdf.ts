import { jsPDF } from 'jspdf'
import type { PdfMatch, TournamentExportData } from './tournamentExportData'

const navy = '#15304b', muted = '#63788b', accent = '#087f91', border = '#cfdae2'
const clean = (s: string) => s.replace(/[\u2010-\u2015\u2212]/g, '-').replace(/→/g, '>').replace(/✓/g, '*')
const shortPair = (name: string) => name.startsWith('Ganador ') || name.startsWith('Pasa de ') ? name : name.split(' / ').map((p) => {
  const words = p.trim().split(/\s+/)
  return words.length > 1 ? `${words[0][0]}. ${words.at(-1)}` : p
}).join(' / ')
const date = (value: string) => value ? value.split('T')[0].split('-').reverse().join('/') : 'Fecha por definir'

/** Vector PDF only: public strings and numbers, no DOM rasterization or remote requests. */
export function tournamentPdf(data: TournamentExportData, kind: 'playoff' | 'groups'): Blob {
  const doc = new jsPDF({ orientation: kind === 'playoff' ? 'landscape' : 'portrait', unit: 'pt', format: 'a4', compress: true })
  doc.setProperties({ title: `${data.name} - ${kind === 'playoff' ? 'Playoff' : 'Grupos'}`, author: 'SELPA', creator: 'SELPA' })
  const pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight(), margin = 28
  const text = (value: string, x: number, y: number, size = 9, weight: 'normal' | 'bold' = 'normal', color = navy) => {
    doc.setFont('helvetica', weight); doc.setFontSize(size); doc.setTextColor(color); doc.text(clean(value), x, y)
  }
  const lines = (value: string, width: number, size = 9, weight: 'normal' | 'bold' = 'normal'): string[] => {
    doc.setFont('helvetica', weight); doc.setFontSize(size)
    return doc.splitTextToSize(clean(value), width) as string[]
  }
  const wrapped = (value: string, x: number, y: number, width: number, size = 9, weight: 'normal' | 'bold' = 'normal') => {
    const rows = lines(value, width, size, weight)
    rows.forEach((row, i) => text(row, x, y + i * (size + 3), size, weight))
    return rows.length * (size + 3)
  }
  const header = (section: string) => {
    text('S E L P A', margin, 29, 13, 'bold', accent)
    doc.setFontSize(9)
    text(section.toUpperCase(), pageW - margin - doc.getTextWidth(section.toUpperCase()), 29, 9, 'bold', muted)
    const titleH = wrapped(data.name, margin, 51, pageW - margin * 2, 17, 'bold')
    const metaH = wrapped(`${data.clubName}  |  ${data.categoryLabel}  |  ${data.gender}  |  ${date(data.startDate)}${data.endDate && data.endDate !== data.startDate ? ` - ${date(data.endDate)}` : ''}`, margin, 53 + titleH, pageW - margin * 2, 9)
    const bottom = 58 + titleH + metaH
    doc.setDrawColor(border); doc.line(margin, bottom, pageW - margin, bottom)
    return bottom + 18
  }
  const newPage = (section: string) => { doc.addPage(); return header(section) }
  const matchHeaderHeight = (match: PdfMatch) => match.teams.some((team) => team.scores.length) ? 36 : 22
  const matchHeight = (match: PdfMatch, width: number) => matchHeaderHeight(match) + match.teams.reduce((h, t) => h + Math.max(22, lines(t.name, width - 108, 9, t.winner ? 'bold' : 'normal').length * 12 + 7), 0) + (match.sources.length ? 16 : 0)
  const matchCard = (match: PdfMatch, x: number, y: number, width: number) => {
    const h = matchHeight(match, width)
    doc.setDrawColor(border); doc.setFillColor('#ffffff'); doc.roundedRect(x, y, width, h, 5, 5, 'FD')
    text(`${match.code}  ·  ${match.state}`, x + 9, y + 14, 9, 'bold')
    if (matchHeaderHeight(match) === 36) text(`${match.date}  ${match.time}  ·  ${match.court}`, x + 9, y + 27, 8, 'normal', muted)
    let yy = y + matchHeaderHeight(match) + 5
    match.teams.forEach((team, side) => {
      const hh = Math.max(22, lines(team.name, width - 108, 9, team.winner ? 'bold' : 'normal').length * 12 + 7)
      if (team.winner) { doc.setFillColor('#eef9f2'); doc.rect(x + 5, yy - 10, width - 10, hh, 'F') }
      text(team.seed === null ? '' : `(${team.seed})`, x + 9, yy, 8, 'normal', muted)
      wrapped(team.name, x + 33, yy, width - 108, 9, team.winner ? 'bold' : 'normal')
      team.scores.forEach((score, i) => {
        if (side === 0) text(match.labels[i], x + width - 61 + i * 19, yy - 10, 6, 'normal', muted)
        text(score, x + width - 61 + i * 19, yy + 1, 9, team.winner ? 'bold' : 'normal')
      })
      yy += hh
    })
    if (match.sources.length) text(match.sources.join(' / '), x + 9, y + h - 7, 7, 'normal', muted)
    return h
  }

  if (kind === 'playoff') {
    let top = header('Playoff · Vista general')
    text('Códigos y recorrido completo. Nombres completos y resultados en las páginas siguientes.', margin, top, 8, 'normal', muted)
    top += 22
    const rounds = data.rounds, firstCount = Math.max(1, rounds[0]?.matches.length ?? 1)
    const pitchX = (pageW - margin * 2) / Math.max(1, rounds.length), cardW = pitchX - 17
    const pitchY = (pageH - top - 45) / firstCount
    const cardH = Math.min(46, pitchY - 5)
    const center = (ri: number, si: number) => top + ((si + .5) * 2 ** ri) * pitchY
    rounds.forEach((round, ri) => {
      const x = margin + ri * pitchX
      text(round.name.toUpperCase(), x + 3, top - 7, 8, 'bold', accent)
      round.matches.forEach((match, si) => {
        const cy = center(ri, si), y = cy - cardH / 2
        if (rounds[ri + 1]?.matches[Math.floor(si / 2)]) {
          const nextY = center(ri + 1, Math.floor(si / 2))
          doc.setDrawColor('#a6bcc8'); doc.setLineWidth(.6)
          doc.line(x + cardW, cy, x + cardW + 8, cy); doc.line(x + cardW + 8, cy, x + cardW + 8, nextY); doc.line(x + cardW + 8, nextY, x + pitchX, nextY)
        }
        doc.setDrawColor(border); doc.setFillColor(match.teams.length === 1 ? '#f0f8f2' : '#ffffff'); doc.roundedRect(x, y, cardW, cardH, 3, 3, 'FD')
        const size = Math.max(5, Math.min(8, cardH / 5.5))
        text(`${match.code} · ${match.state}`, x + 5, y + size + 2, size - .4, 'bold', muted)
        match.teams.forEach((team, side) => {
          const label = `${team.seed === null ? '' : `(${team.seed}) `}${shortPair(team.name)}`
          const labelRows = lines(label, cardW - 43, size)
          const ty = y + size + 3 + (side + 1) * (cardH - size - 5) / 2
          text(labelRows[0], x + 5, ty, size, team.winner ? 'bold' : 'normal')
          if (labelRows.length > 1 && cardH >= 42) text(labelRows.slice(1).join(' '), x + 5, ty + size, size - 1)
          text(team.scores.join(' '), x + cardW - 36, ty, size - .3)
        })
      })
    })
    // Detail pages keep every full name readable, even for a large printed bracket.
    let detailY = pageH
    const width = (pageW - margin * 2 - 14) / 2
    data.rounds.forEach((round) => {
      const firstRowHeight = Math.max(0, ...round.matches.slice(0, 2).map((m) => matchHeight(m, width)))
      if (detailY + 25 + firstRowHeight > pageH - 35) detailY = newPage('Playoff · Partidos y resultados')
      text(round.name.toUpperCase(), margin, detailY, 11, 'bold', accent)
      let y = detailY + 13
      for (let i = 0; i < round.matches.length; i += 2) {
        const row = round.matches.slice(i, i + 2), h = Math.max(...row.map((m) => matchHeight(m, width)))
        if (y + h > pageH - 35) y = newPage(`Playoff · ${round.name} (continuación)`)
        row.forEach((match, column) => matchCard(match, margin + column * (width + 14), y, width))
        y += h + 10
      }
      if (round === data.rounds.at(-1) && data.champion) {
        if (y + 60 > pageH - 35) y = newPage('Playoff · Campeón')
        text('CAMPEÓN', margin, y + 12, 9, 'bold', accent)
        wrapped(data.champion, margin, y + 32, pageW - margin * 2, 15, 'bold')
      }
      detailY = y + 16
    })
  } else {
    data.groups.forEach((group, index) => {
      let y = index === 0 ? header(`Grupos · ${group.name}`) : newPage(`Grupos · ${group.name}`)
      text(group.name.toUpperCase(), margin, y, 12, 'bold', accent); y += 12
      const width = pageW - margin * 2, metricStart = margin + width - 168
      const tableHeader = () => {
        doc.setFillColor('#edf5f7'); doc.rect(margin, y, width, 23, 'F')
        text('# / SEED', margin + 6, y + 15, 7, 'bold'); text('PAREJA', margin + 60, y + 15, 8, 'bold')
        ;['PTS', 'PJ', 'G', 'P', 'DS', 'DG'].forEach((label, i) => text(label, metricStart + i * 28 + 4, y + 15, 8, 'bold'))
        y += 23
      }
      tableHeader()
      group.rows.forEach((row, position) => {
        const h = Math.max(36, lines(row.name, metricStart - margin - 72, 9, row.qualified ? 'bold' : 'normal').length * 12 + 18)
        if (y + h > pageH - 40) { y = newPage(`Grupos · ${group.name} (tabla)`); tableHeader() }
        if (row.qualified) { doc.setFillColor('#eef9f2'); doc.rect(margin, y, width, h, 'F') }
        text(`${position + 1} / ${row.seed ?? '-'}`, margin + 6, y + 15, 8)
        wrapped(row.name, margin + 60, y + 14, metricStart - margin - 72, 9, row.qualified ? 'bold' : 'normal')
        if (row.qualified) text('CLASIFICA', margin + 60, y + h - 4, 6, 'bold', accent)
        row.metrics.forEach((value, i) => text(String(value), metricStart + i * 28 + 6, y + 17, 9, i === 0 ? 'bold' : 'normal'))
        doc.setDrawColor(border); doc.line(margin, y + h, pageW - margin, y + h); y += h
      })
      y += 20; text('PARTIDOS Y RESULTADOS', margin, y, 10, 'bold', accent); y += 10
      group.matches.forEach((match) => {
        const h = matchHeight(match, width)
        if (y + h > pageH - 35) y = newPage(`Grupos · ${group.name} (partidos)`)
        y += matchCard(match, margin, y, width) + 9
      })
    })
  }
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); doc.setDrawColor(border); doc.line(margin, pageH - 25, pageW - margin, pageH - 25)
    text(`SELPA · ${kind === 'playoff' ? 'Playoff' : 'Grupos'} · Exportado ${new Date().toLocaleString('es-AR')}`, margin, pageH - 13, 7, 'normal', muted)
    text(`${p} / ${pages}`, pageW - margin - 22, pageH - 13, 7, 'normal', muted)
  }
  return doc.output('blob')
}
