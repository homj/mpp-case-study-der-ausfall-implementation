/** TanStack Query keys and hooks. One place decides what to refetch. */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

export const queryKeys = {
  practitioners: ['practitioners'] as const,
  absences: ['absences'] as const,
  absence: (id: string) => ['absences', id] as const,
  tasks: (status: 'open' | 'all') => ['tasks', status] as const,
}

export function usePractitioners() {
  return useQuery({ queryKey: queryKeys.practitioners, queryFn: api.listPractitioners })
}

export function useAbsences() {
  return useQuery({ queryKey: queryKeys.absences, queryFn: api.listAbsences })
}

export function useTasks(status: 'open' | 'all') {
  return useQuery({ queryKey: queryKeys.tasks(status), queryFn: () => api.listTasks(status) })
}

/** Every quick action can change the queue, the absences, and one absence view. */
export function useInvalidateAll() {
  const client = useQueryClient()
  return () => {
    void client.invalidateQueries({ queryKey: ['tasks'] })
    void client.invalidateQueries({ queryKey: ['absences'] })
  }
}
