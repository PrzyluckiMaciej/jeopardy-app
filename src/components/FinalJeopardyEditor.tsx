import { useEffect, useRef, useState } from 'react'
import { LogOut, Save, Trash2, Upload } from 'lucide-react'
import type { Board, Question } from '../types'
import { saveMedia, deleteMedia, getMedia, blobToDataUrl } from '../lib/db'
import { mimeTypeToMediaType } from '../lib/mediaType'
import { generateId } from '../lib/utils'

interface Props {
  board: Board
  onChange: (board: Board) => void
  onClose: () => void
  onDelete: () => void
}

export default function FinalJeopardyEditor({ board, onChange, onClose, onDelete }: Props) {
  const [draft, setDraft] = useState<Board>(board)
  const [dirty, setDirty] = useState(false)
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [mediaPreview, setMediaPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const draftRef = useRef(draft)
  const onChangeRef = useRef(onChange)
  draftRef.current = draft
  onChangeRef.current = onChange

  const category = draft.categories[0]
  const question = category?.questions[0]

  useEffect(() => {
    let cancelled = false
    async function loadPreview() {
      const q = draftRef.current.categories[0]?.questions[0]
      if (!q?.mediaId) {
        if (!cancelled) setMediaPreview(null)
        return
      }
      const rec = await getMedia(q.mediaId)
      if (cancelled || !rec) return
      const url = await blobToDataUrl(rec.blob)
      if (!cancelled) setMediaPreview(url)
    }
    void loadPreview()
    return () => {
      cancelled = true
    }
  }, [board.id, question?.mediaId])

  function saveDraft() {
    onChangeRef.current(draftRef.current)
    setDirty(false)
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveDraft()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function updateDraft(next: Board) {
    setDraft(next)
    setDirty(true)
  }

  function updateMeta(patch: Partial<Pick<Board, 'name'>>) {
    updateDraft({ ...draft, ...patch, updatedAt: Date.now() })
  }

  function updateCategoryName(name: string) {
    if (!category) return
    updateDraft({
      ...draft,
      updatedAt: Date.now(),
      categories: [{ ...category, name }],
    })
  }

  function updateQuestion(patch: Partial<Question>) {
    if (!category || !question) return
    updateDraft({
      ...draft,
      updatedAt: Date.now(),
      categories: [
        {
          ...category,
          questions: [{ ...question, ...patch }],
        },
      ],
    })
  }

  async function handleMediaUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !category || !question) return
    const mediaId = generateId()
    const mediaType = mimeTypeToMediaType(file.type)
    await saveMedia({
      id: mediaId,
      boardId: draft.id,
      questionId: question.id,
      mimeType: file.type,
      blob: file,
    })
    if (question.mediaId) {
      try {
        await deleteMedia(question.mediaId)
      } catch {
        /* ignore */
      }
    }
    updateQuestion({
      mediaId,
      mediaType,
      autoplayMedia: mediaType === 'audio' || mediaType === 'video' ? true : undefined,
    })
    setMediaPreview(await blobToDataUrl(file))
    if (fileRef.current) fileRef.current.value = ''
  }

  async function removeMedia() {
    if (!question?.mediaId) return
    try {
      await deleteMedia(question.mediaId)
    } catch {
      /* ignore */
    }
    updateQuestion({ mediaId: undefined, mediaType: undefined, autoplayMedia: undefined })
    setMediaPreview(null)
  }

  function requestExit() {
    if (!dirty) {
      onClose()
      return
    }
    setShowExitConfirm(true)
  }

  function saveAndExit() {
    saveDraft()
    setShowExitConfirm(false)
    onClose()
  }

  function discardAndExit() {
    setShowExitConfirm(false)
    onClose()
  }

  if (!category || !question) {
    return (
      <div className="h-full flex items-center justify-center font-condensed" style={{ color: '#4a5580' }}>
        Invalid Final Jeopardy board
      </div>
    )
  }

  return (
    <div className="final-jeopardy-editor flex flex-col h-full">
      <div className="board-editor-toolbar">
        <div className="board-editor-toolbar__left">
          <span className="board-editor-toolbar__badge">Editing</span>
        </div>

        <div className="board-editor-toolbar__center">
          <input
            className="board-editor-toolbar__name"
            value={draft.name}
            onChange={(e) => updateMeta({ name: e.target.value })}
            placeholder="Final Jeopardy"
            aria-label="Library name"
          />
        </div>

        <div className="board-editor-toolbar__right">
          <button
            type="button"
            className="btn-ghost text-sm btn-with-icon"
            style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
            onClick={onDelete}
            title="Move to trash"
          >
            <Trash2 size={16} aria-hidden />
            <span>Delete</span>
          </button>
          <button
            type="button"
            className="btn-gold text-sm btn-with-icon"
            onClick={saveDraft}
            disabled={!dirty}
            title="Save (Ctrl+S)"
          >
            <Save size={16} aria-hidden />
            <span>Save</span>
          </button>
          <button
            type="button"
            className="btn-ghost text-sm btn-with-icon"
            onClick={requestExit}
            title="Exit editor"
          >
            <LogOut size={16} aria-hidden />
            <span>Exit</span>
          </button>
        </div>
      </div>

      <div className="panel flex-1 overflow-auto flex flex-col gap-4 p-4 min-h-0">
        <div>
          <label
            className="font-condensed text-xs uppercase tracking-wider mb-1 block"
            style={{ color: 'var(--gold)', opacity: 0.7 }}
          >
            Category
          </label>
          <input
            className="w-full"
            value={category.name}
            onChange={(e) => updateCategoryName(e.target.value)}
            placeholder="Category name shown to players"
          />
        </div>

        <div>
          <label
            className="font-condensed text-xs uppercase tracking-wider mb-1 block"
            style={{ color: 'var(--gold)', opacity: 0.7 }}
          >
            Question (clue)
          </label>
          <textarea
            className="w-full"
            rows={4}
            placeholder="Enter the clue shown to players…"
            value={question.question}
            onChange={(e) => updateQuestion({ question: e.target.value })}
          />
        </div>

        <div>
          <label
            className="font-condensed text-xs uppercase tracking-wider mb-1 block"
            style={{ color: 'var(--gold)', opacity: 0.7 }}
          >
            Answer (in Jeopardy form)
          </label>
          <textarea
            className="w-full"
            rows={2}
            placeholder="What is…?"
            value={question.answer}
            onChange={(e) => updateQuestion({ answer: e.target.value })}
          />
        </div>

        <div>
          <label
            className="font-condensed text-xs uppercase tracking-wider mb-2 block"
            style={{ color: 'var(--gold)', opacity: 0.7 }}
          >
            Media attachment
          </label>
          <div className="board-editor-media-group">
            {mediaPreview ? (
              <>
                {mediaPreview.startsWith('data:image') && (
                  <img
                    src={mediaPreview}
                    className="w-full rounded"
                    style={{ maxHeight: 180, objectFit: 'contain' }}
                    alt=""
                  />
                )}
                {mediaPreview.startsWith('data:audio') && (
                  <audio controls src={mediaPreview} className="w-full" />
                )}
                {mediaPreview.startsWith('data:video') && (
                  <video
                    controls
                    src={mediaPreview}
                    className="w-full rounded"
                    style={{ maxHeight: 160 }}
                  />
                )}
                <button
                  type="button"
                  className="btn-ghost text-xs w-full btn-with-icon justify-center"
                  onClick={() => void removeMedia()}
                >
                  <Trash2 size={14} aria-hidden />
                  <span>Remove</span>
                </button>
              </>
            ) : (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,audio/*,video/*"
                  className="hidden"
                  onChange={(e) => void handleMediaUpload(e)}
                  id="fj-media-upload"
                />
                <label
                  htmlFor="fj-media-upload"
                  className="btn-ghost text-sm w-full btn-with-icon justify-center py-2 cursor-pointer"
                >
                  <Upload size={16} aria-hidden />
                  <span>Attach media</span>
                </label>
              </>
            )}
            {(question.mediaType === 'audio' ||
              question.mediaType === 'video' ||
              mediaPreview?.startsWith('data:audio') ||
              mediaPreview?.startsWith('data:video')) && (
              <div
                className="board-editor-dd-toggle"
                role="switch"
                aria-checked={question.autoplayMedia !== false}
                onClick={() =>
                  updateQuestion({
                    autoplayMedia: question.autoplayMedia === false,
                  })
                }
              >
                <div className="flex-1">
                  <div className="font-condensed font-bold text-sm">Autoplay</div>
                  <div className="text-xs" style={{ color: '#4a5580' }}>
                    Start playing when media is revealed
                  </div>
                </div>
                <div
                  className="w-11 h-6 rounded-full relative transition-colors flex-shrink-0"
                  style={{
                    background:
                      question.autoplayMedia !== false ? 'var(--gold)' : 'var(--navy-light)',
                  }}
                >
                  <div
                    className="absolute top-0.5 w-5 h-5 rounded-full transition-transform"
                    style={{
                      background: 'var(--navy-mid)',
                      left:
                        question.autoplayMedia !== false ? 'calc(100% - 22px)' : '2px',
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showExitConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(6,11,40,0.85)' }}
        >
          <div className="panel modal-enter flex flex-col gap-4 max-w-sm w-full text-center">
            <div className="font-display text-2xl" style={{ color: 'var(--gold-bright)' }}>
              Unsaved changes
            </div>
            <div className="font-condensed text-base" style={{ color: 'var(--white)' }}>
              You have unsaved changes. Save before leaving, or discard them?
            </div>
            <div className="flex flex-col gap-2">
              <button type="button" className="btn-gold w-full btn-with-icon justify-center" onClick={saveAndExit}>
                <Save size={16} aria-hidden />
                <span>Save &amp; Exit</span>
              </button>
              <button type="button" className="btn-ghost w-full" onClick={discardAndExit}>
                Discard &amp; Exit
              </button>
              <button type="button" className="btn-ghost w-full" onClick={() => setShowExitConfirm(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
