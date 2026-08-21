import { useCallback, useRef, useState } from 'react'
import {
  TransferAbortError,
  TransferValidationError,
  type OnTransferProgress,
  type TransferProgress,
} from './types'

export interface TransferJobState {
  title: string
  percent: number
  label?: string
}

export function useTransferJob() {
  const [job, setJob] = useState<TransferJobState | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const clearJob = useCallback(() => {
    abortRef.current = null
    setJob(null)
  }, [])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const dismissError = useCallback(() => setErrorMessage(null), [])

  const showError = useCallback((message: string) => {
    setErrorMessage(message)
  }, [])

  const runTransfer = useCallback(
    async (
      title: string,
      work: (signal: AbortSignal, onProgress: OnTransferProgress) => Promise<void>,
    ) => {
      const controller = new AbortController()
      abortRef.current = controller
      setJob({ title, percent: 0, label: 'Starting…' })

      const onProgress: OnTransferProgress = (p: TransferProgress) => {
        const percent =
          p.total > 0 ? Math.min(100, Math.round((p.done / p.total) * 100)) : 0
        setJob({ title, percent, label: p.label })
      }

      try {
        await work(controller.signal, onProgress)
        clearJob()
      } catch (err) {
        clearJob()
        if (
          err instanceof TransferAbortError ||
          (err instanceof DOMException && err.name === 'AbortError') ||
          controller.signal.aborted
        ) {
          return
        }
        const message =
          err instanceof TransferValidationError || err instanceof Error
            ? err.message
            : 'Transfer failed.'
        setErrorMessage(message)
      }
    },
    [clearJob],
  )

  return {
    job,
    errorMessage,
    cancel,
    dismissError,
    showError,
    runTransfer,
  }
}
