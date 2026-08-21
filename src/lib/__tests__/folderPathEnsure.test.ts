import { describe, expect, it, vi } from 'vitest'
import { ensureFolderPathIds } from '../folderPath'

type Folder = { id: string; name: string; parentId: string | null; trashedAt?: number | null }

describe('ensureFolderPathIds', () => {
  it('returns root for missing, empty, or slash paths', () => {
    const createFolder = vi.fn()
    for (const path of [undefined, null, '', '/'] as const) {
      const result = ensureFolderPathIds(path, {
        getFolders: () => [],
        isTrashed: () => false,
        createFolder,
      })
      expect(result).toEqual({ folderId: null, createdIds: [] })
    }
    expect(createFolder).not.toHaveBeenCalled()
  })

  it('reuses an existing folder with the same name', () => {
    const folders: Folder[] = [{ id: 'f1', name: 'Sports', parentId: null }]
    const createFolder = vi.fn()
    const result = ensureFolderPathIds('/Sports', {
      getFolders: () => folders,
      isTrashed: (f) => f.trashedAt != null,
      createFolder,
    })
    expect(result).toEqual({ folderId: 'f1', createdIds: [] })
    expect(createFolder).not.toHaveBeenCalled()
  })

  it('reuses case-insensitively without creating a suffix folder', () => {
    const folders: Folder[] = [{ id: 'f1', name: 'Sports', parentId: null }]
    const createFolder = vi.fn()
    const result = ensureFolderPathIds('/sports', {
      getFolders: () => folders,
      isTrashed: (f) => f.trashedAt != null,
      createFolder,
    })
    expect(result.folderId).toBe('f1')
    expect(createFolder).not.toHaveBeenCalled()
  })

  it('creates missing nested segments and reuses the parent', () => {
    const folders: Folder[] = [{ id: 'f1', name: 'Trivia', parentId: null }]
    const createFolder = vi.fn((_name: string, parentId: string | null) => {
      const id = 'f2'
      folders.push({ id, name: 'Geography', parentId })
      return id
    })
    const result = ensureFolderPathIds('/Trivia/Geography', {
      getFolders: () => folders,
      isTrashed: (f) => f.trashedAt != null,
      createFolder,
    })
    expect(result).toEqual({ folderId: 'f2', createdIds: ['f2'] })
    expect(createFolder).toHaveBeenCalledOnce()
    expect(createFolder).toHaveBeenCalledWith('Geography', 'f1')
  })

  it('ignores trashed folders and creates a live one with the same name', () => {
    const folders: Folder[] = [{ id: 'old', name: 'Sports', parentId: null, trashedAt: 1 }]
    const createFolder = vi.fn((name: string, parentId: string | null) => {
      const id = 'new'
      folders.push({ id, name, parentId })
      return id
    })
    const result = ensureFolderPathIds('/Sports', {
      getFolders: () => folders,
      isTrashed: (f) => f.trashedAt != null,
      createFolder,
    })
    expect(result).toEqual({ folderId: 'new', createdIds: ['new'] })
    expect(createFolder).toHaveBeenCalledWith('Sports', null)
  })
})
