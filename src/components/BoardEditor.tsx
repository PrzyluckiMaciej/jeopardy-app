import { useState, useRef, useCallback, useEffect } from 'react'
import { Trash2, Upload, FileText, Image, Music, Video, Paperclip, HelpCircle } from 'lucide-react'
import type { Board, Category, Question } from '../types'
import { generateId } from '../lib/utils'
import { saveMedia, deleteMedia, getMedia, blobToDataUrl } from '../lib/db'
import { mimeTypeToMediaType, type MediaType } from '../lib/mediaType'

interface Props {
  board: Board
  onChange: (board: Board) => void
  onClose: () => void
}

interface EditingCell {
  categoryId: string
  questionId: string
}

export default function BoardEditor({ board, onChange, onClose }: Props) {
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null)
  const [panelExiting, setPanelExiting] = useState(false)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [boardName, setBoardName] = useState(board.name)
  const [mediaPreview, setMediaPreview] = useState<string | null>(null)
  const [editingRowPts, setEditingRowPts] = useState<number | null>(null)
  const [editingRowText, setEditingRowText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const initialBoard = useRef<Board>(board)
  const boardRef = useRef(board)
  const onChangeRef = useRef(onChange)
  const [mediaTypesById, setMediaTypesById] = useState<Record<string, MediaType>>({})
  boardRef.current = board
  onChangeRef.current = onChange

  useEffect(() => {
    let cancelled = false

    async function resolveMediaTypes() {
      const map: Record<string, MediaType> = {}
      const patches = new Map<string, MediaType>()

      for (const cat of boardRef.current.categories) {
        for (const q of cat.questions) {
          if (!q.mediaId) continue
          if (q.mediaType) {
            map[q.mediaId] = q.mediaType
          } else {
            const rec = await getMedia(q.mediaId)
            if (rec) {
              const mediaType = mimeTypeToMediaType(rec.mimeType)
              map[q.mediaId] = mediaType
              patches.set(q.id, mediaType)
            }
          }
        }
      }

      if (cancelled) return
      setMediaTypesById(map)

      if (patches.size === 0) return

      const current = boardRef.current
      const categories = current.categories.map((cat) => ({
        ...cat,
        questions: cat.questions.map((q) =>
          patches.has(q.id) ? { ...q, mediaType: patches.get(q.id) } : q
        ),
      }))
      const updated = { ...current, categories, updatedAt: Date.now() }
      onChangeRef.current(updated)
      initialBoard.current = updated
    }

    resolveMediaTypes()
    return () => {
      cancelled = true
    }
  }, [board.id])

  function discardChanges() {
    onChange(initialBoard.current)
    onClose()
  }

  const activeQ = editingCell
    ? board.categories.find((c) => c.id === editingCell.categoryId)
        ?.questions.find((q) => q.id === editingCell.questionId) ?? null
    : null
  const activeCategory = editingCell
    ? board.categories.find((c) => c.id === editingCell.categoryId) ?? null
    : null

  const updateBoard = useCallback(
    (patch: Partial<Board>) => {
      onChange({ ...board, ...patch, updatedAt: Date.now() })
    },
    [board, onChange]
  )

  function updateCategory(catId: string, patch: Partial<Category>) {
    updateBoard({
      categories: board.categories.map((c) => (c.id === catId ? { ...c, ...patch } : c)),
    })
  }

  function updateQuestion(catId: string, qId: string, patch: Partial<Question>) {
    updateCategory(catId, {
      questions: board.categories
        .find((c) => c.id === catId)!
        .questions.map((q) => (q.id === qId ? { ...q, ...patch } : q)),
    })
  }

  function addCategory() {
    const newCat: Category = {
      id: generateId(),
      name: 'New Category',
      questions: board.pointValues.map((pts) => ({
        id: generateId(),
        question: '',
        answer: '',
        points: pts,
      })),
    }
    updateBoard({ categories: [...board.categories, newCat] })
  }

  function removeCategory(catId: string) {
    updateBoard({ categories: board.categories.filter((c) => c.id !== catId) })
    if (editingCell?.categoryId === catId) closePanel()
  }

  function finishPanelClose() {
    setPanelExiting(false)
    setEditingCell(null)
    setMediaPreview(null)
  }

  function closePanel() {
    if (!editingCell || panelExiting) return
    setPanelExiting(true)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finishPanelClose()
    }
  }

  function handlePanelAnimationEnd(e: React.AnimationEvent<HTMLDivElement>) {
    if (
      panelExiting &&
      e.target === e.currentTarget &&
      e.animationName === 'boardEditorPanelOut'
    ) {
      finishPanelClose()
    }
  }

  function startEditingRowPts(pts: number) {
    setEditingRowPts(pts)
    setEditingRowText(String(pts))
  }

  function commitRowPointValue(oldPts: number) {
    setEditingRowPts(null)
    const newPts = parseInt(editingRowText, 10)
    if (isNaN(newPts) || newPts <= 0 || newPts === oldPts) return
    if (board.pointValues.some((v) => v !== oldPts && v === newPts)) return

    const newPointValues = board.pointValues.map((v) => (v === oldPts ? newPts : v)).sort((a, b) => a - b)
    const newCategories = board.categories.map((cat) => ({
      ...cat,
      questions: cat.questions.map((q) => (q.points === oldPts ? { ...q, points: newPts } : q)),
    }))
    updateBoard({ pointValues: newPointValues, categories: newCategories })
  }

  async function openCell(catId: string, q: Question) {
    setPanelExiting(false)
    setEditingCell({ categoryId: catId, questionId: q.id })
    setMediaPreview(null)
    if (q.mediaId) {
      const rec = await getMedia(q.mediaId)
      if (rec) {
        const url = await blobToDataUrl(rec.blob)
        setMediaPreview(url)
        if (!q.mediaType) {
          const mediaType = mimeTypeToMediaType(rec.mimeType)
          updateQuestion(catId, q.id, { mediaType })
        }
      }
    }
  }

  async function handleMediaUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!editingCell || !activeQ) return
    const file = e.target.files?.[0]
    if (!file) return

    const mediaId = activeQ.mediaId ?? generateId()
    await saveMedia({
      id: mediaId,
      boardId: board.id,
      questionId: activeQ.id,
      mimeType: file.type,
      blob: file,
    })
    const mediaType = mimeTypeToMediaType(file.type)
    updateQuestion(editingCell.categoryId, editingCell.questionId, { mediaId, mediaType })
    const url = await blobToDataUrl(file)
    setMediaPreview(url)
  }

  async function removeMedia() {
    if (!editingCell || !activeQ?.mediaId) return
    await deleteMedia(activeQ.mediaId)
    updateQuestion(editingCell.categoryId, editingCell.questionId, { mediaId: undefined, mediaType: undefined })
    setMediaPreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="flex flex-col h-full">
      {/* Edit mode toolbar */}
      <div className="board-editor-toolbar">
        <div className="board-editor-toolbar__left">
          <span className="board-editor-toolbar__badge">Editing</span>
          <button className="btn-outline text-sm" onClick={addCategory}>
            + Category
          </button>
        </div>

        <div className="board-editor-toolbar__center">
          <input
            className="board-editor-toolbar__name"
            value={boardName}
            onChange={(e) => {
              setBoardName(e.target.value)
              updateBoard({ name: e.target.value })
            }}
          />
        </div>

        <div className="board-editor-toolbar__right">
          <button className="btn-ghost text-sm" onClick={discardChanges}>
            Discard
          </button>
          <button className="btn-gold text-sm" onClick={onClose}>
            Save &amp; Close
          </button>
        </div>
      </div>

      <div className="board-editor-body flex-1 min-h-0">
        {/* Grid */}
        <div className="overflow-auto min-w-0 h-full">
          <div
            className="grid gap-2 min-w-max"
            style={{ gridTemplateColumns: `72px repeat(${board.categories.length}, minmax(140px, 1fr))` }}
          >
            {/* Row label column spacer for header row */}
            <div />

            {/* Category headers */}
            {board.categories.map((cat) => (
              <div key={cat.id} className="relative group">
                {editingCategoryId === cat.id ? (
                  <input
                    autoFocus
                    className="w-full text-center text-sm font-condensed font-bold uppercase"
                    style={{
                      background: 'var(--navy-mid)',
                      border: '2px solid var(--gold)',
                      borderRadius: 6,
                      padding: '10px 8px',
                    }}
                    value={cat.name}
                    onChange={(e) => updateCategory(cat.id, { name: e.target.value })}
                    onBlur={() => setEditingCategoryId(null)}
                    onKeyDown={(e) => e.key === 'Enter' && setEditingCategoryId(null)}
                  />
                ) : (
                  <div
                    className="text-center text-sm font-condensed font-bold uppercase py-3 px-2 rounded cursor-pointer"
                    style={{
                      background: 'var(--navy-mid)',
                      border: '2px dashed rgba(59,130,246,0.35)',
                      letterSpacing: 1,
                      minHeight: 44,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    onClick={() => setEditingCategoryId(cat.id)}
                    title="Click to rename"
                  >
                    {cat.name}
                  </div>
                )}
                <button
                  className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:brightness-75"
                  style={{
                    background: 'var(--red)',
                    color: '#fff',
                    border: 'none',
                    transition: 'opacity 150ms, filter 150ms',
                  }}
                  onClick={() => removeCategory(cat.id)}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}

            {/* Question cells with editable row point value labels */}
            {board.pointValues.map((pts) => [
              /* Row label */
              editingRowPts === pts ? (
                <input
                  key={`label-${pts}`}
                  autoFocus
                  className="text-center font-display text-lg"
                  style={{
                    background: 'var(--navy-mid)',
                    border: '2px solid var(--gold)',
                    borderRadius: 6,
                    color: 'var(--gold-bright)',
                    width: '100%',
                    padding: '4px 0',
                  }}
                  value={editingRowText}
                  onChange={(e) => setEditingRowText(e.target.value)}
                  onBlur={() => commitRowPointValue(pts)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRowPointValue(pts)
                    if (e.key === 'Escape') setEditingRowPts(null)
                  }}
                />
              ) : (
                <button
                  key={`label-${pts}`}
                  className="font-display text-lg rounded"
                  style={{
                    background: 'var(--navy-mid)',
                    border: '2px dashed rgba(59,130,246,0.3)',
                    color: 'var(--gold-bright)',
                    minHeight: 72,
                    width: '100%',
                    cursor: 'pointer',
                    transition: 'border-color 150ms',
                  }}
                  title="Click to edit point value"
                  onClick={() => startEditingRowPts(pts)}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.borderColor = 'var(--gold)')
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.borderColor = 'rgba(59,130,246,0.3)')
                  }
                >
                  ${pts}
                </button>
              ),
              /* Question cells for this row */
              ...board.categories.map((cat) => {
                const q = cat.questions.find((q) => q.points === pts)
                if (!q) return <div key={`${cat.id}-${pts}`} />
                const isActive = editingCell?.questionId === q.id
                const hasClue = !!q.question.trim()
                const hasAnswer = !!q.answer.trim()
                const isEmpty = !hasClue && !hasAnswer && !q.mediaId
                const mediaType = q.mediaId ? (q.mediaType ?? mediaTypesById[q.mediaId]) : undefined
                const iconStyle = { color: 'var(--gold)', opacity: 0.8 } as const
                return (
                  <button
                    key={q.id}
                    className="board-cell rounded"
                    style={{
                      minHeight: 72,
                      border: isActive
                        ? '2px solid var(--gold)'
                        : '2px dashed rgba(59,130,246,0.3)',
                      position: 'relative',
                    }}
                    onClick={() => openCell(cat.id, q)}
                  >
                    {/* Point value — always top-center */}
                    <div
                      className="font-display text-2xl"
                      style={{ color: 'var(--gold-bright)', position: 'absolute', top: 8, left: 0, right: 0, textAlign: 'center' }}
                    >
                      ${pts}
                    </div>

                    {/* Bottom-left: clue icon + media icon */}
                    {(hasClue || q.mediaId) && (
                      <div style={{ position: 'absolute', bottom: 5, left: 5, display: 'flex', gap: 3, alignItems: 'center' }}>
                        {hasClue && <HelpCircle size={16} style={iconStyle} />}
                        {q.mediaId && (
                          mediaType === 'image' ? <Image size={16} style={iconStyle} />
                          : mediaType === 'audio' ? <Music size={16} style={iconStyle} />
                          : mediaType === 'video' ? <Video size={16} style={iconStyle} />
                          : <Paperclip size={16} style={iconStyle} />
                        )}
                      </div>
                    )}

                    {/* Bottom-right: answer icon */}
                    {hasAnswer && (
                      <div style={{ position: 'absolute', bottom: 5, right: 5 }}>
                        <FileText size={16} style={iconStyle} />
                      </div>
                    )}

                    {/* Bottom-center: empty label */}
                    {isEmpty && (
                      <div
                        className="text-xs"
                        style={{ position: 'absolute', bottom: 5, left: 0, right: 0, textAlign: 'center', color: '#4a5580' }}
                      >
                        empty
                      </div>
                    )}

                    {board.dailyDoubleQuestionId === q.id && (
                      <div className="dd-badge">DD</div>
                    )}
                  </button>
                )
              }),
            ])}
          </div>
        </div>

        {/* Question editor panel — overlays the board; board width stays fixed */}
        {editingCell && activeQ && activeCategory && (
          <div
            className={`panel board-editor-question-panel flex flex-col gap-4 overflow-auto${
              panelExiting
                ? ' board-editor-question-panel--exit'
                : ' board-editor-question-panel--enter'
            }`}
            onAnimationEnd={handlePanelAnimationEnd}
          >
            <div className="flex items-center justify-between">
              <span
                className="font-condensed font-bold uppercase text-sm"
                style={{ color: 'var(--gold)' }}
              >
                {activeCategory.name} · ${activeQ.points}
              </span>
              <button
                className="btn-ghost text-xs py-1 px-2"
                onClick={closePanel}
              >
                ✕
              </button>
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
                rows={3}
                placeholder="Enter the clue shown to players…"
                value={activeQ.question}
                onChange={(e) =>
                  updateQuestion(editingCell.categoryId, activeQ.id, { question: e.target.value })
                }
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
                value={activeQ.answer}
                onChange={(e) =>
                  updateQuestion(editingCell.categoryId, activeQ.id, { answer: e.target.value })
                }
              />
            </div>

            <div>
              <label
                className="font-condensed text-xs uppercase tracking-wider mb-2 block"
                style={{ color: 'var(--gold)', opacity: 0.7 }}
              >
                Media attachment
              </label>
              {mediaPreview ? (
                <div className="relative">
                  {activeQ.mediaId && (
                    <>
                      {mediaPreview.startsWith('data:image') && (
                        <img
                          src={mediaPreview}
                          className="w-full rounded mb-2"
                          style={{ maxHeight: 140, objectFit: 'contain' }}
                        />
                      )}
                      {mediaPreview.startsWith('data:audio') && (
                        <audio controls src={mediaPreview} className="w-full mb-2" />
                      )}
                      {mediaPreview.startsWith('data:video') && (
                        <video
                          controls
                          src={mediaPreview}
                          className="w-full rounded mb-2"
                          style={{ maxHeight: 120 }}
                        />
                      )}
                    </>
                  )}
                  <button
                    className="btn-ghost text-xs w-full btn-with-icon justify-center"
                    onClick={removeMedia}
                    title="Remove attached media from this question"
                  >
                    <Trash2 size={14} aria-hidden />
                    <span>Remove</span>
                  </button>
                </div>
              ) : (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,audio/*,video/*"
                    className="hidden"
                    onChange={handleMediaUpload}
                    id="media-upload"
                  />
                  <label
                    htmlFor="media-upload"
                    className="btn-ghost text-sm w-full btn-with-icon justify-center py-2 cursor-pointer"
                    title="Attach an image, audio clip, or video to this question"
                  >
                    <Upload size={16} aria-hidden />
                    <span>Attach media</span>
                  </label>
                </>
              )}
            </div>

            <div
              className="board-editor-dd-toggle"
              style={{
                background:
                  board.dailyDoubleQuestionId === activeQ.id
                    ? 'rgba(212,160,23,0.15)'
                    : 'var(--navy)',
                border: `1px solid ${
                  board.dailyDoubleQuestionId === activeQ.id
                    ? 'rgba(212,160,23,0.45)'
                    : 'var(--navy-light)'
                }`,
              }}
              onClick={() => {
                const isDD = board.dailyDoubleQuestionId === activeQ.id
                updateBoard({ dailyDoubleQuestionId: isDD ? undefined : activeQ.id })
              }}
            >
              <div className="flex-1">
                <div className="font-condensed font-bold text-sm">Daily Double</div>
                <div className="text-xs" style={{ color: '#4a5580' }}>
                  Mark this question as the daily double
                </div>
              </div>
              <div
                className="w-11 h-6 rounded-full relative transition-colors flex-shrink-0"
                style={{
                  background:
                    board.dailyDoubleQuestionId === activeQ.id ? 'var(--gold)' : 'var(--navy-light)',
                }}
              >
                <div
                  className="absolute top-0.5 w-5 h-5 rounded-full transition-transform"
                  style={{
                    background: 'var(--navy-mid)',
                    left:
                      board.dailyDoubleQuestionId === activeQ.id ? 'calc(100% - 22px)' : '2px',
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
