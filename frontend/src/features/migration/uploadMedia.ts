import type { OutgoingMedia } from './exportStores'
import type { Ledger, SentMedia } from './manifest'
import type { ApiClient } from '@/db'
import { responseError } from '@/shared/lib/api'
import { blobDigest } from './canonical'
import { postManifest } from './manifest'

async function upload(api: ApiClient, { key, blob }: OutgoingMedia): Promise<void> {
  const form = new FormData()
  form.set('lesson_id', key.lessonId)
  form.set('kind', key.kind)
  if (key.segmentId !== undefined)
    form.set('segment_id', key.segmentId)
  form.set('file', blob, key.kind === 'shadowing' ? `${key.segmentId}.webm` : `${key.lessonId}`)
  const res = await api.fetch('/api/import/media', { method: 'POST', body: form })
  if (!res.ok)
    throw await responseError(res, `Uploading media failed: ${res.status}`)
}

export async function uploadMedia(
  api: ApiClient,
  ledger: Ledger,
  media: OutgoingMedia[],
  onProgress: (sent: number) => void,
  accountKept: ReadonlySet<string> = new Set(),
): Promise<void> {
  const started = performance.now()
  const sent: SentMedia[] = []
  for (const item of media)
    sent.push({ key: item.key, ...(await blobDigest(item.blob)) })
  ledger.hashMs += performance.now() - started

  const server = media.length > 0
    ? (await postManifest(api, { source: ledger.source, stores: {}, media: sent.map(item => item.key) })).media
    : []
  for (const [i, item] of media.entries()) {
    const stored = server[i]
    const matches = stored?.size === sent[i].size && stored.sha256 === sent[i].sha256
    if (!matches && !accountKept.has(item.key.lessonId))
      await upload(api, item)
    ledger.media.push(sent[i])
    onProgress(1)
  }
}
