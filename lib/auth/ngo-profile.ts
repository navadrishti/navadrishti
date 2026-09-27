import { readNgoNumberField, readNgoTextField } from './normalize';

export type NgoPastProject = {
  title: string;
  description: string;
  source?: 'registration' | 'platform';
  category?: string;
  location?: string;
  timeline?: string;
  expected_beneficiaries?: number | null;
  valid_until?: string | null;
  status?: string;
};

export const EMPTY_PAST_PROJECT: NgoPastProject = {
  title: '',
  description: '',
};

export function normalizePastProjects(value: unknown): NgoPastProject[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }

        const record = item as Record<string, unknown>;
        const title = readNgoTextField(record.title || record.name || record.number);
        const description = readNgoTextField(record.description || record.summary || record.details);

        if (!title) {
          return null;
        }

        const expectedBeneficiaries = Number(record.expected_beneficiaries);
        return {
          title,
          description,
          source: (record.source === 'platform' ? 'platform' : 'registration') as
            | 'registration'
            | 'platform',
          category: readNgoTextField(record.category),
          location: readNgoTextField(record.location || record.exact_address),
          timeline: readNgoTextField(record.timeline),
          expected_beneficiaries: Number.isFinite(expectedBeneficiaries) && expectedBeneficiaries > 0
            ? expectedBeneficiaries
            : null,
          valid_until: readNgoTextField(record.valid_until) || null,
          status: readNgoTextField(record.status),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item != null);
  }

  if (typeof value === 'string' && value.trim()) {
    return [{ title: 'Past projects', description: value.trim(), source: 'registration' }];
  }

  return [];
}

export function formatPastProjectsForSearch(value: unknown): string {
  return normalizePastProjects(value)
    .map((project) => `${project.title} ${project.description}`.trim())
    .join(' ');
}

export function normalizePlatformProjects(
  rows: Array<Record<string, unknown>> | null | undefined
): NgoPastProject[] {
  return (rows || [])
    .map((row) => {
      const title = readNgoTextField(row.title);
      if (!title) return null;

      const expectedBeneficiaries = Number(row.expected_beneficiaries);
      return {
        title,
        description: readNgoTextField(row.description),
        source: 'platform' as const,
        category: readNgoTextField(row.category),
        location: readNgoTextField(row.location || row.exact_address),
        timeline: readNgoTextField(row.timeline),
        expected_beneficiaries: Number.isFinite(expectedBeneficiaries) && expectedBeneficiaries > 0
          ? expectedBeneficiaries
          : null,
        valid_until: readNgoTextField(row.valid_until) || null,
        status: readNgoTextField(row.status),
      };
    })
    .filter((project): project is NonNullable<typeof project> => project != null);
}

export function mergeNgoPastProjects(
  registrationProjects: unknown,
  platformProjects: Array<Record<string, unknown>> | null | undefined
): NgoPastProject[] {
  const merged = [...normalizePastProjects(registrationProjects)];
  const seen = new Set(merged.map((project) => project.title.toLowerCase()));

  for (const project of normalizePlatformProjects(platformProjects)) {
    const key = project.title.toLowerCase();
    const existingIndex = merged.findIndex((item) => item.title.toLowerCase() === key);
    if (existingIndex >= 0) {
      merged[existingIndex] = {
        ...merged[existingIndex],
        ...project,
        description: project.description || merged[existingIndex].description,
      };
      continue;
    }
    merged.push(project);
    seen.add(key);
  }

  return merged;
}

export type NgoGeographicCoverageArea = {
  region: string;
  state: string;
  district: string;
  area_type: 'urban' | 'rural' | 'both' | '';
};

export const EMPTY_GEOGRAPHIC_COVERAGE_AREA: NgoGeographicCoverageArea = {
  region: '',
  state: '',
  district: '',
  area_type: '',
};

const GEO_AREA_TYPE_LABELS: Record<Exclude<NgoGeographicCoverageArea['area_type'], ''>, string> = {
  urban: 'Urban',
  rural: 'Rural',
  both: 'Urban & rural',
};

