# Company CA Panel - Mock Data & Flow Examples

## 🎯 Current Clean Dashboard (No Audit History)

### Dashboard Shows Only:
- **Active Projects** count
- **Pending Reviews** count + "Go to Review" button (if any pending)

---

## 📍 Mock Data Flow Examples

### Example 1: Dashboard with Pending Reviews

**API Response from `/api/csr-projects`:**
```json
{
  "success": true,
  "data": [
    {
      "id": "proj-001",
      "title": "Build School Library",
      "ngo": { "name": "Save Children India" },
      "project_status": "active",
      "milestones_count": 5,
      "completed_milestones_count": 2,
      "progress_percentage": 40,
      "next_milestone": { "title": "Foundation Completed" },
      "deadline_at": "2026-05-15T00:00:00Z",
      "confirmed_funds": 250000
    }
  ]
}
```

**API Response from `/api/csr-projects/proj-001/evidence`:**
```json
{
  "success": true,
  "data": {
    "project": {
      "title": "Build School Library"
    },
    "timeline": [
      {
        "milestone": {
          "id": "milestone-001",
          "title": "Foundation Completed",
          "status": "submitted",
          "milestone_order": 1,
          "due_date": "2026-04-15T00:00:00Z",
          "amount": 50000
        },
        "evidence": [
          {
            "id": "evidence-001",
            "description": "Foundation work photos",
            "captured_at": "2026-04-10T10:30:00Z",
            "gps_lat": 28.7041,
            "gps_long": 77.1025,
            "media": [
              {
                "id": "media-001",
                "file_name": "foundation_photo.jpg",
                "media_url": "https://cdn.example.com/foundation_photo.jpg"
              }
            ],
            "documents": [
              {
                "id": "doc-001",
                "file_name": "inspection_report.pdf",
                "document_url": "https://cdn.example.com/inspection_report.pdf"
              }
            ]
          }
        ],
        "payments": [
          {
            "payment_status": "pending",
            "payment_reference": "PAY-REF-001",
            "amount": 50000
          }
        ]
      }
    ]
  }
}
```

**Dashboard UI Shows:**
```
┌─────────────────────────────────────────────────┐
│  Company CA Panel                               │
│  Company ID: ca-user-12345                      │
└─────────────────────────────────────────────────┘

┌──────────────┐  ┌──────────────┐
│   Active     │  │  Pending     │
│  Projects    │  │   Reviews    │
│      1       │  │      1       │
│              │  │              │
│              │  │ ┌──────────────┐ │
│              │  │ │ Go to Review │ │ ← Button
│              │  │ └──────────────┘ │
└──────────────┘  └──────────────┘

Pending Payment Confirmation Queue
├─ Build School Library (Save Children India)
│  ├─ Milestone: Foundation Completed
│  ├─ Reference: PAY-REF-001
│  ├─ Amount: Rs 50,000
│  └─ [Confirm Payment] button

Project Queue
├─ Build School Library
│  ├─ NGO: Save Children India
│  ├─ Status: active
│  ├─ Progress: 40% (2/5)
│  ├─ Next: Foundation Completed
│  ├─ Deadline: May 15, 2026
│  └─ Confirmed Funds: Rs 250,000
```

---

### Example 2: Click "Go to Review" → `/companies/ca/review/milestone-001`

**API Response from `/api/milestones/milestone-001`:**
```json
{
  "success": true,
  "data": {
    "id": "milestone-001",
    "title": "Foundation Completed",
    "description": "Complete foundation work for school library building",
    "status": "submitted",
    "due_date": "2026-04-15T00:00:00Z",
    "amount": 50000,
    "evidence": [
      {
        "id": "evidence-001",
        "description": "Foundation work photos",
        "captured_at": "2026-04-10T10:30:00Z",
        "gps_lat": 28.7041,
        "gps_long": 77.1025,
        "media": [
          {
            "id": "media-001",
            "file_name": "foundation_photo.jpg",
            "media_url": "https://cdn.example.com/foundation_photo.jpg"
          }
        ],
        "documents": [
          {
            "id": "doc-001",
            "file_name": "inspection_report.pdf",
            "document_url": "https://cdn.example.com/inspection_report.pdf"
          }
        ]
      }
    ]
  }
}
```

