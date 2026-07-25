import type { Board } from '../types'
import { getMedia, saveMedia } from './db'
import { mimeTypeToMediaType } from './mediaType'
import { generateId } from './utils'

export async function duplicateBoard(source: Board): Promise<Board> {
  const now = Date.now()
  const newBoardId = generateId()
  const questionIdMap = new Map<string, string>()

  const categories = await Promise.all(
    source.categories.map(async (cat) => {
      const newCategoryId = generateId()
      const questions = await Promise.all(
        cat.questions.map(async (q) => {
          const newQuestionId = generateId()
          questionIdMap.set(q.id, newQuestionId)

          let mediaId = q.mediaId
          let mediaType = q.mediaType
          if (q.mediaId) {
            const rec = await getMedia(q.mediaId)
            if (rec) {
              mediaId = generateId()
              if (!mediaType) mediaType = mimeTypeToMediaType(rec.mimeType)
              await saveMedia({
                id: mediaId,
                boardId: newBoardId,
                questionId: newQuestionId,
                mimeType: rec.mimeType,
                blob: rec.blob,
              })
            } else {
              mediaId = undefined
              mediaType = undefined
            }
          }

          return {
            ...q,
            id: newQuestionId,
            mediaId,
            mediaType,
            autoplayMedia:
              mediaId && (mediaType === 'audio' || mediaType === 'video')
                ? q.autoplayMedia
                : undefined,
          }
        })
      )

      return {
        ...cat,
        id: newCategoryId,
        questions,
      }
    })
  )

  return {
    ...source,
    id: newBoardId,
    name: `${source.name} (Copy)`,
    categories,
    dailyDoubleQuestionId: source.dailyDoubleQuestionId
      ? questionIdMap.get(source.dailyDoubleQuestionId)
      : undefined,
    createdAt: now,
    updatedAt: now,
  }
}
