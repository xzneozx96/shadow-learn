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

/**
 * Hash every blob, ask the server which copies it already holds, and upload the
 * rest. A rerun after a reload skips what already arrived.
 */
export async function uploadMedia(
  api: ApiClient,
  ledger: Ledger,
  media: OutgoingMedia[],
  onProgress: (sent: number) => void,
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
    if (!stored || stored.size !== sent[i].size || stored.sha256 !== sent[i].sha256)
      await upload(api, item)
    ledger.media.push(sent[i])
    onProgress(1)
  }
}
