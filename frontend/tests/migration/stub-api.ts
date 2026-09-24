import type { ApiClient } from '@/db'
import { createApiClient } from '@/db'

export interface Call {
  method: string
  path: string
  body: unknown
}

type Answer = { status?: number, body?: unknown } | undefined

export type Handler = (call: Call) => Answer | Promise<Answer>

export function stubApi(handler: Handler): { api: ApiClient, calls: Call[] } {
  const calls: Call[] = []
  const api = createApiClient(async (path, init) => {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body ?? null
    const call = { method: init?.method ?? 'GET', path, body }
    calls.push(call)
    const answer = (await handler(call)) ?? { status: 404, body: { detail: 'not stubbed' } }
    return new Response(JSON.stringify(answer.body ?? null), { status: answer.status ?? 200, headers: { 'Content-Type': 'application/json' } })
  })
  return { api, calls }
}
