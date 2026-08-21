/** Trigger a browser download of a JSON object. */
export function downloadJson(filename: string, data: unknown): void {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.json') ? filename : `${filename}.json`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Sanitize a user-facing name into a safe download filename stem. */
export function sanitizeExportFilename(name: string): string {
  const trimmed = name.trim() || 'export'
  const safe = trimmed
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
    .trim()
  return safe || 'export'
}
