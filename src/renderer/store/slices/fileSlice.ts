/**
 * 文件相关状态切片
 */
import { StateCreator } from 'zustand'

export interface FileItem {
  name: string
  path: string
  isDirectory: boolean
}

export interface OpenFile {
  path: string
  content: string
  isDirty: boolean
  originalContent?: string
}

export interface FileSlice {
  workspacePath: string | null
  files: FileItem[]
  expandedFolders: Set<string>
  openFiles: OpenFile[]
  activeFilePath: string | null

  setWorkspacePath: (path: string | null) => void
  setFiles: (files: FileItem[]) => void
  toggleFolder: (path: string) => void
  openFile: (path: string, content: string, originalContent?: string) => void
  closeFile: (path: string) => void
  setActiveFile: (path: string | null) => void
  updateFileContent: (path: string, content: string) => void
  markFileSaved: (path: string) => void
}

export const createFileSlice: StateCreator<FileSlice, [], [], FileSlice> = (set) => ({
  workspacePath: null,
  files: [],
  expandedFolders: new Set(),
  openFiles: [],
  activeFilePath: null,

  setWorkspacePath: (path) => set({ workspacePath: path }),
  setFiles: (files) => set({ files }),
  toggleFolder: (path) =>
    set((state) => {
      const newExpanded = new Set(state.expandedFolders)
      if (newExpanded.has(path)) {
        newExpanded.delete(path)
      } else {
        newExpanded.add(path)
      }
      return { expandedFolders: newExpanded }
    }),

  openFile: (path, content, originalContent) =>
    set((state) => {
      const existing = state.openFiles.find((f) => f.path === path)
      if (existing) {
        const updatedFiles = state.openFiles.map((f) =>
          f.path === path ? { ...f, content, originalContent } : f
        )
        return { activeFilePath: path, openFiles: updatedFiles }
      }
      return {
        openFiles: [...state.openFiles, { path, content, isDirty: false, originalContent }],
        activeFilePath: path,
      }
    }),

  closeFile: (path) =>
    set((state) => {
      const newOpenFiles = state.openFiles.filter((f) => f.path !== path)
      const newActivePath =
        state.activeFilePath === path
          ? newOpenFiles[newOpenFiles.length - 1]?.path || null
          : state.activeFilePath
      return { openFiles: newOpenFiles, activeFilePath: newActivePath }
    }),

  setActiveFile: (path) => set({ activeFilePath: path }),

  updateFileContent: (path, content) =>
    set((state) => ({
      openFiles: state.openFiles.map((f) =>
        f.path === path ? { ...f, content, isDirty: true } : f
      ),
    })),

  markFileSaved: (path) =>
    set((state) => ({
      openFiles: state.openFiles.map((f) => (f.path === path ? { ...f, isDirty: false } : f)),
    })),
})
