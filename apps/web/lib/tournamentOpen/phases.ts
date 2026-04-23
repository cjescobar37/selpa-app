import { OpenTournamentEngineError, type OpenPlayoffPhase } from './types'

function assertPositiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 1) {
    throw new OpenTournamentEngineError('INVALID_INPUT', `${label} debe ser un entero positivo.`)
  }
}

export function getOpenPlayoffStartPhase(bracketSize: number): OpenPlayoffPhase {
  assertPositiveInteger(bracketSize, 'bracketSize')

  if (bracketSize === 64) return 'ROUND_OF_32'
  if (bracketSize === 32) return 'ROUND_OF_16'
  if (bracketSize === 16) return 'EIGHTHS'
  if (bracketSize === 8) return 'QUARTER'
  if (bracketSize === 4) return 'SEMI'
  if (bracketSize === 2) return 'FINAL'

  throw new OpenTournamentEngineError(
    'UNSUPPORTED_BRACKET_SIZE',
    'El tamaño del cuadro debe ser 2, 4, 8, 16, 32 o 64.'
  )
}
