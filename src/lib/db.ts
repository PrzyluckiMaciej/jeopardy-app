import Dexie, { type Table } from 'dexie'

export interface MediaRecord {
  id: string
  boardId: string
  questionId: string
  mimeType: string
  blob: Blob
}

class JeopardyDB extends Dexie {
  media!: Table<MediaRecord>

  constructor() {
    super('JeopardyDB')
    this.version(1).stores({
      media: 'id, boardId, questionId',
    })
  }
}

export const db = new JeopardyDB()

export async function saveMedia(record: MediaRecord) {
  await db.media.put(record)
}

export async function getMedia(id: string): Promise<MediaRecord | undefined> {
  return db.media.get(id)
}

export async function deleteMedia(id: string) {
  await db.media.delete(id)
}

export async function deleteMediaByBoard(boardId: string) {
  await db.media.where('boardId').equals(boardId).delete()
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}
