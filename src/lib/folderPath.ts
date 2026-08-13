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

/** Build a slash path for an item inside a folder (`/Folder/Item`). */
export function buildItemPathString(
  folders: { id: string; name: string; parentId: string | null }[],
  folderId: string | null,
  itemName: string,
): string {
  const folderPath = buildPathString(folders, folderId)
  return folderPath === '/' ? `/${itemName}` : `${folderPath}/${itemName}`
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

export type FolderOrItemPathResult =
  | { kind: 'folder'; id: string | null }
  | { kind: 'item'; id: string }

/**
 * Resolves a slash path to a folder or a leaf item (e.g. game) in that folder tree.
 * Intermediate segments must be folders. The final segment may be a folder or an item.
 * When both exist with the same name, the folder wins. `undefined` = invalid.
 */
export function resolveFolderOrItemPath(
  folders: { id: string; name: string; parentId: string | null }[],
  items: { id: string; name: string; folderId?: string | null }[],
  path: string,
): FolderOrItemPathResult | undefined {
  const segments = path.split('/').filter((s) => s.length > 0)
  if (segments.length === 0) return { kind: 'folder', id: null }

  let parentId: string | null = null
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const folderMatch = folders.find(
      (f) => f.parentId === parentId && f.name.toLowerCase() === seg.toLowerCase(),
    )
    if (folderMatch) {
      parentId = folderMatch.id
      continue
    }
    if (i === segments.length - 1) {
      const itemMatch = items.find(
        (item) =>
          (item.folderId ?? null) === parentId &&
          item.name.toLowerCase() === seg.toLowerCase(),
      )
      if (itemMatch) return { kind: 'item', id: itemMatch.id }
    }
    return undefined
  }
  return { kind: 'folder', id: parentId }
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
