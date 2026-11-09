# Project overview

Navadrishti (GRAM) is a collaboration platform for individuals, NGOs and
companies. The application brings together a needs-and-capabilities
marketplace, corporate social responsibility (CSR) campaign planning and
execution, field evidence workflows, and account verification.

## Roles and product surfaces

| Role | Product surface and scope |
| --- | --- |
| Individual | Main application; personal profile, verification and marketplace participation |
| NGO | Main application; needs and offers, CSR project participation, and Field Officer management |
| Company | Main application; CSR campaigns, company team and project oversight |
| Company Employee | Restricted, read-only view of assigned CSR projects |
| Evidence Verifier | Reviews evidence for assigned CSR projects; company-associated |
| Platform CA | Reviews individual, NGO and company KYC submissions; platform-wide |
| Administrator | Platform operations and moderation console |
| Field Officer | Separate GRAM field PWA for assigned field work; not a portal implemented in this Next.js app |

Evidence Verifier is the current product name. Some implementation identifiers
retain the earlier `company_ca_*` naming. Platform CA is a distinct KYC role.
See [technical architecture](./TECHNICAL_ARCHITECTURE.md) for session and
authorization boundaries.

## Product scope

- **Marketplace:** NGO service requests and company/individual capability
  offers, applications, assignments, fulfillment and attendance.
- **CSR:** Manual campaign creation and Catalyst-assisted campaign workflows;
  Lead NGO participation; execution projects, milestones, expenses, materials,
  evidence and reviews.
- **Verification:** Individual, NGO and company KYC submission, document
  handling and Platform CA review.
- **Company and NGO operations:** Employee, Evidence Verifier and Field Officer
  identities and project assignments; support, announcements and notifications.
- **Discovery and assistance:** Atlas and Catalyst agent surfaces, embedded
  Pulse matching, search, and generated documents where implemented.
- **Payments and delivery:** Razorpay payment flows and shipment-related
  Delhivery integration code.

## Implementation and operational status

The repository contains application code for these workflows, but code presence
does not establish that a provider, deployment, database object or end-to-end
journey is currently operational. Razorpay, Gemini, Cloudinary, MSG91,
Delhivery, SMTP and the separately hosted field PWA need their respective
configuration and verification. The OCR service is a separate component and is
not required to start the main application.

Company Employee implementation and cross-instance behavior are **not approved
for rollout** by the retained
[readiness assessment](../database/audit/company-employee-rollout-readiness.md).
No live database or external provider was checked for this documentation pass.

## Partial, external and planned work

Several user journeys depend on external configuration or components outside
this repository; document and verify each service independently before
launching it. No authoritative product roadmap is represented by the source
tree. SQL under `database/proposed/` is proposal material, not a product
commitment or an approved database change.

## Primary guides

- [Technical architecture](./TECHNICAL_ARCHITECTURE.md)
- [Database documentation](./DATABASE_DOCUMENTATION.md)
- [API and integrations](./API_AND_INTEGRATIONS.md)
- [Development and deployment](./DEVELOPMENT_AND_DEPLOYMENT.md)
- [Documentation index and retained records](./README.md)
