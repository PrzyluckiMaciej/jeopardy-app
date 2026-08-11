import type { BoardFolder } from '../types'

/** Collect folder id and all descendant folder ids. */
export function collectFolderSubtree(folders: BoardFolder[], rootId: string): Set<string> {
  const ids = new Set<string>([rootId])
  let changed = true
  while (changed) {
    changed = false
    for (const f of folders) {
      if (!ids.has(f.id) && f.parentId != null && ids.has(f.parentId)) {
        ids.add(f.id)
        changed = true
      }
    }
  }
  return ids
}
