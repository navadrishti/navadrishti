export type AppUserType = 'individual' | 'ngo' | 'company';

const hasOwn = (obj: Record<string, any>, key: string) =>
  Object.prototype.hasOwnProperty.call(obj, key);

const parseNumeric = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const cleaned = text.replace(/[^0-9.\-]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseInteger = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const match = text.match(/\d+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
};

const firstNonEmptyString = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
};

const GLOBAL_DEDICATED_PROFILE_KEYS = ['industry', 'website', 'company_size', 'ngo_size'];

const NGO_DEDICATED_PROFILE_KEYS = [
  'ngo_registration_type',
  'registration_type',
  'ngo_registration_number',
  'registration_number',
  'registration_date',
  'ngo_pan_number',
  'pan_number',
  'twelve_a_number',
  'eighty_g_number',
  'csr1_registration_number',
  'ngo_fcra_applicable',
  'ngo_fcra_number',
  'fcra_number',
  'bank_details',
  'sectors_schedule_vii',
  'past_projects',
  'geographic_coverage',
  'execution_capacity',
  'team_strength'
];

const COMPANY_DEDICATED_PROFILE_KEYS = [
  'company_cin_number',
  'cin_number',
  'company_pan_number',
  'pan_number',
  'net_worth',
  'turnover',
  'net_profit',
  'csr_vision',
  'focus_areas_schedule_vii',
  'implementation_model',
  'governance_mechanism'
];

export const stripDedicatedProfileData = (
  userType: AppUserType,
  profileData: Record<string, any> | null | undefined
): Record<string, any> => {
  const source = profileData && typeof profileData === 'object' ? profileData : {};
  const sanitized: Record<string, any> = { ...source };

  const keysToStrip = new Set<string>(GLOBAL_DEDICATED_PROFILE_KEYS);
  if (userType === 'ngo') {
    NGO_DEDICATED_PROFILE_KEYS.forEach((key) => keysToStrip.add(key));
  }
  if (userType === 'company') {
    COMPANY_DEDICATED_PROFILE_KEYS.forEach((key) => keysToStrip.add(key));
  }

  for (const key of keysToStrip) {
    delete sanitized[key];
  }

  return sanitized;
};

