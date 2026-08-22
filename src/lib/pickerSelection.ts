export type PickerSelectionKind = 'board' | 'folder' | 'game' | 'gameFolder'

export type PickerRestoreItem = {
  kind: PickerSelectionKind
  id: string
}

export function pickerSelectionKey(kind: PickerSelectionKind, id: string): string {
  return `${kind}:${id}`
}

export function parsePickerSelectionKey(
  key: string,
): { kind: PickerSelectionKind; id: string } | null {
  const sep = key.indexOf(':')
  if (sep <= 0) return null
  const kind = key.slice(0, sep)
  const id = key.slice(sep + 1)
  if (
    (kind !== 'board' && kind !== 'folder' && kind !== 'game' && kind !== 'gameFolder') ||
    !id
  ) {
    return null
  }
  return { kind, id }
}

export function pickerRenameConflictMessage(
  conflicts: Array<{ currentName: string; uniqueName: string }>,
): string {
  if (conflicts.length === 1) {
    const conflict = conflicts[0]
    return `"${conflict.currentName}" already exists here. It will be renamed to "${conflict.uniqueName}".`
  }
  const list = conflicts
    .map((conflict) => `"${conflict.currentName}" to "${conflict.uniqueName}"`)
    .join(', ')
  return `Some items already exist in the destination. They will be renamed: ${list}.`
}
