import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

// Order/user drawers URL se khulte hain (?order=<id> / ?user=<id>) — link share/refresh
// karne par bhi wahi detail khuli rahe.
export function useDetail() {
  const [params, setParams] = useSearchParams()
  const set = useCallback((key: 'order' | 'user', id: string | null) => {
    setParams(prev => {
      const p = new URLSearchParams(prev)
      p.delete('order')
      p.delete('user')
      if (id) p.set(key, id)
      return p
    }, { replace: !id })
  }, [setParams])
  return {
    orderId: params.get('order'),
    userId: params.get('user'),
    openOrder: useCallback((id: string) => set('order', id), [set]),
    openUser: useCallback((id: string) => set('user', id), [set]),
    close: useCallback(() => set('order', null), [set]),
  }
}
