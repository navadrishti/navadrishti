import { Badge } from '@/components/ui/badge'
import { CheckCircle, Clock, XCircle, AlertCircle } from 'lucide-react'

interface VerificationBadgeProps {
  status: 'verified' | 'unverified' | 'pending' | string
  className?: string
  showText?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function VerificationBadge({ 
  status, 
  className = '', 
  showText = true, 
  size = 'md' 
}: VerificationBadgeProps) {
  // Only render for verified status to ensure consistency
  if (status !== 'verified') {
    return null;
  }

  const Icon = CheckCircle;

  // Force exact pixel sizes for consistency
  const sizeStyles = {
    sm: {
      width: '20px',
      height: '20px',
      fontSize: '10px',
      padding: '2px',
      iconSize: 12
    },
    md: {
      width: '24px', 
      height: '24px',
      fontSize: '11px',
      padding: '3px',
      iconSize: 14
    },
    lg: {
      width: '28px',
      height: '28px', 
      fontSize: '12px',
      padding: '4px',
      iconSize: 16
    }
  }

  const currentSize = sizeStyles[size]

  return (
    <div 
      className={`inline-flex items-center justify-center rounded-full shrink-0 ${className}`}
      style={{
        backgroundColor: '#dcfce7',
        color: '#166534',
        border: '1px solid #bbf7d0',
        width: currentSize.width,
        height: currentSize.height,
        minWidth: currentSize.width,
        minHeight: currentSize.height,
        padding: currentSize.padding,
        fontSize: showText ? currentSize.fontSize : '0',
        fontWeight: '500',
        gap: showText ? '2px' : '0'
      }}
    >
      <Icon 
        size={currentSize.iconSize} 
        style={{ 
          color: '#166534',
          flexShrink: 0
        }} 
      />
      {showText && (
        <span style={{ 
          color: '#166534',
          fontSize: currentSize.fontSize,
          fontWeight: '500',
          whiteSpace: 'nowrap'
        }}>
          Verified
        </span>
      )}
    </div>
  )
}

interface VerificationDetailsProps {
  userType: 'individual' | 'company' | 'ngo'
  verificationDetails: any
  className?: string
}

export function VerificationDetails({ 
  userType, 
  verificationDetails, 
  className = '' 
}: VerificationDetailsProps) {
  if (!verificationDetails) {
    return (
      <div className={`text-sm text-gray-600 ${className}`}>
        <div className="flex items-center gap-2">
          <AlertCircle size={16} className="text-gray-400" />
          <span>No verification details available</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`text-sm space-y-2 ${className}`}>
      {userType === 'individual' && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Aadhaar:</span>
            <VerificationBadge 
              status={verificationDetails.aadhaar_verified ? 'verified' : 'unverified'} 
              size="sm" 
              showText={false}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">PAN:</span>
            <VerificationBadge 
              status={verificationDetails.pan_verified ? 'verified' : 'unverified'} 
              size="sm" 
              showText={false}
            />
          </div>
        </div>
      )}
      
      {userType === 'company' && verificationDetails.company_name && (
        <div>
          <span className="text-gray-600">Company:</span>
          <span className="ml-2 font-medium">{verificationDetails.company_name}</span>
        </div>
      )}
      
      {userType === 'ngo' && verificationDetails.ngo_name && (
        <div>
          <span className="text-gray-600">Organization:</span>
          <span className="ml-2 font-medium">{verificationDetails.ngo_name}</span>
        </div>
      )}
      
      {verificationDetails.verification_date && (
        <div className="text-xs text-gray-500">
          Verified on {new Date(verificationDetails.verification_date).toLocaleDateString()}
        </div>
      )}
    </div>
  )
}