**Review Page Shows:**
```
┌─────────────────────────────────────────────────┐
│  Review Milestone                               │
│  Company ID: ca-user-12345                      │
└─────────────────────────────────────────────────┘

[← Back to Dashboard]

Milestone Details
├─ ID: milestone-001
├─ Status: submitted
├─ Title: Foundation Completed
├─ Due Date: Apr 15, 2026
└─ Amount: Rs 50,000

Submitted Evidence
├─ Evidence #1
│  ├─ Description: Foundation work photos
│  ├─ Captured: Apr 10, 2026
│  ├─ GPS: 28.7041, 77.1025
│  ├─ 📷 Media: foundation_photo.jpg (clickable link)
│  └─ 📄 Documents: inspection_report.pdf (clickable link)

Decision
├─ Comments: [textarea for decision notes]
├─ ✓ Approve Evidence   | ✗ Reject Evidence
```

---

### Example 3: Click "History" in Navbar → `/companies/ca/history`

**API Response from `/api/csr-projects`:**
```json
{
  "success": true,
  "data": [
    {
      "id": "proj-001",
      "title": "Build School Library"
    },
    {
      "id": "proj-002",
      "title": "Clean Water Project"
    }
  ]
}
```

**API Response from `/api/csr-projects/proj-001/audit`:**
```json
{
  "success": true,
  "data": [
    {
      "id": "audit-001",
      "event_type": "milestone_submitted",
      "entity_type": "milestone",
      "entity_id": "milestone-001",
      "description": "Foundation milestone submitted for review",
      "created_at": "2026-04-10T10:30:00Z",
      "details": {
        "project_id": "proj-001",
        "amount": 50000
      }
    },
    {
      "id": "audit-002",
      "event_type": "evidence_approved",
      "entity_type": "milestone",
      "entity_id": "milestone-001",
      "description": "Foundation milestone evidence approved",
      "created_at": "2026-04-12T14:20:00Z",
      "details": {
        "approved_by": "ca-user-12345",
        "comments": "Excellent work, foundation looks solid"
      }
    }
  ]
}
```

**History Page Shows:**
```
┌─────────────────────────────────────────────────┐
│  Audit History                                   │
│  Company ID: ca-user-12345                      │
└─────────────────────────────────────────────────┘

[← Back to Dashboard]

Audit History
├─ evidence_approved · milestone · milestone-001
│  ├─ Foundation milestone evidence approved
│  ├─ Apr 12, 2026, 2:20 PM
│  └─ Details: {"approved_by": "ca-user-12345", "comments": "Excellent work..."}
│
├─ milestone_submitted · milestone · milestone-001
│  ├─ Foundation milestone submitted for review
│  ├─ Apr 10, 2026, 10:30 AM
│  └─ Details: {"project_id": "proj-001", "amount": 50000}
```

---

## 🔄 Complete User Flow

1. **Dashboard** (`/companies/ca`)
   - Shows clean overview with only essential stats
   - "Go to Review" button appears if pending reviews exist
   - No audit history clutter

2. **Review Process** (`/companies/ca/review/[milestoneId]`)
   - Full evidence details with media/documents
   - GPS coordinates, timestamps
   - Approve/Reject with comments
   - Redirects back to dashboard

3. **Audit History** (`/companies/ca/history`)
   - Only accessible via navbar
   - Shows complete audit trail
   - Sorted by date (newest first)
   - Back to dashboard button

---

## ✅ Clean Separation

- **Dashboard**: Quick overview + direct action buttons
- **Review**: Detailed evidence inspection + decisions
- **History**: Complete audit trail (separate page only)

No audit history on dashboard = cleaner, more focused interface! 🎯