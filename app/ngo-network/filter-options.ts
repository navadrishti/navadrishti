import { CSR_SCHEDULE_VII_CATEGORIES } from "@/lib/categories"

export const SECTOR_OPTIONS = [
  { value: "all", label: "All sectors" },
  ...CSR_SCHEDULE_VII_CATEGORIES.map((sector) => ({ value: sector, label: sector })),
]

export const COMPLIANCE_OPTIONS = [
  { value: "all", label: "Any compliance" },
  { value: "12a", label: "12A" },
  { value: "80g", label: "80G" },
  { value: "csr1", label: "CSR-1" },
  { value: "fcra", label: "FCRA" },
]

export const REGISTRATION_OPTIONS = [
  { value: "all", label: "Any registration type" },
  { value: "Trust", label: "Trust" },
  { value: "Society", label: "Society" },
  { value: "Section 8", label: "Section 8" },
]
