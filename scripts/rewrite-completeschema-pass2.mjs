import fs from 'fs'

const path = 'C:/Users/chaks/Desktop/Navadrishti/reference/completeschema.txt'
let s = fs.readFileSync(path, 'utf8')

s = s.replace(/CREATE TABLE public\.service_volunteers \([\s\S]*?\);\n/, '')

s = s.replace(
  /  CONSTRAINT fk_service_clients_service_request FOREIGN KEY \(service_request_id\) REFERENCES public\.service_requests\(id\),\n/,
  ''
)

s = s.replace(/volunteer_assignment_id/g, 'application_id')
s = s.replace(
  /REFERENCES public\.service_volunteers\(id\)/g,
  'REFERENCES public.service_request_applications(id)'
)

s = s.replace(
  /(CREATE TABLE public\.service_request_applications \([\s\S]*?\n)  volunteer_id integer NOT NULL,/,
  '$1  applicant_user_id integer NOT NULL,'
)
s = s.replace(
  /CONSTRAINT service_request_applications_volunteer_id_fkey FOREIGN KEY \(volunteer_id\)/,
  'CONSTRAINT service_request_applications_applicant_user_id_fkey FOREIGN KEY (applicant_user_id)'
)

s = s.replace(
  /(CREATE TABLE public\.service_request_projects \([\s\S]*?\n)  selected_lead_ngo_id integer,/,
  '$1  lead_ngo_user_id integer,'
)

s = s.replace(/CREATE TABLE public\.reference_points/g, 'CREATE TABLE public.csr_reference_points')
s = s.replace(/CONSTRAINT reference_points_/g, 'CONSTRAINT csr_reference_points_')
s = s.replace(/reference_points_pkey/g, 'csr_reference_points_pkey')
s = s.replace(/reference_points_project_id_fkey/g, 'csr_reference_points_project_id_fkey')

if (!s.startsWith('-- TARGET')) {
  s =
    '-- TARGET CONTRACT after 2026_schema_streamline.sql + pass2 (no-data-loss renames).\n' +
    '-- Canonical: service_request_applications.applicant_user_id, projects.lead_ngo_user_id,\n' +
    '-- payments/shipments.application_id, csr_reference_points, field_events, platform_ca_accounts.\n' +
    '-- Deprecated mirrors kept until pass-3: service_requests.volunteer_limit/priority/deadline/estimated_budget.\n' +
    s
}

fs.writeFileSync(path, s)
console.log({
  hasServiceVolunteers: /CREATE TABLE public\.service_volunteers/.test(s),
  hasApplicant: /applicant_user_id/.test(s),
  hasSelectedLeadCol: /selected_lead_ngo_id integer/.test(s),
  hasVolunteerAssignment: /volunteer_assignment/.test(s),
  hasCsrRef: /csr_reference_points/.test(s),
})
