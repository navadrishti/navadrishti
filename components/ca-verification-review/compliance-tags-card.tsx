import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { certificateExpiryCopy, type CaComplianceTagOption } from '@/lib/auth'
import { ComplianceBadge } from '@/components/verification-badge'
import { complianceTagBadgeKind } from './helpers'

type ComplianceTagsProps = {
  complianceTags?: string[]
  onComplianceTagsChange?: (tags: string[]) => void
  readOnly: boolean
  ocrLoading: boolean
}

function ComplianceTagRow({
  option,
  complianceTags,
  onComplianceTagsChange,
  readOnly,
  ocrLoading,
}: ComplianceTagsProps & { option: CaComplianceTagOption }) {
  const selected = Array.isArray(complianceTags) && complianceTags.includes(option.key)
  const expiryCopy = certificateExpiryCopy(option.expiry)
  const badgeKind = complianceTagBadgeKind(option.key)

  return (
    <label className={`flex items-start gap-3 ${option.eligible || readOnly ? '' : 'opacity-60'}`}>
      <Checkbox
        className="mt-0.5"
        checked={readOnly ? selected : option.eligible && selected}
        disabled={readOnly || !option.eligible || ocrLoading}
        onCheckedChange={(checked) => {
          if (readOnly || !option.eligible || !onComplianceTagsChange) return
          const current = Array.isArray(complianceTags) ? complianceTags : []
          onComplianceTagsChange(
            checked === true
              ? Array.from(new Set([...current, option.key]))
              : current.filter((key) => key !== option.key)
          )
        }}
      />
      <span>
        <span className="inline-flex min-w-0 items-center gap-2">
          {badgeKind ? (
            <ComplianceBadge kind={badgeKind} size="lg" showText={false} />
          ) : null}
          <span className="text-sm font-medium text-slate-900">{option.label}</span>
        </span>
        {expiryCopy.expiry_label ? (
          <>
            <span className="mt-0.5 block text-xs text-slate-500">
              Expiry date: {expiryCopy.expiry_label}
            </span>
            <span className="block text-xs text-slate-500">
              Days remaining: {expiryCopy.days_line}
            </span>
          </>
        ) : (
          <span className="mt-0.5 block text-xs text-slate-500">{option.reason}</span>
        )}
      </span>
    </label>
  )
}

export function ComplianceTagsCard({
  options,
  reverificationPending,
  ...tagProps
}: ComplianceTagsProps & {
  options?: CaComplianceTagOption[]
  reverificationPending?: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Allot compliance tags</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-600">
          {tagProps.readOnly
            ? 'Tags allotted at verification. These cannot be changed.'
            : reverificationPending
              ? 'Tick tags for updated certificates that are present and not expired. CSR funding requires CSR-1.'
              : 'Tick tags for certificates that are present and not expired. CSR funding requires CSR-1.'}
        </p>
        {(Array.isArray(options) ? options : []).map((option) => (
          <ComplianceTagRow key={option.key} option={option} {...tagProps} />
        ))}
      </CardContent>
    </Card>
  )
}
