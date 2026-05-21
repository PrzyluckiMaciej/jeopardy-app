import { useState, useRef, useCallback } from 'react'
import { Trash2 } from 'lucide-react'
import type { Board, Category, Question } from '../types'
import { generateId } from '../lib/utils'
import { saveMedia, deleteMedia, getMedia, blobToDataUrl } from '../lib/db'

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
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [boardName, setBoardName] = useState(board.name)
  const [mediaPreview, setMediaPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const activeQ = editingCell
    ? board.categories.find((c) => c.id === editingCell.categoryId)
        ?.questions.find((q) => q.id === editingCell.questionId) ?? null
    : null
  const activeCategory = editingCell
    ? board.categories.find((c) => c.id === editingCell.categoryId) ?? null
    : null

  const updateBoard = useCallback((patch: Partial<Board>) => {
    onChange({ ...board, ...patch, updatedAt: Date.now() })
  }, [board, onChange])

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
    if (editingCell?.categoryId === catId) setEditingCell(null)
  }

  async function openCell(catId: string, q: Question) {
    setEditingCell({ categoryId: catId, questionId: q.id })
    setMediaPreview(null)
    if (q.mediaId) {
      const rec = await getMedia(q.mediaId)
      if (rec) {
        const url = await blobToDataUrl(rec.blob)
        setMediaPreview(url)
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
    updateQuestion(editingCell.categoryId, editingCell.questionId, { mediaId })
    const url = await blobToDataUrl(file)
    setMediaPreview(url)
  }

  async function removeMedia() {
    if (!editingCell || !activeQ?.mediaId) return
    await deleteMedia(activeQ.mediaId)
    updateQuestion(editingCell.categoryId, editingCell.questionId, { mediaId: undefined })
    setMediaPreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-4 mb-5 flex-wrap">
        <input
          className="text-xl font-condensed"
          style={{ background: 'transparent', border: 'none', color: 'var(--gold-bright)', fontSize: 22, fontWeight: 700, letterSpacing: 1, borderBottom: '2px solid var(--navy-light)', borderRadius: 0, paddingLeft: 0 }}
          value={boardName}
          onChange={(e) => {
            setBoardName(e.target.value)
            updateBoard({ name: e.target.value })
          }}
        />
        <div className="flex gap-2 ml-auto">
          <button className="btn-outline text-sm" onClick={addCategory}>+ Category</button>
          <button className="btn-gold text-sm" onClick={onClose}>Done editing</button>
        </div>
      </div>

      <div className="flex gap-5 flex-1 min-h-0">
        {/* Grid */}
        <div className="flex-1 overflow-auto">
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${board.categories.length}, minmax(120px, 1fr))` }}
          >
            {/* Category headers */}
            {board.categories.map((cat) => (
              <div key={cat.id} className="relative group">
                {editingCategoryId === cat.id ? (
                  <input
                    autoFocus
                    className="w-full text-center text-sm font-condensed font-bold uppercase"
                    style={{ background: 'var(--navy-mid)', border: '2px solid var(--gold)', borderRadius: 6, padding: '10px 8px' }}
                    value={cat.name}
                    onChange={(e) => updateCategory(cat.id, { name: e.target.value })}
                    onBlur={() => setEditingCategoryId(null)}
                    onKeyDown={(e) => e.key === 'Enter' && setEditingCategoryId(null)}
                  />
                ) : (
                  <div
                    className="text-center text-sm font-condensed font-bold uppercase py-3 px-2 rounded cursor-pointer"
                    style={{ background: 'var(--navy-mid)', border: '2px solid var(--navy-light)', letterSpacing: 1, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => setEditingCategoryId(cat.id)}
                    title="Click to rename"
                  >
                    {cat.name}
                  </div>
                )}
                <button
                  className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:brightness-75"
                  style={{ background: 'var(--red)', color: '#fff', border: 'none', transition: 'opacity 150ms, filter 150ms' }}
                  onClick={() => removeCategory(cat.id)}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}

            {/* Question cells */}
            {board.pointValues.map((pts) =>
              board.categories.map((cat) => {
                const q = cat.questions.find((q) => q.points === pts)
                if (!q) return <div key={`${cat.id}-${pts}`} />
                const isActive = editingCell?.questionId === q.id
                const hasContent = q.question.trim() || q.answer.trim()
                return (
                  <button
                    key={q.id}
                    className="board-cell rounded"
                    style={{
                      minHeight: 72,
                      border: isActive ? '2px solid var(--gold)' : undefined,
                      position: 'relative',
                    }}
                    onClick={() => openCell(cat.id, q)}
                  >
                    <div className="font-display text-2xl" style={{ color: 'var(--gold-bright)' }}>
                      ${pts}
                    </div>
                    {!hasContent && (
                      <div className="text-xs mt-1" style={{ color: '#4a5580' }}>empty</div>
                    )}
                    {hasContent && (
                      <div className="w-2 h-2 rounded-full mx-auto mt-1" style={{ background: 'var(--gold)', opacity: 0.6 }} />
                    )}
                    {q.mediaId && (
                      <div className="w-1.5 h-1.5 rounded-full mx-auto mt-1" style={{ background: 'var(--gold)', opacity: 0.8 }} />
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Question editor panel */}
        {editingCell && activeQ && activeCategory && (
          <div className="panel w-80 flex-shrink-0 flex flex-col gap-4 overflow-auto">
            <div className="flex items-center justify-between">
              <span className="font-condensed font-bold uppercase text-sm" style={{ color: 'var(--gold)' }}>
                {activeCategory.name} · ${activeQ.points}
              </span>
              <button className="btn-ghost text-xs py-1 px-2" onClick={() => setEditingCell(null)}>✕</button>
            </div>

            <div>
              <label className="font-condensed text-xs uppercase tracking-wider mb-1 block" style={{ color: 'var(--gold)', opacity: 0.7 }}>
                Question (clue)
              </label>
              <textarea
                className="w-full"
                rows={3}
                placeholder="Enter the clue shown to players…"
                value={activeQ.question}
                onChange={(e) => updateQuestion(editingCell.categoryId, activeQ.id, { question: e.target.value })}
              />
            </div>

            <div>
              <label className="font-condensed text-xs uppercase tracking-wider mb-1 block" style={{ color: 'var(--gold)', opacity: 0.7 }}>
                Answer (in Jeopardy form)
              </label>
              <textarea
                className="w-full"
                rows={2}
                placeholder="What is…?"
                value={activeQ.answer}
                onChange={(e) => updateQuestion(editingCell.categoryId, activeQ.id, { answer: e.target.value })}
              />
            </div>

            <div>
              <label className="font-condensed text-xs uppercase tracking-wider mb-2 block" style={{ color: 'var(--gold)', opacity: 0.7 }}>
                Media attachment
              </label>
              {mediaPreview ? (
                <div className="relative">
                  {activeQ.mediaId && (
                    <>
                      {mediaPreview.startsWith('data:image') && (
                        <img src={mediaPreview} className="w-full rounded mb-2" style={{ maxHeight: 140, objectFit: 'contain' }} />
                      )}
                      {mediaPreview.startsWith('data:audio') && (
                        <audio controls src={mediaPreview} className="w-full mb-2" />
                      )}
                      {mediaPreview.startsWith('data:video') && (
                        <video controls src={mediaPreview} className="w-full rounded mb-2" style={{ maxHeight: 120 }} />
                      )}
                    </>
                  )}
                  <button className="btn-ghost text-xs w-full" onClick={removeMedia}>Remove media</button>
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
                  <label htmlFor="media-upload" className="btn-ghost text-sm w-full block text-center py-2 cursor-pointer">
                    Attach image / audio / video
                  </label>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
