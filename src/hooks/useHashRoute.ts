import { useEffect, useState } from 'react'

// Hash routing so deep links (#/company/ypf) survive refresh/share on static GitHub Pages.
export function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const on = () => setHash(window.location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const m = hash.match(/^#\/company\/([\w-]+)/)
  return { companyId: m ? m[1] : null }
}

export function goToCompany(id: string) {
  window.location.hash = `#/company/${id}`
}

export function goHome() {
  // clearing the hash without leaving a '#' in the URL
  history.pushState('', document.title, window.location.pathname + window.location.search)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}
