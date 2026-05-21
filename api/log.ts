import type { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).end()
  }

  const { role, roomCode, actor, event } = req.body ?? {}

  const roleTag = String(role ?? 'unknown').toUpperCase().padEnd(6)
  const line = `[${roleTag}] [room:${roomCode ?? '?'}] [${actor ?? '?'}] ${event ?? ''}`

  console.log(line)

  return res.status(200).end()
}
