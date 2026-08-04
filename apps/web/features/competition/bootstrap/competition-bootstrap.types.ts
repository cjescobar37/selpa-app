export type BootstrapAction = { resource: string; name: string; outcome: 'CREATED' | 'REUSED' }
export type CompetitionBootstrapResult = { seriesId: string; actions: BootstrapAction[] }
