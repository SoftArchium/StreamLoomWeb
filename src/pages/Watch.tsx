import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useMemo } from 'react'
import { useChannels } from '../hooks/useChannels'
import type { EnrichedChannel } from '../hooks/useChannels'
import { VideoPlayer } from '../components/VideoPlayer'

export function Watch() {
  const { channelId } = useParams<{ channelId: string }>()
  const { channels, loading } = useChannels()
  const navigate = useNavigate()
  const location = useLocation()

  const decoded = channelId ? decodeURIComponent(channelId) : ''
  const channel = channels.find((c) => c.id === decoded)

  const playlistIds = (location.state as { playlist?: string[] } | null)?.playlist
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo || '/'

  const channelMap = useMemo(() => new Map(channels.map((c) => [c.id, c])), [channels])

  // Preserve the exact list and order from the screen the user came from
  const orderedPlaylist = useMemo(() => {
    if (playlistIds && Array.isArray(playlistIds) && playlistIds.length > 0) {
      const list = playlistIds
        .map((id) => channelMap.get(id))
        .filter((c): c is EnrichedChannel => Boolean(c?.stream))
      if (list.length > 0) return list
    }
    return channels.filter((c) => c.stream)
  }, [playlistIds, channelMap, channels])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', color: 'var(--text-muted)' }}>
        Loading…
      </div>
    )
  }

  if (!channel || !channel.stream) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', gap: 16, color: 'var(--text-secondary)' }}>
        <p>Channel not found or no stream available.</p>
        <button
          style={{ padding: '10px 24px', background: 'var(--accent-gradient)', color: 'white', borderRadius: 'var(--radius-full)', fontWeight: 700, cursor: 'pointer', border: 'none' }}
          onClick={() => navigate(returnTo, { state: { targetChannelId: decoded } })}
        >
          ← Go back
        </button>
      </div>
    )
  }

  return <VideoPlayer channel={channel} allChannels={orderedPlaylist} returnTo={returnTo} />
}
