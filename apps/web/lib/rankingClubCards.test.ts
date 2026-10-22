import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = (file: string) => readFileSync(file, 'utf8')
const card = source('components/public/PublishedRankingClubCard.tsx')
const css = source('components/public/PublishedRankingClubCard.module.css')

test('public home, embedded community and ranking directory use one club ranking card', () => {
  for (const file of ['components/public/PublicHomeExperience.tsx', 'components/public/PublicRankingExperience.tsx']) {
    const content = source(file)
    assert.match(content, /<RankingClubCards>/)
    assert.match(content, /<PublishedRankingClubCard/)
    assert.doesNotMatch(content, /<PublicRankingClubCard\b|className=\{styles\.clubCard\}/)
  }
  assert.match(source('components/public/PublicHomeEmbed.tsx'), /<PublicHomeExperience/)
})

test('original logos are contained, with existing fallback, not cropped or replaced', () => {
  assert.match(card, /RankingPlayerAvatar name=\{name\} src=\{buildAssetProxyUrl\(logoUrl\)\}/)
  assert.match(card, /64px, 72px/)
  assert.match(css, /\.logo img\{object-fit:contain!important\}/)
  assert.match(source('components/ranking/RankingPlayerAvatar.tsx'), /failedSrc|onError/)
})

test('one semantic link exposes the full club name and retains ranking destinations', () => {
  assert.match(card, /<Link className=\{styles\.card\} href=\{href\}/)
  assert.match(card, /title=\{name\}/)
  assert.match(card, /aria-label=/)
  assert.doesNotMatch(card, /<button|role="button"|tabIndex/)
  assert.match(source('components/public/PublicHomeExperience.tsx'), /href=\{`\/ranking\?clubId=\$\{club\.id\}`\}/)
  assert.match(source('components/public/PublicRankingExperience.tsx'), /href=\{rankingHref\(\{clubId:club\.id,gender:params\.gender\}\)\}/)
})

test('compact mobile cards and scoped grid do not add global overrides or motion', () => {
  assert.match(css, /min-height:96px/)
  assert.match(css, /grid-template-columns:72px minmax\(0,1fr\)/)
  assert.match(css, /@media\(max-width:350px\)/)
  assert.match(css, /@media\(min-width:768px\)/)
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/)
  assert.doesNotMatch(css, /:global|@keyframes|overflow-x|font-family/)
})

test('card presentation neither fetches data nor changes ranking calculations', () => {
  assert.doesNotMatch(card, /fetch\(|supabase|useEffect|localStorage|useSession|ranking_points|combined_points/)
  assert.match(card, /getClubTheme\(themeKey\)/)
  assert.match(source('components/public/PublicHomeExperience.tsx'), /format\(club\.players \?\? 0\)/)
  assert.match(source('components/public/PublicRankingExperience.tsx'), /club\.categoryCount===1\?'categoría activa':'categorías activas'/)
})

test('shared cards use restrained surfaces without multicolour borders or coloured glow', () => {
  const surfaces = source('app/styles/surfaces.css')
  assert.doesNotMatch(css, /linear-gradient|radial-gradient/)
  assert.match(css, /var\(--ds-card-surface/)
  assert.match(source('app/globals.css'), /@import "\.\/styles\/surfaces\.css"/)
  for (const selector of ['.publicClubCard', '.publicClubLogo.has-image', '.publicClubStats span', '.px-playerClubCard', '.px-clubDiscoverCard']) {
    assert.ok(surfaces.includes(selector))
  }
  assert.doesNotMatch(surfaces, /font-size|font-family|grid-template|display:|padding:|margin:|min-height|linear-gradient|radial-gradient/)
  assert.match(surfaces, /object-fit: contain/)
  assert.match(surfaces, /:focus-visible/)
  assert.match(css, /height:2px;background:color-mix\(in srgb,var\(--club-primary,#0e7490\) 60%,#d8e2ea\)/)
  assert.match(surfaces, /border-top-color: color-mix\(in srgb, var\(--club-card-accent, #0e7490\) 60%, #d8e2ea\)/)
})
