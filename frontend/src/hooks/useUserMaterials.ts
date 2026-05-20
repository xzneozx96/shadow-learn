import type { HubItem, InstructionLanguage, Skill, TipGroup, UserMaterial } from '@/types/collection'
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AuthContext } from '@/contexts/AuthContext'
import {
  deleteUserMaterial,
  getUserMaterialByExternalId,
  listUserMaterials,
  putUserMaterial,
} from '@/db'
import { API_BASE } from '@/lib/config'

const TIP_GROUP_ORDER: Skill[] = ['Grammar', 'Pronunciation', 'Vocabulary', 'Speaking', 'Learning Tips']

export interface RegisterInput {
  source: 'playlist' | 'video'
  externalId: string
  name: string
  skill: Skill
  instructionLanguage: InstructionLanguage
}

export type AddResult
  = { ok: true }
    | { ok: false, reason: 'duplicate' | 'fetch-failed' | 'no-db' }

interface YouTubeOEmbed {
  title?: string
  author_name?: string
  thumbnail_url?: string
}

interface RelaxedPlaylistResponse {
  name: string
  thumbnail_url: string | null
  channel: string | null
  published_at: string | null
  videos: Array<{ video_id: string }>
}

interface PlaylistMeta {
  name: string
  thumbnailUrl: string | null
  channel: string | null
  publishedAt: string | null
  videoCount: number
}

interface VideoMeta {
  name: string
  thumbnailUrl: string | null
  channel: string | null
  publishedAt: string | null
}

async function fetchPlaylistMeta(playlistId: string): Promise<PlaylistMeta | null> {
  try {
    const res = await fetch(`${API_BASE}/api/playlist/${encodeURIComponent(playlistId)}`)
    if (!res.ok)
      return null
    const data = (await res.json()) as RelaxedPlaylistResponse
    return {
      name: data.name,
      thumbnailUrl: data.thumbnail_url,
      channel: data.channel,
      publishedAt: data.published_at,
      videoCount: data.videos.length,
    }
  }
  catch {
    return null
  }
}

async function fetchVideoMeta(videoId: string): Promise<VideoMeta | null> {
  try {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`
    const res = await fetch(url)
    if (!res.ok)
      return null
    const meta = (await res.json()) as YouTubeOEmbed
    return {
      name: meta.title?.trim() || 'Video',
      thumbnailUrl: meta.thumbnail_url?.trim() || null,
      channel: meta.author_name?.trim() || null,
      publishedAt: null,
    }
  }
  catch {
    return null
  }
}

export type UserHubItem = HubItem & { userMaterialId: string, instructionLanguage: InstructionLanguage }

function toHubItem(m: UserMaterial): UserHubItem {
  const base = {
    userMaterialId: m.id,
    instructionLanguage: m.instructionLanguage,
    difficulty: null,
    topic: null,
    skill: m.skill,
    content_type: m.contentType,
    channel: m.cachedMeta.channel,
    published_at: m.cachedMeta.publishedAt,
  }
  if (m.source === 'playlist') {
    return {
      ...base,
      type: 'playlist',
      playlist_id: m.externalId,
      name: m.name,
      thumbnail_url: m.cachedMeta.thumbnailUrl,
      video_count: m.cachedMeta.videoCount,
    } as UserHubItem
  }
  return {
    ...base,
    type: 'video',
    video_id: m.externalId,
    title: m.name,
    duration: '',
    view_count: null,
    description: null,
  } as UserHubItem
}

function buildGroups(items: UserMaterial[]): TipGroup[] {
  const buckets = new Map<Skill, UserHubItem[]>()
  for (const m of items) {
    const arr = buckets.get(m.skill) ?? []
    arr.push(toHubItem(m))
    buckets.set(m.skill, arr)
  }
  return TIP_GROUP_ORDER
    .filter(s => buckets.has(s))
    .map(s => ({ skill: s, items: buckets.get(s)! }))
}

export function useUserMaterials() {
  const ctx = use(AuthContext)
  const db = ctx?.db ?? null
  const [items, setItems] = useState<UserMaterial[]>([])
  const [loading, setLoading] = useState(true)
  const revalidatingRef = useRef(false)

  const refresh = useCallback(async () => {
    if (!db) {
      setItems([])
      setLoading(false)
      return
    }
    const rows = await listUserMaterials(db)
    setItems(rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    setLoading(false)
  }, [db])

  useEffect(() => { void refresh() }, [refresh])

  const add = useCallback(async (input: RegisterInput): Promise<AddResult> => {
    if (!db)
      return { ok: false, reason: 'no-db' }
    const existing = await getUserMaterialByExternalId(db, input.externalId)
    if (existing)
      return { ok: false, reason: 'duplicate' }

    const meta = input.source === 'playlist'
      ? await fetchPlaylistMeta(input.externalId)
      : await fetchVideoMeta(input.externalId)
    if (!meta)
      return { ok: false, reason: 'fetch-failed' }

    const record: UserMaterial = {
      id: crypto.randomUUID(),
      source: input.source,
      externalId: input.externalId,
      name: input.name?.trim() || meta.name,
      skill: input.skill,
      instructionLanguage: input.instructionLanguage,
      contentType: 'tip',
      cachedMeta: {
        thumbnailUrl: meta.thumbnailUrl,
        channel: meta.channel,
        videoCount: 'videoCount' in meta ? meta.videoCount : null,
        publishedAt: meta.publishedAt,
      },
      createdAt: new Date().toISOString(),
    }
    await putUserMaterial(db, record)
    await refresh()
    return { ok: true }
  }, [db, refresh])

  const remove = useCallback(async (id: string) => {
    if (!db)
      return
    await deleteUserMaterial(db, id)
    await refresh()
  }, [db, refresh])

  const revalidateAll = useCallback(async () => {
    if (!db || revalidatingRef.current)
      return
    revalidatingRef.current = true
    try {
      const rows = await listUserMaterials(db)
      const updated: UserMaterial[] = []
      for (const r of rows) {
        const meta = r.source === 'playlist'
          ? await fetchPlaylistMeta(r.externalId)
          : await fetchVideoMeta(r.externalId)
        if (!meta) {
          updated.push(r)
          continue
        }
        const next: UserMaterial = {
          ...r,
          cachedMeta: {
            thumbnailUrl: meta.thumbnailUrl,
            channel: meta.channel,
            videoCount: 'videoCount' in meta ? meta.videoCount : r.cachedMeta.videoCount,
            publishedAt: meta.publishedAt ?? r.cachedMeta.publishedAt,
          },
        }
        await putUserMaterial(db, next)
        updated.push(next)
      }
      setItems(updated.sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    }
    finally {
      revalidatingRef.current = false
    }
  }, [db])

  const groups = useMemo(() => buildGroups(items), [items])

  return { items, groups, loading, add, remove, revalidateAll }
}
