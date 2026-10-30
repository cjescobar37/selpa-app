/** Compare working-tree lint with HEAD using identical current config/dependencies.
 * HEAD sources are read in memory; never replaces files, stashes or checkouts. */
import { ESLint } from 'eslint'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const eslint = new ESLint()
const current = await eslint.lintFiles(['app', 'components', 'features', 'lib'])
const tracked = new Set(execFileSync('git', ['ls-files', '--', 'app', 'components', 'features', 'lib'], { encoding: 'utf8' }).trim().split('\n'))
const findings = result => result.messages.map(({ ruleId, severity, message }) => JSON.stringify({ ruleId, severity, message })).sort()
const count = results => results.reduce((out, r) => ({ errors: out.errors + r.errorCount, warnings: out.warnings + r.warningCount }), { errors: 0, warnings: 0 })
const baseline = [], differences = [], regressions = [], untracked = []
for (const result of current) {
  const relative = path.relative(process.cwd(), result.filePath).replaceAll('\\', '/')
  if (!tracked.has(relative)) {
    if (result.messages.length) untracked.push({ file: relative, errors: result.errorCount, warnings: result.warningCount })
    continue
  }
  const source = execFileSync('git', ['show', `HEAD:apps/web/${relative}`], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
  const [base] = await eslint.lintText(source, { filePath: result.filePath })
  if (!base) throw Error(`No baseline lint result for ${relative}`)
  baseline.push(base)
  const before = findings(base), after = findings(result)
  if (JSON.stringify(before) !== JSON.stringify(after)) differences.push({ file: relative, before, after })
  const remaining = [...before]
  const introduced = after.filter(finding => {
    const index = remaining.indexOf(finding)
    if (index < 0) return true
    remaining.splice(index, 1)
    return false
  })
  if (introduced.length) regressions.push({ file: relative, introduced })
}
console.log(JSON.stringify({ head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), current: count(current), baseline: count(baseline), comparedFiles: baseline.length, differences, regressions, untracked }, null, 2))
process.exitCode = regressions.length || untracked.some(r => r.errors) ? 1 : 0
