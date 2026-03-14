// CA Case Detail API - Mock implementation
import { NextRequest, NextResponse } from 'next/server';
import type { VerificationCase, VerificationDocument, OCRResult } from '@/lib/types/verification';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const caseId = params.id;

    // TODO: Verify CA authentication and case assignment
    // const authHeader = request.headers.get('authorization');
    // if (!authHeader) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }

    // Mock case data
    const mockCase: VerificationCase = {
      id: caseId,
      user_id: 123,
      entity_type: 'ngo',
      entity_name: 'Green Earth Foundation',
      registration_number: 'NGO/2023/12345',
      registration_type: 'Trust',
      pan_number: 'AAATG1234F',
      status: 'assigned_to_ca',
      priority: 'urgent',
      submitted_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      assigned_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
      pre_check_passed: true,
      pre_check_issues: [],
      documents: [
        {
          id: 'doc-1',
          case_id: caseId,
          document_type: 'registration_certificate',
          file_url: 'https://via.placeholder.com/800x1000/0ea5e9/ffffff?text=Registration+Certificate',
          file_name: 'registration_cert.pdf',
          file_size: 524288,
          uploaded_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          ocr_status: 'completed',
          ocr_result_id: 'ocr-1'
        },
        {
          id: 'doc-2',
          case_id: caseId,
          document_type: 'pan_card',
          file_url: 'https://via.placeholder.com/800x500/10b981/ffffff?text=PAN+Card',
          file_name: 'pan_card.pdf',
          file_size: 204800,
          uploaded_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          ocr_status: 'completed',
          ocr_result_id: 'ocr-2'
        },
        {
          id: 'doc-3',
          case_id: caseId,
          document_type: 'fcra_certificate',
          file_url: 'https://via.placeholder.com/800x1000/8b5cf6/ffffff?text=FCRA+Certificate',
          file_name: 'fcra_cert.pdf',
          file_size: 614400,
          uploaded_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          ocr_status: 'completed',
          ocr_result_id: 'ocr-3'
        },
        {
          id: 'doc-4',
          case_id: caseId,
          document_type: 'address_proof',
          file_url: 'https://via.placeholder.com/800x600/f59e0b/ffffff?text=Address+Proof',
          file_name: 'utility_bill.pdf',
          file_size: 153600,
          uploaded_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          ocr_status: 'completed',
          ocr_result_id: 'ocr-4'
        }
      ],
      created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
    };

    const mockOcrResults: Record<string, OCRResult> = {
      'ocr-1': {
        id: 'ocr-1',
        document_id: 'doc-1',
        extracted_text: 'CERTIFICATE OF REGISTRATION\n\nThis is to certify that Green Earth Foundation has been registered as a Trust under the Indian Trusts Act, 1882...',
        structured_data: {
          entity_name: 'Green Earth Foundation',
          registration_number: 'NGO/2023/12345',
          registration_date: '2023-01-15',
          address: '123 Green Street, Mumbai, Maharashtra'
        },
        validation_flags: {
          format_valid: true,
          expiry_valid: true,
          name_match: true,
          number_match: true,
          issues: []
        },
        confidence_score: 0.96,
        processed_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
      },
      'ocr-2': {
        id: 'ocr-2',
        document_id: 'doc-2',
        extracted_text: 'Permanent Account Number Card\n\nName: GREEN EARTH FOUNDATION\nPAN: AAATG1234F\n...',
        structured_data: {
          entity_name: 'GREEN EARTH FOUNDATION',
          pan_number: 'AAATG1234F'
        },
        validation_flags: {
          format_valid: true,
          expiry_valid: true,
          name_match: true,
          number_match: true,
          issues: []
        },
        confidence_score: 0.98,
        processed_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
      },
      'ocr-3': {
        id: 'ocr-3',
        document_id: 'doc-3',
        extracted_text: 'FCRA REGISTRATION CERTIFICATE\n\nRegistration Number: 083781425\nValidity: 2028-12-31\n...',
        structured_data: {
          fcra_number: '083781425',
          fcra_validity: '2028-12-31',
          entity_name: 'Green Earth Foundation'
        },
        validation_flags: {
          format_valid: true,
          expiry_valid: true,
          name_match: true,
          number_match: false,
          issues: ['FCRA number format needs manual verification']
        },
        confidence_score: 0.89,
        processed_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
      },
      'ocr-4': {
        id: 'ocr-4',
        document_id: 'doc-4',
        extracted_text: 'Electricity Bill\n\nAccount Name: Green Earth Foundation\nAddress: 123 Green Street, Mumbai...',
        structured_data: {
          address: '123 Green Street, Mumbai, Maharashtra',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001'
        },
        validation_flags: {
          format_valid: true,
          expiry_valid: true,
          name_match: true,
          number_match: true,
          issues: []
        },
        confidence_score: 0.92,
        processed_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
      }
    };

    return NextResponse.json({
      success: true,
      case: mockCase,
      ocrResults: mockOcrResults
    });

  } catch (error) {
    console.error('CA case detail error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch case details' },
      { status: 500 }
    );
  }
}
