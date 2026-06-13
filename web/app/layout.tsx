import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'dama-bot dashboard',
  description: 'Items overview',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        {children}
      </body>
    </html>
  )
}
