import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { BuildingClassification, ClassificationEntry } from '../types'
import { loadClassifications, saveClassifications } from '../store/classificationStore'
import {
  fetchClassifications,
  saveClassification as apiSaveClassification,
  deleteClassification as apiDeleteClassification,
} from '../services/classificationApi'

type ClassificationState = Record<string, ClassificationEntry>

type RemoveFeatureStateFn = (buildingId: string) => void

const API_ENABLED = !!import.meta.env.VITE_API_URL

interface ClassificationContextValue {
  classifications: ClassificationState
  setClassification: (buildingId: string, classification: BuildingClassification, yearOfConstruction?: number | null) => void
  getClassification: (buildingId: string) => BuildingClassification
  getYearOfConstruction: (buildingId: string) => number | null | undefined
  setYearOfConstruction: (buildingId: string, year: number | null) => void
  registerRemoveFeatureState: (fn: RemoveFeatureStateFn | null) => void
  importClassifications: (data: ClassificationState) => void
}

const ClassificationContext = createContext<ClassificationContextValue | null>(null)

export function ClassificationProvider({ children }: { children: ReactNode }) {
  const [classifications, setClassifications] = useState<ClassificationState>(() =>
    loadClassifications()
  )
  const removeFeatureStateRef = useRef<RemoveFeatureStateFn | null>(null)

  useEffect(() => {
    if (!API_ENABLED) return
    fetchClassifications()
      .then((remote) => {
        const local = loadClassifications()
        const merged = { ...remote }
        for (const [id, entry] of Object.entries(local)) {
          if (!merged[id] || entry.lastModified > merged[id].lastModified) {
            merged[id] = entry
          }
        }
        setClassifications(merged)
        saveClassifications(merged)
      })
      .catch(() => {
        // API nicht erreichbar — localStorage-Daten weiter verwenden
      })
  }, [])

  const registerRemoveFeatureState = useCallback((fn: RemoveFeatureStateFn | null) => {
    removeFeatureStateRef.current = fn
  }, [])

  const setClassification = useCallback((buildingId: string, classification: BuildingClassification, yearOfConstruction?: number | null) => {
    if (classification === null) {
      removeFeatureStateRef.current?.(buildingId)
    }
    setClassifications((prev) => {
      const next = { ...prev }
      if (classification === null) {
        delete next[buildingId]
        if (API_ENABLED) apiDeleteClassification(buildingId).catch(() => {})
      } else {
        const existing = prev[buildingId]
        const entry: ClassificationEntry = {
          classification,
          yearOfConstruction: yearOfConstruction !== undefined ? yearOfConstruction : (existing?.yearOfConstruction ?? null),
          lastModified: Date.now(),
        }
        next[buildingId] = entry
        if (API_ENABLED) apiSaveClassification(buildingId, entry).catch(() => {})
      }
      saveClassifications(next)
      return next
    })
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
      const entry = { ...existing, yearOfConstruction: year, lastModified: Date.now() }
      const next = { ...prev, [buildingId]: entry }
      saveClassifications(next)
      if (API_ENABLED) apiSaveClassification(buildingId, entry).catch(() => {})
      return next
    })
  }, [])

  const importClassifications = useCallback((data: ClassificationState) => {
    setClassifications(data)
    saveClassifications(data)
  }, [])

  const value = useMemo<ClassificationContextValue>(
    () => ({ classifications, setClassification, getClassification, getYearOfConstruction, setYearOfConstruction, registerRemoveFeatureState, importClassifications }),
    [classifications, setClassification, getClassification, getYearOfConstruction, setYearOfConstruction, registerRemoveFeatureState, importClassifications]
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
