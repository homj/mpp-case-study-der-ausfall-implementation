import { createFileRoute, redirect } from '@tanstack/react-router'

/** The queue is the home screen of the front desk. */
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/queue' })
  },
})
