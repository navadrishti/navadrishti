import 'server-only'
import type { Tables, TablesInsert, TablesUpdate } from '@/lib/database.types'
import { supabase } from './client'

export function getApplicationApplicantUserId(row: Record<string, unknown> | null | undefined): number {
  if (!row) return 0
  return Number(row.applicant_user_id ?? 0) || 0
}

/** Accepts the legacy volunteer_id key and rewrites it to applicant_user_id. */
export function normalizeApplicationApplicantFields<T extends Record<string, unknown>>(payload: T): T {
  const next = { ...payload } as Record<string, unknown>
  const applicantId = Number(next.applicant_user_id ?? next.volunteer_id ?? 0)
  if (applicantId > 0) next.applicant_user_id = applicantId
  delete next.volunteer_id
  return next as T
}

const APPLICATION_FULFILLMENT_KEYS = [
  'impact_statement',
  'estimated_impact_value',
  'fulfillment_amount',
  'fulfillment_quantity',
  'assigned_amount',
  'assigned_quantity',
  'fulfilled_amount',
  'fulfilled_quantity',
  'individual_receipt_url',
  'ngo_receipt_url',
  'individual_done_at',
  'ngo_confirmed_at',
  'completion_note',
  'completed_at',
] as const

/** Fulfillment columns live on service_request_fulfillments, not on the application row. */
export function splitApplicationUpdatePayload(payload: Record<string, unknown>): {
  application: TablesUpdate<'service_request_applications'>
  fulfillment: Record<string, unknown>
} {
  const application: Record<string, unknown> = { ...payload }
  const fulfillment: Record<string, unknown> = {}
  for (const key of APPLICATION_FULFILLMENT_KEYS) {
    if (key in application) {
      fulfillment[key] = application[key]
      delete application[key]
    }
  }
  delete application.volunteer_id
  return { application: application as TablesUpdate<'service_request_applications'>, fulfillment }
}

type ApplicationFulfillmentFields = Omit<
  Tables<'service_request_fulfillments'>,
  'id' | 'application_id' | 'service_request_id' | 'created_at' | 'updated_at'
>

export type ApiApplication = Tables<'service_request_applications'> &
  Partial<ApplicationFulfillmentFields> & {
    message: string
    [key: string]: unknown
  }

/** Flatten the joined fulfillment row onto the application for API responses. */
export function shapeApplicationForApi(row: Record<string, unknown>): ApiApplication
export function shapeApplicationForApi(
  row: Record<string, unknown> | null | undefined
): ApiApplication | null | undefined
export function shapeApplicationForApi(
  row: Record<string, unknown> | null | undefined
): ApiApplication | null | undefined {
  if (!row) return row
  const nested = row.fulfillment ?? row.service_request_fulfillments
  const fulfillment = Array.isArray(nested) ? nested[0] : nested
  const rest = { ...row } as Record<string, unknown>
  delete rest.fulfillment
  delete rest.service_request_fulfillments
  const applicantId = Number(rest.applicant_user_id ?? 0) || 0
  const flatFulfillment =
    fulfillment && typeof fulfillment === 'object' && !Array.isArray(fulfillment)
      ? (fulfillment as Record<string, unknown>)
      : {}
  return {
    ...rest,
    ...flatFulfillment,
    applicant_user_id: applicantId || rest.applicant_user_id,
    // UI alias — DB column is application_message
    message: rest.application_message ?? rest.message ?? '',
    application_message: rest.application_message ?? rest.message ?? '',
  } as ApiApplication
}

const APPLICATION_WITH_FULFILLMENT = `
  *,
  fulfillment:service_request_fulfillments!application_id(*)
`

