let regionNames: Intl.DisplayNames | null = null

try {
  if (typeof Intl !== 'undefined' && Intl.DisplayNames) {
    regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
  }
} catch {
  regionNames = null
}

const COUNTRY_NAME_OVERRIDES: Record<string, string> = {
  UK: 'United Kingdom',
  GB: 'United Kingdom',
  US: 'United States',
  USA: 'United States',
  INT: 'International',
  WW: 'Worldwide',
  EU: 'European Union',
  KR: 'South Korea',
  KP: 'North Korea',
  RU: 'Russia',
  TW: 'Taiwan',
  HK: 'Hong Kong',
  PS: 'Palestine',
  CD: 'DR Congo',
  CG: 'Congo',
  CI: 'Ivory Coast',
  CZ: 'Czech Republic',
  TR: 'Turkey',
  SY: 'Syria',
  IR: 'Iran',
  LA: 'Laos',
  VN: 'Vietnam',
  BO: 'Bolivia',
  VE: 'Venezuela',
  MD: 'Moldova',
  TZ: 'Tanzania',
  BN: 'Brunei',
}

/**
 * Returns full country name for a given ISO code or string.
 */
export function getCountryName(code?: string | null): string {
  if (!code) return ''
  const trimmed = code.trim().toUpperCase()
  if (COUNTRY_NAME_OVERRIDES[trimmed]) {
    return COUNTRY_NAME_OVERRIDES[trimmed]
  }

  if (regionNames && trimmed.length === 2) {
    try {
      const resolved = regionNames.of(trimmed)
      if (resolved && resolved !== trimmed) {
        return resolved
      }
    } catch {
      // Fallback
    }
  }

  return trimmed
}

/**
 * Returns emoji flag for a 2-letter ISO country code.
 */
export function getCountryFlag(code?: string | null): string {
  if (!code) return '🌐'
  const trimmed = code.trim().toUpperCase()
  if (trimmed === 'UK') return '🇬🇧'
  if (trimmed.length !== 2) return '🌐'

  const codePoints = [...trimmed].map((char) => 127397 + char.charCodeAt(0))
  return String.fromCodePoint(...codePoints)
}

/**
 * Returns a display string e.g. "🇺🇸 United States"
 */
export function formatCountryDisplay(code?: string | null): string {
  if (!code) return ''
  const name = getCountryName(code)
  const flag = getCountryFlag(code)
  return flag !== '🌐' ? `${flag} ${name}` : name
}
