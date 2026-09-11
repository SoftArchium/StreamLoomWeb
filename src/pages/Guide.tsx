import { useChannels } from '../hooks/useChannels'
import { EpgGuide } from '../components/EpgGuide'
import './Guide.css'

export function Guide() {
  const { channels, epgChannelIds, loading } = useChannels()

  const guideChannels = channels.filter((ch) => epgChannelIds.has(ch.id) && ch.stream)

  return (
    <div className="guide-page">
      <div className="guide-page__header">
        <h1 className="guide-page__title">
          TV Guide
          {!loading && (
            <span className="guide-page__count">{guideChannels.length} channels</span>
          )}
        </h1>
        <p className="guide-page__subtitle">Live schedules · Click any programme to watch</p>
      </div>

      {loading ? (
        <div className="guide-page__loading">
          <div className="guide-loader" />
          <p>Loading channel guide…</p>
        </div>
      ) : (
        <EpgGuide channels={channels} epgChannelIds={epgChannelIds} />
      )}
    </div>
  )
}
