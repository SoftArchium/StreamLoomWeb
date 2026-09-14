/**
 * Language display helpers.
 *
 * Channel languages arrive as ISO 639-2 codes ("spa", "eng", "hin"), the same
 * codes the backend stores in channels.languages. Intl resolves most of them to
 * a display name, so no lookup table is needed; the overrides cover codes Intl
 * leaves as a bare code and the ones whose common name differs.
 */

let languageNames: Intl.DisplayNames | null = null

try {
  if (typeof Intl !== 'undefined' && Intl.DisplayNames) {
    languageNames = new Intl.DisplayNames(['en'], { type: 'language' })
  }
} catch {
  languageNames = null
}

const LANGUAGE_NAME_OVERRIDES: Record<string, string> = {
  eng: 'English',
  spa: 'Spanish',
  por: 'Portuguese',
  ara: 'Arabic',
  hin: 'Hindi',
  urd: 'Urdu',
  ben: 'Bengali',
  tam: 'Tamil',
  tel: 'Telugu',
  mar: 'Marathi',
  guj: 'Gujarati',
  kan: 'Kannada',
  mal: 'Malayalam',
  pan: 'Punjabi',
  nep: 'Nepali',
  sin: 'Sinhala',
  zho: 'Chinese',
  jpn: 'Japanese',
  kor: 'Korean',
  rus: 'Russian',
  deu: 'German',
  fra: 'French',
  ita: 'Italian',
  nld: 'Dutch',
  tur: 'Turkish',
  fas: 'Persian',
  pol: 'Polish',
  ron: 'Romanian',
  ell: 'Greek',
  ces: 'Czech',
  swe: 'Swedish',
  nor: 'Norwegian',
  dan: 'Danish',
  fin: 'Finnish',
  hun: 'Hungarian',
  ukr: 'Ukrainian',
  heb: 'Hebrew',
  tha: 'Thai',
  vie: 'Vietnamese',
  ind: 'Indonesian',
  msa: 'Malay',
  swa: 'Swahili',
  amh: 'Amharic',
  kat: 'Georgian',
  hye: 'Armenian',
  aze: 'Azerbaijani',
  kaz: 'Kazakh',
  bul: 'Bulgarian',
  hrv: 'Croatian',
  srp: 'Serbian',
  slk: 'Slovak',
  slv: 'Slovenian',
  lit: 'Lithuanian',
  lav: 'Latvian',
  est: 'Estonian',
  cat: 'Catalan',
  glg: 'Galician',
  eus: 'Basque',
  afr: 'Afrikaans',
  tgl: 'Tagalog',
  fil: 'Filipino',
  mya: 'Burmese',
  khm: 'Khmer',
  lao: 'Lao',
  som: 'Somali',
  yor: 'Yoruba',
  hau: 'Hausa',
  zul: 'Zulu',
}

/** Human-readable name for an ISO 639-2 language code. */
export function getLanguageName(code: string | null | undefined): string {
  if (!code) return 'Unknown'
  const key = code.trim().toLowerCase()
  if (!key) return 'Unknown'

  const override = LANGUAGE_NAME_OVERRIDES[key]
  if (override) return override

  if (languageNames) {
    try {
      const name = languageNames.of(key)
      if (name && name.toLowerCase() !== key) return name
    } catch {
      // fall through to the title-cased code
    }
  }

  return key.charAt(0).toUpperCase() + key.slice(1)
}
