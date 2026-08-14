import { AlertCircle } from 'lucide-react'

const VERIFIED_BADGE_SRC = '/photos/verified-badge.png'

interface VerificationBadgeProps {
  status: 'verified' | 'unverified' | 'pending' | string
  className?: string
  showText?: boolean
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'readable' | 'xl'
  badgeNumber?: string | null
}

const sizeStyles = {
  xs: {
    fontSize: '9px',
    iconSize: 12,
  },
  sm: {
    fontSize: '10px',
    iconSize: 16,
  },
  md: {
    fontSize: '11px',
    iconSize: 18,
  },
  lg: {
    fontSize: '12px',
    iconSize: 20,
  },
  readable: {
    fontSize: '16px',
    iconSize: 24,
  },
  xl: {
    fontSize: '20px',
    iconSize: 28,
  },
}

export function VerificationBadge({
  status,
  className = '',
  showText = true,
  size = 'md',
  badgeNumber = null,
}: VerificationBadgeProps) {
  // Only render for verified status to ensure consistency
  if (status !== 'verified') {
    return null
  }

  const currentSize = sizeStyles[size] || sizeStyles.md
  const number = String(badgeNumber || '').trim().toUpperCase()
  const showNumber = Boolean(number)
  const label = showNumber ? `CA verified · ${number}` : 'Verified'

  return (
    <div
      className={`inline-flex max-w-full min-w-0 items-center ${showNumber ? '' : 'shrink-0'} ${className}`}
      title={label}
      aria-label={label}
      style={{
        fontSize: showText || showNumber ? currentSize.fontSize : '0',
        fontWeight: '500',
        gap: showText || showNumber ? '4px' : '0',
      }}
    >
      <img
        src={VERIFIED_BADGE_SRC}
        alt=""
        width={currentSize.iconSize}
        height={currentSize.iconSize}
        draggable={false}
        onDragStart={(event) => event.preventDefault()}
        className="pointer-events-none select-none shrink-0"
        style={{
          width: currentSize.iconSize,
          height: currentSize.iconSize,
          objectFit: 'contain',
          userSelect: 'none',
          WebkitUserDrag: 'none',
        }}
      />
      {showNumber ? (
        <span
          style={{
            color: '#047857',
            fontSize: currentSize.fontSize,
            fontWeight: size === 'xl' || size === 'readable' ? '700' : '600',
            letterSpacing: '0.04em',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            lineHeight: 1.2,
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
          }}
        >
          {number}
        </span>
      ) : showText ? (
        <span
          style={{
            color: '#047857',
            fontSize: currentSize.fontSize,
            fontWeight: size === 'xl' ? '700' : '500',
            whiteSpace: 'nowrap',
          }}
        >
          Verified
        </span>
      ) : null}
    </div>
  )
}

interface VerificationDetailsProps {
  userType: 'individual' | 'company' | 'ngo'
  verificationDetails: any
  className?: string
}

export function VerificationDetails({ 
  userType, 
  verificationDetails, 
  className = '' 
}: VerificationDetailsProps) {
  const formattedVerificationDate = verificationDetails?.verification_date
    ? new Date(verificationDetails.verification_date).toLocaleDateString('en-IN', { timeZone: 'UTC' })
    : null

  if (!verificationDetails) {
    return (
      <div className={`text-sm text-gray-600 ${className}`}>
        <div className="flex items-center gap-2">
          <AlertCircle size={16} className="text-gray-400" />
          <span>No verification details available</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`text-sm space-y-2 ${className}`}>
      {userType === 'individual' && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Aadhaar:</span>
            <VerificationBadge 
              status={verificationDetails.aadhaar_verified ? 'verified' : 'unverified'} 
              size="sm" 
              showText={false}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">PAN:</span>
            <VerificationBadge 
              status={verificationDetails.pan_verified ? 'verified' : 'unverified'} 
              size="sm" 
              showText={false}
            />
          </div>
        </div>
      )}
      
      {userType === 'company' && verificationDetails.company_name && (
        <div>
          <span className="text-gray-600">Company:</span>
          <span className="ml-2 font-medium">{verificationDetails.company_name}</span>
        </div>
      )}
      
      {userType === 'ngo' && verificationDetails.ngo_name && (
        <div>
          <span className="text-gray-600">Organization:</span>
          <span className="ml-2 font-medium">{verificationDetails.ngo_name}</span>
        </div>
      )}
      
      {formattedVerificationDate && (
        <div className="text-xs text-gray-500">
          Verified on {formattedVerificationDate}
        </div>
      )}
    </div>
  )
}

