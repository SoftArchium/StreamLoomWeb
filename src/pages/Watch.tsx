import { useParams, useNavigate } from 'react-router-dom'
import { useChannels } from '../hooks/useChannels'
import { VideoPlayer } from '../components/VideoPlayer'

export function Watch() {
  const { channelId } = useParams<{ channelId: string }>()
  const { channels, loading } = useChannels()
  const navigate = useNavigate()

  const decoded = channelId ? decodeURIComponent(channelId) : ''
  const channel = channels.find((c) => c.id === decoded)

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
          style={{ padding: '10px 24px', background: 'var(--accent-gradient)', color: 'white', borderRadius: 'var(--radius-full)', fontWeight: 700, cursor: 'pointer' }}
          onClick={() => navigate(-1)}
        >
          ← Go back
        </button>
      </div>
    )
  }

  return <VideoPlayer channel={channel} allChannels={channels} />
}
