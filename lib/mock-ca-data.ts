// Mock Data for Company CA Panel Testing
// This file contains sample API responses to test the UI flow

export const mockCompanyCAContext = {
  company_user_id: 'ca-user-12345',
  company: {
    name: 'TechCorp India Pvt Ltd'
  },
  user: {
    email: 'ca@techcorp.com',
    name: 'Rajesh Kumar'
  }
};

export const mockProjectsResponse = {
  success: true,
  data: [
    {
      id: 'proj-001',
      title: 'Build School Library',
      ngo: { name: 'Save Children India' },
      project_status: 'active',
      milestones_count: 5,
      completed_milestones_count: 2,
      progress_percentage: 40,
      next_milestone: { title: 'Foundation Completed' },
      deadline_at: '2026-05-15T00:00:00Z',
      confirmed_funds: 250000
    },
    {
      id: 'proj-002',
      title: 'Clean Water Project',
      ngo: { name: 'Water for All NGO' },
      project_status: 'active',
      milestones_count: 3,
      completed_milestones_count: 1,
      progress_percentage: 33,
      next_milestone: { title: 'Well Construction' },
      deadline_at: '2026-06-20T00:00:00Z',
      confirmed_funds: 150000
    }
  ]
};

export const mockProjectEvidenceResponse = {
  success: true,
  data: {
    project: {
      title: 'Build School Library'
    },
    timeline: [
      {
        milestone: {
          id: 'milestone-001',
          title: 'Foundation Completed',
          status: 'submitted',
          milestone_order: 1,
          due_date: '2026-04-15T00:00:00Z',
          amount: 50000
        },
        evidence: [
          {
            id: 'evidence-001',
            description: 'Foundation work photos and inspection reports',
            captured_at: '2026-04-10T10:30:00Z',
            gps_lat: 28.7041,
            gps_long: 77.1025,
            media: [
              {
                id: 'media-001',
                file_name: 'foundation_photo_1.jpg',
                media_url: 'https://cdn.example.com/foundation_photo_1.jpg'
              },
              {
                id: 'media-002',
                file_name: 'foundation_photo_2.jpg',
                media_url: 'https://cdn.example.com/foundation_photo_2.jpg'
              }
            ],
            documents: [
              {
                id: 'doc-001',
                file_name: 'inspection_report.pdf',
                document_url: 'https://cdn.example.com/inspection_report.pdf'
              },
              {
                id: 'doc-002',
                file_name: 'material_receipt.pdf',
                document_url: 'https://cdn.example.com/material_receipt.pdf'
              }
            ]
          }
        ],
        payments: [
          {
            payment_status: 'pending',
            payment_reference: 'PAY-REF-001',
            amount: 50000
          }
        ]
      },
      {
        milestone: {
          id: 'milestone-002',
          title: 'Walls Construction',
          status: 'approved',
          milestone_order: 2,
          due_date: '2026-05-01T00:00:00Z',
          amount: 75000
        },
        evidence: [],
        payments: [
          {
            payment_status: 'confirmed',
            payment_reference: 'PAY-REF-002',
            amount: 75000
          }
        ]
      }
    ]
  }
};

export const mockMilestoneDetailsResponse = {
  success: true,
  data: {
    id: 'milestone-001',
    title: 'Foundation Completed',
    description: 'Complete foundation work for school library building including excavation, concrete pouring, and initial brick laying',
    status: 'submitted',
    due_date: '2026-04-15T00:00:00Z',
    amount: 50000,
    evidence: [
      {
        id: 'evidence-001',
        description: 'Foundation work photos and inspection reports',
        captured_at: '2026-04-10T10:30:00Z',
        gps_lat: 28.7041,
        gps_long: 77.1025,
        media: [
          {
            id: 'media-001',
            file_name: 'foundation_photo_1.jpg',
            media_url: 'https://cdn.example.com/foundation_photo_1.jpg'
          },
          {
            id: 'media-002',
            file_name: 'foundation_photo_2.jpg',
            media_url: 'https://cdn.example.com/foundation_photo_2.jpg'
          }
        ],
        documents: [
          {
            id: 'doc-001',
            file_name: 'inspection_report.pdf',
            document_url: 'https://cdn.example.com/inspection_report.pdf'
          },
          {
            id: 'doc-002',
            file_name: 'material_receipt.pdf',
            document_url: 'https://cdn.example.com/material_receipt.pdf'
          }
        ]
      }
    ]
  }
};

export const mockAuditHistoryResponse = {
  success: true,
  data: [
    {
      id: 'audit-001',
      event_type: 'milestone_submitted',
      entity_type: 'milestone',
      entity_id: 'milestone-001',
      description: 'Foundation milestone submitted for review',
      created_at: '2026-04-10T10:30:00Z',
      details: {
        project_id: 'proj-001',
        amount: 50000,
        ngo_name: 'Save Children India'
      }
    },
    {
      id: 'audit-002',
      event_type: 'evidence_approved',
      entity_type: 'milestone',
      entity_id: 'milestone-001',
      description: 'Foundation milestone evidence approved by CA',
      created_at: '2026-04-12T14:20:00Z',
      details: {
        approved_by: 'ca-user-12345',
        comments: 'Excellent work, foundation looks solid and properly constructed',
        project_id: 'proj-001'
      }
    },
    {
      id: 'audit-003',
      event_type: 'payment_confirmed',
      entity_type: 'milestone',
      entity_id: 'milestone-001',
      description: 'Payment confirmed for foundation milestone',
      created_at: '2026-04-12T15:00:00Z',
      details: {
        payment_reference: 'PAY-REF-001',
        amount: 50000,
        confirmed_by: 'ca-user-12345'
      }
    },
    {
      id: 'audit-004',
      event_type: 'milestone_submitted',
      entity_type: 'milestone',
      entity_id: 'milestone-003',
      description: 'Roof construction milestone submitted for review',
      created_at: '2026-04-15T09:15:00Z',
      details: {
        project_id: 'proj-001',
        amount: 100000,
        ngo_name: 'Save Children India'
      }
    }
  ]
};

// Mock API endpoints for testing
export const mockAPIEndpoints = {
  '/api/companies/ca/verify': mockCompanyCAContext,
  '/api/csr-projects': mockProjectsResponse,
  '/api/csr-projects/proj-001/evidence': mockProjectEvidenceResponse,
  '/api/csr-projects/proj-002/evidence': {
    ...mockProjectEvidenceResponse,
    data: {
      ...mockProjectEvidenceResponse.data,
      project: { title: 'Clean Water Project' },
      timeline: []
    }
  },
  '/api/milestones/milestone-001': mockMilestoneDetailsResponse,
  '/api/csr-projects/proj-001/audit': mockAuditHistoryResponse,
  '/api/csr-projects/proj-002/audit': {
    success: true,
    data: []
  },
  // Mock POST responses
  'POST /api/milestones/milestone-001/review': {
    success: true,
    data: {
      id: 'review-001',
      milestone_id: 'milestone-001',
      decision: 'approved',
      comments: 'Mock approval for testing',
      created_at: '2026-04-12T14:20:00Z'
    }
  },
  'POST /api/milestones/milestone-001/payment': {
    success: true,
    data: {
      id: 'payment-001',
      milestone_id: 'milestone-001',
      payment_reference: 'PAY-REF-001',
      amount: 50000,
      payment_status: 'confirmed',
      created_at: '2026-04-12T15:00:00Z'
    }
  }
};