export type ComplianceBadgeKind =
  | 'twelve_a'
  | 'eighty_g'
  | 'csr1'
  | 'fcra'
  | 'section_8'
  | 'trust'
  | 'society'

const COMPLIANCE_BADGE_META: Record<ComplianceBadgeKind, { label: string; src: string }> = {
  twelve_a: { label: '12A', src: '/photos/12A.png' },
  eighty_g: { label: '80G', src: '/photos/80G.png' },
  csr1: { label: 'CSR-1', src: '/photos/CSR-1.png' },
  fcra: { label: 'FCRA', src: '/photos/FCRA.png' },
  section_8: { label: 'Section 8', src: '/photos/Section8trustsociety.png' },
  trust: { label: 'Trust', src: '/photos/Section8trustsociety.png' },
  society: { label: 'Society', src: '/photos/Section8trustsociety.png' },
}

const COMPLIANCE_ICON_SIZE = {
  xs: 12,
  sm: 16,
  md: 18,
  lg: 22,
  xl: 48,
} as const

const COMPLIANCE_TEXT_CLASS = {
  xs: 'text-[9px]',
  sm: 'text-[10px]',
  md: 'text-[10px]',
  lg: 'text-xs',
  xl: 'text-sm',
} as const

export function ComplianceBadge({
  kind,
  label,
  size = 'sm',
  showText = true,
  className = '',
}: {
  kind: ComplianceBadgeKind
  label?: string
  size?: keyof typeof COMPLIANCE_ICON_SIZE
  showText?: boolean
  className?: string
}) {
  const meta = COMPLIANCE_BADGE_META[kind]
  if (!meta) return null
  const iconSize = COMPLIANCE_ICON_SIZE[size] || COMPLIANCE_ICON_SIZE.sm
  const textClass = COMPLIANCE_TEXT_CLASS[size] || COMPLIANCE_TEXT_CLASS.sm
  const text = label || meta.label

  return (
    <span
      className={`inline-flex items-center ${showText ? 'shrink-0 gap-1.5' : 'shrink-0'} ${className}`}
      title={text}
      aria-label={text}
    >
      <img
        src={meta.src}
        alt=""
        width={iconSize}
        height={iconSize}
        draggable={false}
        onDragStart={(event) => event.preventDefault()}
        className="pointer-events-none shrink-0 select-none"
        style={{
          width: iconSize,
          height: iconSize,
          objectFit: 'contain',
          userSelect: 'none',
          WebkitUserDrag: 'none',
        }}
      />
      {showText ? (
        <span className={`${textClass} font-semibold leading-none text-slate-900`}>{text}</span>
      ) : null}
    </span>
  )
}

export function registrationTypeToBadgeKind(value: unknown): ComplianceBadgeKind | null {
  const key = String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '')
  if (key === 'section8') return 'section_8'
  if (key === 'trust') return 'trust'
  if (key === 'society') return 'society'
  return null
}

export function NgoComplianceBadges({
  tags,
  registrationType,
  size = 'lg',
  className = '',
}: {
  tags?: string[] | null
  registrationType?: string | null
  size?: keyof typeof COMPLIANCE_ICON_SIZE
  className?: string
}) {
  const items: { kind: ComplianceBadgeKind; label: string }[] = []
  const registrationKind = registrationTypeToBadgeKind(registrationType)
  if (registrationKind) {
    items.push({ kind: registrationKind, label: COMPLIANCE_BADGE_META[registrationKind].label })
  } else if (String(registrationType || '').trim()) {
    items.push({ kind: 'section_8', label: String(registrationType).trim() })
  }

  for (const key of ['twelve_a', 'eighty_g', 'csr1', 'fcra'] as const) {
    if (Array.isArray(tags) && tags.includes(key)) {
      items.push({ kind: key, label: COMPLIANCE_BADGE_META[key].label })
    }
  }

  if (items.length === 0) return null

  return (
    <div className={`flex min-w-0 max-w-full flex-wrap items-center gap-x-2.5 gap-y-1.5 ${className}`}>
      {items.map((item) => (
        <ComplianceBadge key={`${item.kind}-${item.label}`} kind={item.kind} label={item.label} size={size} />
      ))}
    </div>
  )
}