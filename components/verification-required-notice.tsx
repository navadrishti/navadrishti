'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'

type VerificationRequiredNoticeProps = {
  description: string
  title?: string
  className?: string
}

export function VerificationRequiredNotice({
  title = 'Verification required',
  description,
  className,
}: VerificationRequiredNoticeProps) {
  return (
    <div className={cn('rounded-md border border-amber-200 bg-amber-50 p-4', className)}>
      <p className="text-sm font-medium text-amber-800">{title}</p>
      <p className="mt-1 text-sm text-amber-700">
        {description}{' '}
        <Link href="/verification" className="font-medium underline hover:text-amber-900">
          Complete verification now
        </Link>
      </p>
    </div>
  )
}
