import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Trash2,
  Upload,
  FileText,
  Image,
  Music,
  Video,
  Paperclip,
  HelpCircle,
  Save,
  LogOut,
  Settings,
} from 'lucide-react'
import type { Board, Category, GameSettings, Question } from '../types'
import { generateId } from '../lib/utils'
import { saveMedia, deleteMedia, getMedia, blobToDataUrl } from '../lib/db'
import { mimeTypeToMediaType, type MediaType } from '../lib/mediaType'
import CategorySettingsModal from './CategorySettingsModal'

interface Props {
  board: Board
  globalSettings: GameSettings
  onChange: (board: Board) => void
  onClose: () => void
  onDelete: () => void
}

interface EditingCell {
  categoryId: string
  questionId: string
}

export default function BoardEditor({ board, globalSettings, onChange, onClose, onDelete }: Props) {
  const [draft, setDraft] = useState<Board>(board)
  const [dirty, setDirty] = useState(false)
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null)
  const [panelExiting, setPanelExiting] = useState(false)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [settingsCategoryId, setSettingsCategoryId] = useState<string | null>(null)
  const [mediaPreview, setMediaPreview] = useState<string | null>(null)
  const [editingRowPts, setEditingRowPts] = useState<number | null>(null)
  const [editingRowText, setEditingRowText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const draftRef = useRef(draft)
  const onChangeRef = useRef(onChange)
  const [mediaTypesById, setMediaTypesById] = useState<Record<string, MediaType>>({})
  draftRef.current = draft
  onChangeRef.current = onChange

  useEffect(() => {
    let cancelled = false

    async function resolveMediaTypes() {
      const map: Record<string, MediaType> = {}
      const patches = new Map<string, MediaType>()

      for (const cat of draftRef.current.categories) {
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

      const current = draftRef.current
      const categories = current.categories.map((cat) => ({
        ...cat,
        questions: cat.questions.map((q) =>
          patches.has(q.id) ? { ...q, mediaType: patches.get(q.id) } : q
        ),
      }))
      const updated = { ...current, categories, updatedAt: Date.now() }
      setDraft(updated)
      onChangeRef.current(updated)
      setDirty(false)
    }

    resolveMediaTypes()
    return () => {
      cancelled = true
    }
  }, [board.id])

  function saveDraft() {
    onChangeRef.current(draftRef.current)
    setDirty(false)
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        onChangeRef.current(draftRef.current)
        setDirty(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function requestExit() {
    if (!dirty) {
      onClose()
      return
    }
    setShowExitConfirm(true)
  }

  function saveAndExit() {
    onChange(draftRef.current)
    setDirty(false)
    setShowExitConfirm(false)
    onClose()
  }

  function discardAndExit() {
    setShowExitConfirm(false)
    onClose()
  }

  const activeQ = editingCell
    ? draft.categories.find((c) => c.id === editingCell.categoryId)
        ?.questions.find((q) => q.id === editingCell.questionId) ?? null
    : null
  const activeCategory = editingCell
    ? draft.categories.find((c) => c.id === editingCell.categoryId) ?? null
    : null

  const updateBoard = useCallback((patch: Partial<Board>) => {
    setDraft((prev) => ({ ...prev, ...patch, updatedAt: Date.now() }))
    setDirty(true)
  }, [])

  function updateCategory(catId: string, patch: Partial<Category>) {
    setDraft((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      categories: prev.categories.map((c) => (c.id === catId ? { ...c, ...patch } : c)),
    }))
    setDirty(true)
  }

  function updateQuestion(catId: string, qId: string, patch: Partial<Question>) {
    setDraft((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      categories: prev.categories.map((c) =>
        c.id === catId
          ? {
              ...c,
              questions: c.questions.map((q) => (q.id === qId ? { ...q, ...patch } : q)),
            }
          : c
      ),
    }))
    setDirty(true)
  }

  function addCategory() {
    const newCat: Category = {
      id: generateId(),
      name: 'New Category',
      syncSettingsWithGlobal: true,
      questions: draft.pointValues.map((pts) => ({
        id: generateId(),
        question: '',
        answer: '',
        points: pts,
      })),
    }
    updateBoard({ categories: [...draft.categories, newCat] })
  }

  function removeCategory(catId: string) {
    updateBoard({ categories: draft.categories.filter((c) => c.id !== catId) })
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
    if (draft.pointValues.some((v) => v !== oldPts && v === newPts)) return

    const newPointValues = draft.pointValues.map((v) => (v === oldPts ? newPts : v)).sort((a, b) => a - b)
    const newCategories = draft.categories.map((cat) => ({
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
      boardId: draft.id,
      questionId: activeQ.id,
      mimeType: file.type,
      blob: file,
    })
    const mediaType = mimeTypeToMediaType(file.type)
    const isAv = mediaType === 'audio' || mediaType === 'video'
    updateQuestion(editingCell.categoryId, editingCell.questionId, {
      mediaId,
      mediaType,
      autoplayMedia: isAv ? (activeQ.autoplayMedia ?? true) : undefined,
    })
    const url = await blobToDataUrl(file)
    setMediaPreview(url)
  }

  async function removeMedia() {
    if (!editingCell || !activeQ?.mediaId) return
    await deleteMedia(activeQ.mediaId)
    updateQuestion(editingCell.categoryId, editingCell.questionId, {
      mediaId: undefined,
      mediaType: undefined,
      autoplayMedia: undefined,
    })
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
            value={draft.name}
            onChange={(e) => updateBoard({ name: e.target.value })}
          />
        </div>

        <div className="board-editor-toolbar__right">
          <button
            className="btn-gold text-sm btn-with-icon"
            onClick={saveDraft}
            disabled={!dirty}
            title="Save board (Ctrl+S)"
          >
            <Save size={16} aria-hidden />
            <span>Save</span>
          </button>
          <button
            className="btn-ghost text-sm btn-with-icon"
            style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
            onClick={onDelete}
            title="Move board to trash"
          >
            <Trash2 size={16} aria-hidden />
            <span>Delete</span>
          </button>
          <button
            className="btn-ghost text-sm btn-with-icon"
            onClick={requestExit}
            title="Exit editor"
          >
            <LogOut size={16} aria-hidden />
            <span>Exit</span>
          </button>
        </div>
      </div>

      <div className="board-editor-body flex-1 min-h-0">
        {/* Grid */}
        <div className="overflow-auto min-w-0 h-full">
          <div
            className="grid gap-2 min-w-max"
            style={{ gridTemplateColumns: `72px repeat(${draft.categories.length}, minmax(140px, 1fr))` }}
          >
            {/* Row label column spacer for header row */}
            <div />

            {/* Category headers */}
            {draft.categories.map((cat) => (
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
                  type="button"
                  className="absolute top-1 left-1 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:brightness-75"
                  style={{
                    background: 'var(--navy-light)',
                    color: 'var(--gold)',
                    border: '1px solid rgba(212,175,55,0.35)',
                    transition: 'opacity 150ms, filter 150ms',
                  }}
                  title="Category settings"
                  aria-label={`Settings for ${cat.name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setSettingsCategoryId(cat.id)
                  }}
                >
                  <Settings size={11} aria-hidden />
                </button>
                <button
                  type="button"
                  className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:brightness-75"
                  style={{
                    background: 'var(--red)',
                    color: '#fff',
                    border: 'none',
                    transition: 'opacity 150ms, filter 150ms',
                  }}
                  title="Delete category"
                  aria-label={`Delete ${cat.name}`}
                  onClick={() => removeCategory(cat.id)}
                >
                  <Trash2 size={11} aria-hidden />
                </button>
              </div>
            ))}

            {/* Question cells with editable row point value labels */}
            {draft.pointValues.map((pts) => [
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
              ...draft.categories.map((cat) => {
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

                    {draft.dailyDoubleQuestionId === q.id && (
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
              <div className="board-editor-media-group">
                {mediaPreview ? (
                  <>
                    {activeQ.mediaId && (
                      <>
                        {mediaPreview.startsWith('data:image') && (
                          <img
                            src={mediaPreview}
                            className="w-full rounded"
                            style={{ maxHeight: 140, objectFit: 'contain' }}
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
                  </>
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
                {(activeQ.mediaType === 'audio' ||
                  activeQ.mediaType === 'video' ||
                  mediaPreview?.startsWith('data:audio') ||
                  mediaPreview?.startsWith('data:video')) && (
                  <div
                    className="board-editor-dd-toggle"
                    role="switch"
                    aria-checked={activeQ.autoplayMedia !== false}
                    onClick={() =>
                      updateQuestion(editingCell.categoryId, activeQ.id, {
                        autoplayMedia: activeQ.autoplayMedia === false,
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
                          activeQ.autoplayMedia !== false ? 'var(--gold)' : 'var(--navy-light)',
                      }}
                    >
                      <div
                        className="absolute top-0.5 w-5 h-5 rounded-full transition-transform"
                        style={{
                          background: 'var(--navy-mid)',
                          left:
                            activeQ.autoplayMedia !== false ? 'calc(100% - 22px)' : '2px',
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div
              className="board-editor-dd-toggle"
              onClick={() => {
                const isDD = draft.dailyDoubleQuestionId === activeQ.id
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
                    draft.dailyDoubleQuestionId === activeQ.id ? 'var(--gold)' : 'var(--navy-light)',
                }}
              >
                <div
                  className="absolute top-0.5 w-5 h-5 rounded-full transition-transform"
                  style={{
                    background: 'var(--navy-mid)',
                    left:
                      draft.dailyDoubleQuestionId === activeQ.id ? 'calc(100% - 22px)' : '2px',
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {settingsCategoryId && (() => {
        const settingsCat = draft.categories.find((c) => c.id === settingsCategoryId)
        if (!settingsCat) return null
        return (
          <CategorySettingsModal
            category={settingsCat}
            globalSettings={globalSettings}
            onChange={(patch) => updateCategory(settingsCat.id, patch)}
            onClose={() => setSettingsCategoryId(null)}
          />
        )
      })()}

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
              <button className="btn-gold w-full btn-with-icon justify-center" onClick={saveAndExit}>
                <Save size={16} aria-hidden />
                <span>Save &amp; Exit</span>
              </button>
              <button className="btn-ghost w-full" onClick={discardAndExit}>
                Discard &amp; Exit
              </button>
              <button className="btn-ghost w-full" onClick={() => setShowExitConfirm(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
