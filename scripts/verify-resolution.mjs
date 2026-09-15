/**
 * Sanity check for resolution ranking + playback ordering.
 * Run with: node scripts/verify-resolution.mjs
 */

function rankResolution(quality) {
  if (!quality) return 0
  const q = quality.toLowerCase()
  if (q.includes('4k') || q.includes('2160') || q.includes('uhd')) return 4
  if (q.includes('1080') || q.includes('fhd') || q.includes('full hd')) return 3
  if (q.includes('720') || q.includes('hd')) return 2
  if (q.includes('576') || q.includes('480') || q.includes('360') || q.includes('sd')) return 1
  return 0
}

function streamScore(s) {
  let score = rankResolution(s.quality) * 10
  if (s.url.startsWith('https://')) score += 2
  if (s.status === 'active') score += 1
  return score
}

function sortStreamsByResolution(streams) {
  return [...streams].sort((a, b) => streamScore(b) - streamScore(a))
}

function orderStreamsForPlayback(streams, workingUrl) {
  if (streams.length <= 1) return streams
  const ordered = sortStreamsByResolution(streams)
  if (!workingUrl) return ordered
  const workingIdx = ordered.findIndex((s) => s.url === workingUrl)
  if (workingIdx <= 0) return ordered
  const working = ordered[workingIdx]
  const top = ordered[0]
  if (rankResolution(working.quality) >= rankResolution(top.quality)) {
    return [working, ...ordered.filter((_, i) => i !== workingIdx)]
  }
  return ordered
}

let failures = 0
function assert(label, actual, expected) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) {
    failures++
    console.log(`FAIL ${label}\n  expected ${e}\n  got      ${a}`)
  } else {
    console.log(`ok   ${label}`)
  }
}

// rankResolution
assert('4K', rankResolution('4K'), 4)
assert('2160p', rankResolution('2160p'), 4)
assert('UHD', rankResolution('UHD'), 4)
assert('FHD', rankResolution('FHD'), 3)
assert('1080p', rankResolution('1080p'), 3)
assert('Full HD', rankResolution('Full HD'), 3)
assert('HD', rankResolution('HD'), 2)
assert('720p', rankResolution('720p'), 2)
assert('SD', rankResolution('SD'), 1)
assert('576p', rankResolution('576p'), 1)
assert('360p', rankResolution('360p'), 1)
assert('null quality', rankResolution(null), 0)
assert('empty quality', rankResolution(''), 0)
assert('unknown quality', rankResolution('unknown'), 0)

// Resolution always outranks protocol/status
assert(
  '1080p http beats 360p https+active',
  sortStreamsByResolution([
    { url: 'http://a/x.m3u8', quality: '1080p', status: 'inactive' },
    { url: 'https://b/x.m3u8', quality: '360p', status: 'active' },
  ])[0].quality,
  '1080p'
)

// Same resolution falls back to https + active preference
assert(
  'same-res prefers https+active',
  sortStreamsByResolution([
    { url: 'http://a/x.m3u8', quality: 'HD', status: 'active' },
    { url: 'https://b/x.m3u8', quality: 'HD', status: 'active' },
  ])[0].url,
  'https://b/x.m3u8'
)

// Cached working stream is dropped from the front when a higher res is available
const mixed = [
  { url: 'https://low/x.m3u8', quality: '360p', status: 'active' },
  { url: 'https://high/x.m3u8', quality: '4K', status: 'active' },
]
assert(
  'low-res cached does not block 4K',
  orderStreamsForPlayback(mixed, 'https://low/x.m3u8')[0].quality,
  '4K'
)

// Cached working stream keeps the front when it already matches the best resolution
const same = [
  { url: 'https://a/x.m3u8', quality: '1080p', status: 'active' },
  { url: 'https://b/x.m3u8', quality: 'FHD', status: 'active' },
]
assert(
  'cached kept when at best resolution',
  orderStreamsForPlayback(same, 'https://b/x.m3u8')[0].url,
  'https://b/x.m3u8'
)

// Single stream passes through untouched
assert(
  'single stream untouched',
  orderStreamsForPlayback([{ url: 'https://only/x.m3u8', quality: 'SD', status: null }]).length,
  1
)

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
