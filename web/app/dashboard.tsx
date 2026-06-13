'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Item } from './page'

const POLL_INTERVAL = 60_000 // 1분

const TYPES = [
  { key: 'action',    label: '할 일',   emoji: '⚡', color: '#3b82f6' },
  { key: 'scheduled', label: '일정',   emoji: '📅', color: '#8b5cf6' },
  { key: 'decision',  label: '결정',   emoji: '🤔', color: '#f59e0b' },
  { key: 'someday',   label: '언젠가', emoji: '💭', color: '#06b6d4' },
  { key: 'emotion',   label: '감정',   emoji: '💛', color: '#ec4899' },
  { key: 'memory',    label: '기억',   emoji: '📌', color: '#10b981' },
] as const

const STATUS_COLORS: Record<string, string> = {
  inbox:    '#3b82f6',
  active:   '#f59e0b',
  snoozed:  '#8b5cf6',
  done:     '#10b981',
  dropped:  '#6b7280',
  archived: '#9ca3af',
}

const STATUS_LABELS: Record<string, string> = {
  inbox:    '받은함',
  active:   '진행중',
  snoozed:  '나중에',
  done:     '완료',
  dropped:  '버림',
  archived: '보관',
}

export function Dashboard({ items: initialItems }: { items: Item[] }) {
  const [items, setItems] = useState(initialItems)
  const [activeType, setActiveType] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState(new Date())

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/items')
      if (!res.ok) return
      const data = await res.json()
      setItems(data)
      setLastUpdated(new Date())
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    const id = setInterval(refresh, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [refresh])

  // Count per type
  const countByType: Record<string, number> = {}
  for (const t of TYPES) countByType[t.key] = 0
  for (const item of items) {
    countByType[item.type] = (countByType[item.type] ?? 0) + 1
  }

  const maxCount = Math.max(...Object.values(countByType), 1)

  // Filter
  const filtered = activeType ? items.filter((i) => i.type === activeType) : items
  const activeLabel = TYPES.find((t) => t.key === activeType)

  return (
    <main style={s.main}>
      {/* Header */}
      <div style={s.header}>
        <h1 style={s.h1}>dama-bot</h1>
        <span style={s.total}>
          {items.length}개 항목 · {lastUpdated.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* Bar chart — type distribution */}
      <section style={s.chartSection}>
        <div style={s.barChart}>
          {TYPES.map((t) => {
            const count = countByType[t.key]
            const pct = (count / maxCount) * 100
            const isActive = activeType === t.key
            return (
              <button
                key={t.key}
                onClick={() => setActiveType(isActive ? null : t.key)}
                style={{
                  ...s.barRow,
                  opacity: activeType && !isActive ? 0.4 : 1,
                  cursor: 'pointer',
                }}
              >
                <span style={s.barLabel}>
                  {t.emoji} {t.label}
                </span>
                <div style={s.barTrack}>
                  <div
                    style={{
                      ...s.barFill,
                      width: `${Math.max(pct, count > 0 ? 4 : 0)}%`,
                      backgroundColor: t.color,
                    }}
                  />
                </div>
                <span style={s.barCount}>{count}</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* Active filter indicator */}
      {activeType && (
        <div style={s.filterBar}>
          <span>
            {activeLabel?.emoji} <strong>{activeLabel?.label}</strong> 항목만 표시중
          </span>
          <button onClick={() => setActiveType(null)} style={s.clearBtn}>
            전체 보기
          </button>
        </div>
      )}

      {/* Items list */}
      {filtered.length === 0 ? (
        <p style={s.empty}>항목 없음</p>
      ) : (
        <div style={s.list}>
          {filtered.map((item) => {
            const typeMeta = TYPES.find((t) => t.key === item.type)
            return (
              <div key={item.id} style={s.card}>
                <div style={s.cardTop}>
                  <span style={{ ...s.typeDot, backgroundColor: typeMeta?.color ?? '#6b7280' }} />
                  <span style={s.typeLabel}>{typeMeta?.label ?? item.type}</span>
                  <span
                    style={{
                      ...s.statusBadge,
                      backgroundColor: STATUS_COLORS[item.status] ?? '#6b7280',
                    }}
                  >
                    {STATUS_LABELS[item.status] ?? item.status}
                  </span>
                  {item.est_minutes > 0 && (
                    <span style={s.est}>{item.est_minutes}분</span>
                  )}
                </div>
                <h3 style={s.cardTitle}>{item.title}</h3>
                {item.first_action && (
                  <p style={s.firstAction}>→ {item.first_action}</p>
                )}
                <div style={s.cardBottom}>
                  {item.due_at && (
                    <span style={s.due}>
                      📅 {new Date(item.due_at).toLocaleDateString('ko-KR')}
                    </span>
                  )}
                  <span style={s.created}>
                    {new Date(item.created_at).toLocaleDateString('ko-KR')}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}

const s: Record<string, React.CSSProperties> = {
  main: {
    maxWidth: 720,
    margin: '0 auto',
    padding: '32px 20px 60px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: '#1a1a1a',
    backgroundColor: '#f8f9fa',
    minHeight: '100vh',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 28,
  },
  h1: {
    fontSize: 24,
    fontWeight: 700,
    margin: 0,
  },
  total: {
    fontSize: 14,
    color: '#9ca3af',
  },

  // Bar chart
  chartSection: {
    marginBottom: 24,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: '16px 20px',
    border: '1px solid #e5e7eb',
  },
  barChart: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  barRow: {
    display: 'grid',
    gridTemplateColumns: '72px 1fr 32px',
    alignItems: 'center',
    gap: 10,
    background: 'none',
    border: 'none',
    padding: '4px 0',
    font: 'inherit',
    color: 'inherit',
    textAlign: 'left',
    transition: 'opacity 0.15s',
  },
  barLabel: {
    fontSize: 13,
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },
  barTrack: {
    height: 20,
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 6,
    transition: 'width 0.3s ease',
  },
  barCount: {
    fontSize: 13,
    fontWeight: 600,
    textAlign: 'right',
    color: '#6b7280',
  },

  // Filter bar
  filterBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 16px',
    backgroundColor: '#eef2ff',
    borderRadius: 8,
    marginBottom: 16,
    fontSize: 13,
  },
  clearBtn: {
    background: 'none',
    border: 'none',
    color: '#3b82f6',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 13,
    font: 'inherit',
  },

  // Items list
  empty: {
    textAlign: 'center',
    color: '#9ca3af',
    marginTop: 60,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: '14px 18px',
    border: '1px solid #e5e7eb',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  cardTop: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  typeDot: {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  typeLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginRight: 'auto',
  },
  statusBadge: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 600,
    padding: '1px 8px',
    borderRadius: 10,
  },
  est: {
    fontSize: 11,
    color: '#9ca3af',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 600,
    margin: 0,
    lineHeight: 1.4,
  },
  firstAction: {
    fontSize: 13,
    color: '#6b7280',
    margin: 0,
  },
  cardBottom: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  due: {
    fontSize: 12,
    color: '#f59e0b',
  },
  created: {
    fontSize: 11,
    color: '#d1d5db',
    marginLeft: 'auto',
  },
}
