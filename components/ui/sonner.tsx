'use client'

import { useTheme } from 'next-themes'
import { toast as sonnerToast, Toaster as SonnerToaster } from 'sonner'

const Toaster = ({ ...props }: { theme?: string; className?: string; style?: React.CSSProperties }) => {
  const { theme = 'system' } = useTheme()

  return (
    <SonnerToaster
      theme={theme as any}
      className="toaster group"
      style={{
        '--normal-bg': 'var(--popover)',
        '--normal-text': 'var(--popover-foreground)',
        '--normal-border': 'var(--border)',
      } as React.CSSProperties}
      {...props as any}
    />
  )
}

export { Toaster, sonnerToast as toast }
