/** Build a slash path for a folder id (`/` = root). */
export function buildPathString(
  folders: { id: string; name: string; parentId: string | null }[],
  folderId: string | null,
): string {
  if (!folderId) return '/'
  const parts: string[] = []
  let id: string | null = folderId
  while (id) {
    const f = folders.find((x) => x.id === id)
    if (!f) break
    parts.unshift(f.name)
    id = f.parentId
  }
  return `/${parts.join('/')}`
}

/**
 * Resolves a slash path to a folder id.
 * `null` = root. `undefined` = invalid.
 */
export function resolvePath(
  folders: { id: string; name: string; parentId: string | null }[],
  path: string,
): string | null | undefined {
  const segments = path.split('/').filter((s) => s.length > 0)
  if (segments.length === 0) return null
  let parentId: string | null = null
  for (const seg of segments) {
    const match = folders.find(
      (f) => f.parentId === parentId && f.name.toLowerCase() === seg.toLowerCase(),
    )
    if (!match) return undefined
    parentId = match.id
  }
  return parentId
}

export function isFolderInside(
  folders: { id: string; parentId: string | null }[],
  folderId: string,
  ancestorId: string,
): boolean {
  let current = folders.find((f) => f.id === folderId)
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true
    current = folders.find((f) => f.id === current!.parentId)
  }
  return false
}
