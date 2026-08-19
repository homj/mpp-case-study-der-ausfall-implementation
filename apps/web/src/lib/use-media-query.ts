import { useEffect, useState } from 'react'

/**
 * Matches a CSS media query in React state. Hiding a dialog with a CSS class is
 * not enough: a mounted Radix dialog marks the rest of the page inert and traps
 * focus, so the wide-screen layout must not mount the sheet at all.
 * Server rendering and the first client render always report `false`, so
 * hydration stays stable.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const list = window.matchMedia(query)
    setMatches(list.matches)
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/** Tailwind's `lg` breakpoint: from here the queue is master/detail. */
export const useIsWideScreen = () => useMediaQuery('(min-width: 1024px)')
