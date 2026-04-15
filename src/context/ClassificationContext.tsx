import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { BuildingClassification, ClassificationEntry } from '../types'
import { loadClassifications, migrateLegacyClassification, saveClassifications } from '../store/classificationStore'
import {
  fetchClassifications,
  saveClassification as apiSaveClassification,
  deleteClassification as apiDeleteClassification,
} from '../services/classificationApi'
import { useAuth } from './AuthContext'

type ClassificationState = Record<string, ClassificationEntry>

const API_ENABLED = !!import.meta.env.VITE_API_URL

interface ClassificationContextValue {
  classifications: ClassificationState
  setClassification: (
    buildingId: string,
    classification: BuildingClassification,
    yearOfConstruction?: number | null,
    geometry?: GeoJSON.Geometry | null,
    vectorFeatureId?: number | null
  ) => void
  getClassification: (buildingId: string) => BuildingClassification
  getYearOfConstruction: (buildingId: string) => number | null | undefined
  setYearOfConstruction: (buildingId: string, year: number | null) => void
  importClassifications: (data: ClassificationState) => void
  hasPendingChanges: boolean
  saveAllPending: () => void
}

const ClassificationContext = createContext<ClassificationContextValue | null>(null)

export function ClassificationProvider({ children }: { children: ReactNode }) {
  const { refreshMe, isLoggedIn } = useAuth()
  const [classifications, setClassifications] = useState<ClassificationState>(() =>
    loadClassifications()
  )
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set())
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!API_ENABLED) return
    fetchClassifications()
      .then((remote) => {
        const local = loadClassifications()
        const normalizedRemote: ClassificationState = {}
        for (const [id, entry] of Object.entries(remote)) {
          const n = migrateLegacyClassification(entry)
          if (n !== null) normalizedRemote[id] = n
        }
        const merged = { ...normalizedRemote }
        for (const [id, entry] of Object.entries(local)) {
          const n = migrateLegacyClassification(entry)
          if (n === null) continue
          if (!merged[id] || n.lastModified > merged[id].lastModified) {
            merged[id] = n
          }
        }
        setClassifications(merged)
        saveClassifications(merged)
      })
      .catch(() => {})
  }, [])

  const setClassification = useCallback(
    (
      buildingId: string,
      classification: BuildingClassification,
      yearOfConstruction?: number | null,
      geometry?: GeoJSON.Geometry | null,
      vectorFeatureId?: number | null
    ) => {
    setClassifications((prev) => {
      const next = { ...prev }
      if (classification === null) {
        delete next[buildingId]
      } else {
        const existing = prev[buildingId]
        const nextVectorId =
          vectorFeatureId !== undefined && vectorFeatureId !== null
            ? vectorFeatureId
            : existing?.vectorFeatureId
        next[buildingId] = {
          classification,
          yearOfConstruction: yearOfConstruction !== undefined ? yearOfConstruction : (existing?.yearOfConstruction ?? null),
          lastModified: Date.now(),
          geometry: geometry !== undefined ? geometry : (existing?.geometry ?? null),
          ...(nextVectorId !== undefined && nextVectorId !== null ? { vectorFeatureId: nextVectorId } : {}),
        }
      }
      return next
    })
    if (classification === null) {
      setDeletedIds((prev) => new Set(prev).add(buildingId))
      setDirtyIds((prev) => { const n = new Set(prev); n.delete(buildingId); return n })
    } else {
      setDirtyIds((prev) => new Set(prev).add(buildingId))
      setDeletedIds((prev) => { const n = new Set(prev); n.delete(buildingId); return n })
    }
  }, [])

  const getClassification = useCallback(
    (buildingId: string): BuildingClassification => {
      return classifications[buildingId]?.classification ?? null
    },
    [classifications]
  )

  const getYearOfConstruction = useCallback(
    (buildingId: string): number | null | undefined => {
      return classifications[buildingId]?.yearOfConstruction
    },
    [classifications]
  )

  const setYearOfConstruction = useCallback((buildingId: string, year: number | null) => {
    setClassifications((prev) => {
      const existing = prev[buildingId]
      if (!existing) return prev
      const next = { ...prev, [buildingId]: { ...existing, yearOfConstruction: year, lastModified: Date.now() } }
      return next
    })
    setDirtyIds((prev) => new Set(prev).add(buildingId))
  }, [])

  const hasPendingChanges = dirtyIds.size > 0 || deletedIds.size > 0

  const saveAllPending = useCallback(() => {
    setClassifications((current) => {
      saveClassifications(current)

      if (API_ENABLED) {
        for (const id of dirtyIds) {
          const entry = current[id]
          if (entry) apiSaveClassification(id, entry).catch(() => {})
        }
        for (const id of deletedIds) {
          apiDeleteClassification(id).catch(() => {})
        }
        if (isLoggedIn) {
          void refreshMe()
        }
      }

      return current
    })
    setDirtyIds(new Set())
    setDeletedIds(new Set())
  }, [dirtyIds, deletedIds, isLoggedIn, refreshMe])

  const importClassifications = useCallback((data: ClassificationState) => {
    const next: ClassificationState = {}
    for (const [id, entry] of Object.entries(data)) {
      const n = migrateLegacyClassification(entry)
      if (n !== null) next[id] = n
    }
    setClassifications(next)
    saveClassifications(next)
    setDirtyIds(new Set())
    setDeletedIds(new Set())
  }, [])

  const value = useMemo<ClassificationContextValue>(
    () => ({
      classifications, setClassification, getClassification, getYearOfConstruction,
      setYearOfConstruction, importClassifications,
      hasPendingChanges, saveAllPending,
    }),
    [classifications, setClassification, getClassification, getYearOfConstruction,
     setYearOfConstruction, importClassifications,
     hasPendingChanges, saveAllPending]
  )

  return (
    <ClassificationContext.Provider value={value}>
      {children}
    </ClassificationContext.Provider>
  )
}

export function useClassification() {
  const ctx = useContext(ClassificationContext)
  if (!ctx) throw new Error('useClassification must be used within ClassificationProvider')
  return ctx
}
