"use client"

import { formatDisplayDate } from "@/lib/format-date"
import { ComplianceBadge } from "@/components/verification-badge"
import { DocumentFileViewer } from "@/components/ca-verification-review"
import { ProfileSection } from "./profile-fields"
import type { ComplianceCard, ViewingDocument } from "./types"

interface ComplianceDocumentsSectionProps {
  cards: ComplianceCard[]
  viewingDoc: ViewingDocument | null
  onViewDoc: (doc: ViewingDocument | null) => void
}

export function ComplianceDocumentsSection({ cards, viewingDoc, onViewDoc }: ComplianceDocumentsSectionProps) {
  return (
    <ProfileSection title="Compliance Documents">
      {viewingDoc ? (
        <DocumentFileViewer
          url={viewingDoc.url}
          label={viewingDoc.label}
          onBack={() => onViewDoc(null)}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {cards.map((item) => (
            <div key={item.key} className="rounded-lg border bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{item.label}</p>
                  {item.number ? (
                    <p className="mt-1 text-sm text-slate-600">Ref: {item.number}</p>
                  ) : null}
                  {item.valid_until ? (
                    <p className="mt-2 text-sm text-slate-700">
                      Valid until {formatDisplayDate(item.valid_until)}
                    </p>
                  ) : null}
                  {item.status === "expired" ? (
                    <p className="mt-1 text-xs font-medium text-red-600">Expired</p>
                  ) : item.status === "due_soon" ? (
                    <p className="mt-1 text-xs font-medium text-amber-700">Expiring soon</p>
                  ) : null}
                  {item.url ? (
                    <button
                      type="button"
                      onClick={() => onViewDoc({ url: item.url!, label: item.label })}
                      className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-orange-600 hover:text-orange-700"
                    >
                      View
                    </button>
                  ) : null}
                </div>
                {item.verified && item.kind ? (
                  <ComplianceBadge
                    kind={item.kind}
                    size="xl"
                    showText={false}
                    className="opacity-60"
                  />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </ProfileSection>
  )
}
