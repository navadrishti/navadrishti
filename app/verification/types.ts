import type { Dispatch, SetStateAction } from 'react';

export type VerificationCategory = 'individual' | 'ngo' | 'company';
export type Step = 1 | 2;
export type NgoRegistrationType = 'Trust' | 'Society' | 'Section 8';
export type FormErrors = Record<string, string>;

export type DocumentKey =
  | 'individualAadhaar'
  | 'individualPanCard'
  | 'bankStatement'
  | 'ngoRegistrationCertificate'
  | 'ngoPanCard'
  | 'ngoAddressProof'
  | 'ngoTrustOrMoaAoa'
  | 'ngoFcraPhoto'
  | 'ngoTwelveACertificate'
  | 'ngoEightyGCertificate'
  | 'ngoCsr1Certificate'
  | 'companyIncorporationCertificate'
  | 'companyPanCard'
  | 'companyGstCertificate'
  | 'companyAddressProof';

export interface VerificationFormData {
  entityName: string;
  contactNumber: string;
  email: string;
  category: VerificationCategory;
  panNumber: string;
  aadhaarNumber: string;
  registrationNumber: string;
  ngoRegistrationType: NgoRegistrationType;
  ngoFcraRegistrationNumber: string;
  ngoFcraExpiryDate: string;
  ngoAssociationNumber: string;
  ngoTwelveANumber: string;
  ngoTwelveAExpiryDate: string;
  ngoEightyGNumber: string;
  ngoEightyGExpiryDate: string;
  ngoCsr1RegistrationNumber: string;
  ngoCsr1ExpiryDate: string;
  companyCinNumber: string;
  companyGstNumber: string;
  companyGstApplicable: boolean;
}

export type SetFormData = Dispatch<SetStateAction<VerificationFormData>>;

export interface AuthSnapshot {
  email_verified?: boolean;
  phone_verified?: boolean;
  verification_status?: 'verified' | 'unverified' | 'pending';
  reverification_pending?: boolean;
}
