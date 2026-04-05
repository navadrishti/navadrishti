import { CheckCircle2, AlertCircle } from 'lucide-react'

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

  const Icon = CheckCircle2;

  const sizeStyles = {
    sm: {
      fontSize: '10px',
      iconSize: 12
    },
    md: {
      fontSize: '11px',
      iconSize: 14
    },
    lg: {
      fontSize: '12px',
      iconSize: 16
    }
  }

  const currentSize = sizeStyles[size]

  return (
    <div 
      className={`inline-flex items-center shrink-0 ${className}`}
      style={{
        fontSize: showText ? currentSize.fontSize : '0',
        fontWeight: '500',
        gap: showText ? '4px' : '0'
      }}
    >
      <Icon 
        size={currentSize.iconSize} 
        style={{ 
          color: '#059669',
          flexShrink: 0
        }} 
      />
      {showText && (
        <span style={{ 
          color: '#047857',
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