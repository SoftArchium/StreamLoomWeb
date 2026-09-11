import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL) as string
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY) as string

export const supabase = createClient(SUPABASE_URL || '', SUPABASE_ANON_KEY || '')

// ---------- Types ----------

export interface Channel {
  id: string
  name: string
  logo: string | null
  country: string | null
  is_active: boolean
  channel_categories: { category_id: string }[]
}

export interface Stream {
  channel_id: string | null
  url: string
  quality: string | null
  status: string | null
}

export interface Category {
  id: string
  name: string
}

export interface EpgProgram {
  id: string
  channel_id: string
  title: string
  description: string | null
  start_time: string
  end_time: string
}

// ---------- Fetchers ----------

const PAGE_SIZE = 1000

async function fetchAllPages<T>(
  fetcher: (from: number, to: number) => Promise<T[]>
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  while (true) {
    const page = await fetcher(from, from + PAGE_SIZE - 1)
    all.push(...page)
    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

export async function fetchChannels(): Promise<Channel[]> {
  return fetchAllPages(async (from, to) => {
    const { data, error } = await supabase
      .from('channels')
      .select('id,name,logo,country,is_active,channel_categories(category_id)')
      .eq('is_active', true)
      .order('id', { ascending: true })
      .range(from, to)
    if (error) throw error
    return (data ?? []) as Channel[]
  })
}

export async function fetchStreams(): Promise<Stream[]> {
  return fetchAllPages(async (from, to) => {
    const { data, error } = await supabase
      .from('streams')
      .select('channel_id,url,quality,status')
      .eq('status', 'active')
      .order('url', { ascending: true })
      .range(from, to)
    if (error) throw error
    return (data ?? []) as Stream[]
  })
}

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase.from('categories').select('id,name')
  if (error) throw error
  return (data ?? []) as Category[]
}

export async function fetchEpg(channelId: string): Promise<EpgProgram[]> {
  const { data, error } = await supabase
    .from('epg_programs')
    .select('id,channel_id,title,description,start_time,end_time')
    .eq('channel_id', channelId)
    .order('start_time', { ascending: true })
  if (error) throw error
  return (data ?? []) as EpgProgram[]
}

/** Fetches the pre-computed list of channel IDs that have genuine EPG data. */
export async function fetchEpgChannelIds(): Promise<Set<string>> {
  try {
    const storageUrl = `${SUPABASE_URL}/storage/v1/object/public/epg/channels_with_epg.json`
    const res = await fetch(storageUrl)
    if (res.ok) {
      const list: string[] = await res.json()
      if (list.length > 0) return new Set(list)
    }
  } catch {
    // fall through to slow path
  }
  // Slow fallback: distinct channel_ids from epg_programs
  const { data } = await supabase
    .from('epg_programs')
    .select('channel_id')
    .order('channel_id', { ascending: true })
  return new Set((data ?? []).map((r: { channel_id: string }) => r.channel_id))
}