export function normalizeGeographicCoverage(value: unknown): NgoGeographicCoverageArea[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }

        const record = item as Record<string, unknown>;
        const state = readNgoTextField(record.state);
        const region = readNgoTextField(record.region);
        const district = readNgoTextField(record.district);
        const rawAreaType = readNgoTextField(record.area_type).toLowerCase();
        const area_type =
          rawAreaType === 'urban' || rawAreaType === 'rural' || rawAreaType === 'both'
            ? rawAreaType
            : '';

        if (!state && !region && !district) {
          return null;
        }

        return { region, state, district, area_type };
      })
      .filter((item): item is NgoGeographicCoverageArea => Boolean(item));
  }

  if (typeof value === 'string' && value.trim()) {
    return [{ region: '', state: value.trim(), district: '', area_type: '' }];
  }

  return [];
}

export function formatGeographicCoverageArea(area: NgoGeographicCoverageArea): string {
  const parts = [area.region, area.state, area.district].filter(Boolean);
  let summary = parts.join(' · ');

  if (area.area_type && area.area_type in GEO_AREA_TYPE_LABELS) {
    summary = summary
      ? `${summary} (${GEO_AREA_TYPE_LABELS[area.area_type as keyof typeof GEO_AREA_TYPE_LABELS]})`
      : GEO_AREA_TYPE_LABELS[area.area_type as keyof typeof GEO_AREA_TYPE_LABELS];
  }

  return summary;
}

export function formatGeographicCoverageForSearch(value: unknown): string {
  return normalizeGeographicCoverage(value)
    .map((area) => formatGeographicCoverageArea(area))
    .join(' ');
}

export function summarizeGeographicCoverage(value: unknown, limit = 2): string | null {
  const areas = normalizeGeographicCoverage(value);
  if (areas.length === 0) {
    return null;
  }

  const preview = areas
    .slice(0, limit)
    .map((area) => formatGeographicCoverageArea(area))
    .join('; ');

  if (areas.length > limit) {
    return `${preview}; +${areas.length - limit} more`;
  }

  return preview;
}

export type NgoDeliveryModel = 'direct' | 'partner_led' | 'hybrid' | '';

export type NgoExecutionCapacity = {
  concurrent_projects: string;
  annual_beneficiaries: string;
  delivery_model: NgoDeliveryModel;
  notes: string;
};

export const EMPTY_EXECUTION_CAPACITY: NgoExecutionCapacity = {
  concurrent_projects: '',
  annual_beneficiaries: '',
  delivery_model: '',
  notes: '',
};

const DELIVERY_MODEL_LABELS: Record<Exclude<NgoDeliveryModel, ''>, string> = {
  direct: 'Direct delivery',
  partner_led: 'Partner-led',
  hybrid: 'Hybrid (direct + partners)',
};

function parseNgoDeliveryModel(value: unknown): NgoDeliveryModel {
  const text = readNgoTextField(value).toLowerCase();
  if (text === 'direct' || text === 'partner_led' || text === 'hybrid') {
    return text;
  }
  return '';
}

function hasAnyExecutionCapacityField(capacity: NgoExecutionCapacity): boolean {
  return Boolean(
    capacity.concurrent_projects ||
      capacity.annual_beneficiaries ||
      capacity.delivery_model ||
      capacity.notes
  );
}

export function normalizeExecutionCapacity(value: unknown): NgoExecutionCapacity | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const normalized: NgoExecutionCapacity = {
      concurrent_projects: readNgoNumberField(record.concurrent_projects),
      annual_beneficiaries: readNgoNumberField(record.annual_beneficiaries),
      delivery_model: parseNgoDeliveryModel(record.delivery_model),
      notes: readNgoTextField(record.notes),
    };

    return hasAnyExecutionCapacityField(normalized) ? normalized : null;
  }

  if (typeof value === 'string' && value.trim()) {
    return { ...EMPTY_EXECUTION_CAPACITY, notes: value.trim() };
  }

  return null;
}

export function summarizeExecutionCapacity(value: unknown): string | null {
  const capacity = normalizeExecutionCapacity(value);
  if (!capacity) {
    return null;
  }

  const parts: string[] = [];

  if (capacity.concurrent_projects) {
    const count = Number(capacity.concurrent_projects);
    parts.push(`${count} concurrent ${count === 1 ? 'project' : 'projects'}`);
  }

  if (capacity.annual_beneficiaries) {
    parts.push(`${Number(capacity.annual_beneficiaries).toLocaleString('en-IN')} beneficiaries/year`);
  }

  if (capacity.delivery_model && capacity.delivery_model in DELIVERY_MODEL_LABELS) {
    parts.push(DELIVERY_MODEL_LABELS[capacity.delivery_model as Exclude<NgoDeliveryModel, ''>]);
  }

  if (capacity.notes) {
    parts.push(capacity.notes);
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}