export const mapDedicatedColumnsFromIncomingProfile = (
  userType: AppUserType,
  incomingProfile: Record<string, any>
): Record<string, any> => {
  const profile = incomingProfile && typeof incomingProfile === 'object' ? incomingProfile : {};
  const updates: Record<string, any> = {};

  if (hasOwn(profile, 'industry')) updates.industry = typeof profile.industry === 'string' ? profile.industry : null;
  if (hasOwn(profile, 'website')) updates.website = typeof profile.website === 'string' ? profile.website : null;
  if (hasOwn(profile, 'company_size')) updates.company_size = typeof profile.company_size === 'string' ? profile.company_size : null;
  if (hasOwn(profile, 'ngo_size')) updates.ngo_size = typeof profile.ngo_size === 'string' ? profile.ngo_size : null;

  if (userType === 'ngo') {
    if (hasOwn(profile, 'ngo_registration_type') || hasOwn(profile, 'registration_type')) {
      updates.ngo_registration_type = firstNonEmptyString(profile.ngo_registration_type, profile.registration_type);
    }
    if (hasOwn(profile, 'ngo_registration_number') || hasOwn(profile, 'registration_number')) {
      updates.ngo_registration_number = firstNonEmptyString(profile.ngo_registration_number, profile.registration_number);
    }
    if (hasOwn(profile, 'registration_date')) {
      const dateValue = firstNonEmptyString(profile.registration_date);
      updates.ngo_registration_date = dateValue && /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? dateValue : null;
    }
    if (hasOwn(profile, 'ngo_pan_number') || hasOwn(profile, 'pan_number')) {
      updates.ngo_pan_number = firstNonEmptyString(profile.ngo_pan_number, profile.pan_number);
    }
    if (hasOwn(profile, 'twelve_a_number')) updates.ngo_12a_number = firstNonEmptyString(profile.twelve_a_number);
    if (hasOwn(profile, 'eighty_g_number')) updates.ngo_80g_number = firstNonEmptyString(profile.eighty_g_number);
    if (hasOwn(profile, 'csr1_registration_number')) updates.ngo_csr1_registration_number = firstNonEmptyString(profile.csr1_registration_number);
    if (hasOwn(profile, 'ngo_fcra_applicable')) updates.ngo_fcra_applicable = Boolean(profile.ngo_fcra_applicable);
    if (hasOwn(profile, 'ngo_fcra_number') || hasOwn(profile, 'fcra_number')) {
      updates.ngo_fcra_number = firstNonEmptyString(profile.ngo_fcra_number, profile.fcra_number);
    }
    if (hasOwn(profile, 'bank_details')) {
      updates.ngo_bank_details = typeof profile.bank_details === 'string' && profile.bank_details.trim().length > 0
        ? { summary: profile.bank_details }
        : (typeof profile.bank_details === 'object' && profile.bank_details !== null ? profile.bank_details : {});
    }
    if (hasOwn(profile, 'sectors_schedule_vii')) {
      updates.ngo_sectors_schedule_vii = typeof profile.sectors_schedule_vii === 'string' && profile.sectors_schedule_vii.trim().length > 0
        ? [profile.sectors_schedule_vii]
        : (Array.isArray(profile.sectors_schedule_vii) ? profile.sectors_schedule_vii : []);
    }
    if (hasOwn(profile, 'past_projects')) {
      updates.ngo_past_projects = typeof profile.past_projects === 'string' && profile.past_projects.trim().length > 0
        ? [profile.past_projects]
        : (Array.isArray(profile.past_projects) ? profile.past_projects : []);
    }
    if (hasOwn(profile, 'geographic_coverage')) {
      updates.ngo_geographic_coverage = typeof profile.geographic_coverage === 'string' && profile.geographic_coverage.trim().length > 0
        ? [profile.geographic_coverage]
        : (Array.isArray(profile.geographic_coverage) ? profile.geographic_coverage : []);
    }
    if (hasOwn(profile, 'execution_capacity')) updates.ngo_execution_capacity = firstNonEmptyString(profile.execution_capacity);
    if (hasOwn(profile, 'team_strength')) updates.ngo_team_strength = parseInteger(profile.team_strength);
  }

  if (userType === 'company') {
    if (hasOwn(profile, 'company_cin_number') || hasOwn(profile, 'cin_number')) {
      updates.company_cin_number = firstNonEmptyString(profile.company_cin_number, profile.cin_number);
    }
    if (hasOwn(profile, 'company_pan_number') || hasOwn(profile, 'pan_number')) {
      updates.company_pan_number = firstNonEmptyString(profile.company_pan_number, profile.pan_number);
    }
    if (hasOwn(profile, 'net_worth')) updates.company_net_worth = parseNumeric(profile.net_worth);
    if (hasOwn(profile, 'turnover')) updates.company_turnover = parseNumeric(profile.turnover);
    if (hasOwn(profile, 'net_profit')) updates.company_net_profit = parseNumeric(profile.net_profit);
    if (hasOwn(profile, 'csr_vision')) updates.company_csr_vision = firstNonEmptyString(profile.csr_vision);
    if (hasOwn(profile, 'focus_areas_schedule_vii')) {
      updates.company_focus_areas_schedule_vii = typeof profile.focus_areas_schedule_vii === 'string' && profile.focus_areas_schedule_vii.trim().length > 0
        ? [profile.focus_areas_schedule_vii]
        : (Array.isArray(profile.focus_areas_schedule_vii) ? profile.focus_areas_schedule_vii : []);
    }
    if (hasOwn(profile, 'implementation_model')) updates.company_implementation_model = firstNonEmptyString(profile.implementation_model);
    if (hasOwn(profile, 'governance_mechanism')) updates.company_governance_mechanism = firstNonEmptyString(profile.governance_mechanism);
  }

  return updates;
};