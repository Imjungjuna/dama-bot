import { supabase } from '@/lib/supabase'
import { Dashboard } from './dashboard'

export const dynamic = 'force-dynamic'

export type Item = {
  id: string
  type: string
  title: string
  first_action: string | null
  est_minutes: number
  status: string
  due_at: string | null
  created_at: string
  updated_at: string
}

export default async function Page() {
  const { data: items, error } = await supabase
    .from('items')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '40px 20px' }}>
        <h1>dama-bot dashboard</h1>
        <p style={{ color: '#ef4444' }}>Error: {error.message}</p>
      </main>
    )
  }

  return <Dashboard items={(items ?? []) as Item[]} />
}
