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
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'verified':
        return {
          variant: 'default' as const,
          icon: CheckCircle,
          text: 'Verified',
          className: 'bg-green-100 text-green-800 hover:bg-green-200 border-green-300'
        }
      case 'pending':
        return {
          variant: 'secondary' as const,
          icon: Clock,
          text: 'Verification Pending',
          className: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border-yellow-300'
        }
      case 'unverified':
      default:
        return {
          variant: 'outline' as const,
          icon: AlertCircle,
          text: 'Not Verified',
          className: 'bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-300'
        }
    }
  }

  const config = getStatusConfig(status)
  const Icon = config.icon

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-xs px-2 py-1',
    lg: 'text-sm px-2.5 py-1.5'
  }

  const iconSizes = {
    sm: 10,
    md: 12,
    lg: 14
  }

  return (
    <Badge 
      variant={config.variant}
      className={`
        ${config.className} 
        ${sizeClasses[size]} 
        inline-flex items-center gap-1 font-medium
        ${className}
      `}
    >
      <Icon size={iconSizes[size]} />
      {showText && config.text}
    </Badge>
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