export const serviceRequestApplications = {
  async create(
    applicationData: TablesInsert<'service_request_applications'> &
      Partial<ApplicationFulfillmentFields> & {
        message?: string | null
        volunteer_type?: string | null
        created_at?: string | null
      }
  ) {
    // Applications use applied_at (there is no created_at column).
    const {
      message,
      volunteer_type,
      created_at,
      fulfillment_amount,
      fulfillment_quantity,
      impact_statement,
      estimated_impact_value,
      assigned_amount,
      assigned_quantity,
      fulfilled_amount,
      fulfilled_quantity,
      individual_receipt_url,
      ngo_receipt_url,
      individual_done_at,
      ngo_confirmed_at,
      completion_note,
      completed_at,
      ...applicationFields
    } = normalizeApplicationApplicantFields(applicationData)

    const payload: TablesInsert<'service_request_applications'> = {
      ...applicationFields,
      application_message: applicationFields.application_message ?? message ?? '',
      responder_type: applicationFields.responder_type ?? volunteer_type ?? null,
      applied_at: applicationFields.applied_at ?? created_at ?? new Date().toISOString(),
      updated_at: applicationFields.updated_at ?? new Date().toISOString(),
    }

    const fulfillmentFields = {
      fulfillment_amount: fulfillment_amount ?? null,
      fulfillment_quantity: fulfillment_quantity ?? null,
      impact_statement: impact_statement ?? null,
      estimated_impact_value: estimated_impact_value ?? null,
      assigned_amount: assigned_amount ?? null,
      assigned_quantity: assigned_quantity ?? null,
      fulfilled_amount: fulfilled_amount ?? 0,
      fulfilled_quantity: fulfilled_quantity ?? 0,
      individual_receipt_url: individual_receipt_url ?? null,
      ngo_receipt_url: ngo_receipt_url ?? null,
      individual_done_at: individual_done_at ?? null,
      ngo_confirmed_at: ngo_confirmed_at ?? null,
      completion_note: completion_note ?? null,
      completed_at: completed_at ?? null,
    }

    const { data, error } = await supabase
      .from('service_request_applications')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    const { error: fulfillmentError } = await supabase.from('service_request_fulfillments').upsert(
      {
        application_id: data.id,
        service_request_id: data.service_request_id,
        ...fulfillmentFields,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'application_id' }
    );
    if (fulfillmentError) {
      console.error('Failed to create fulfillment row:', fulfillmentError);
    }

    return shapeApplicationForApi(data);
  },

  async findExisting(serviceRequestId: number, applicantUserId: number) {
    return this.getUserApplication(serviceRequestId, applicantUserId);
  },

  async getByVolunteerId(applicantUserId: number) {
    const { data, error } = await supabase
      .from('service_request_applications')
      .select(APPLICATION_WITH_FULFILLMENT)
      .eq('applicant_user_id', applicantUserId)
      .order('applied_at', { ascending: false });

    if (error) throw error;
    return (data || []).map((row) => shapeApplicationForApi(row));
  },

  async getByRequestId(serviceRequestId: number) {
    const { data, error } = await supabase
      .from('service_request_applications')
      .select(`
        *,
        volunteer:users!applicant_user_id(id, name, email, user_type, location, verification_status, profile_image),
        fulfillment:service_request_fulfillments!application_id(*)
      `)
      .eq('service_request_id', serviceRequestId)
      .order('applied_at', { ascending: false });

    if (error) throw error;
    return (data || []).map((row) => shapeApplicationForApi(row));
  },

  async getUserApplication(serviceRequestId: number, applicantUserId: number) {
    const { data, error } = await supabase
      .from('service_request_applications')
      .select(APPLICATION_WITH_FULFILLMENT)
      .eq('service_request_id', serviceRequestId)
      .eq('applicant_user_id', applicantUserId)
      .order('applied_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return shapeApplicationForApi(data);
  },

  async update(id: number, updateData: Record<string, unknown>) {
    const { application, fulfillment } = splitApplicationUpdatePayload({ ...updateData })
    application.updated_at = application.updated_at || new Date().toISOString()

    const { data, error } = await supabase
      .from('service_request_applications')
      .update(application)
      .eq('id', id)
      .select(APPLICATION_WITH_FULFILLMENT)
      .single();

    if (error) throw error;

    if (Object.keys(fulfillment).length > 0) {
      const { error: fulErr } = await supabase.from('service_request_fulfillments').upsert(
        {
          application_id: id,
          service_request_id: data.service_request_id,
          ...fulfillment,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'application_id' }
      )
      if (fulErr) throw fulErr

      const { data: refreshed } = await supabase
        .from('service_request_applications')
        .select(APPLICATION_WITH_FULFILLMENT)
        .eq('id', id)
        .maybeSingle()
      return shapeApplicationForApi(refreshed || data)
    }

    return shapeApplicationForApi(data);
  },

  async updateStatus(id: number, status: string) {
    return this.update(id, { status });
  }
}
