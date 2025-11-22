'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'

export default function UploadTestPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<any>(null)

  const testConfiguration = async () => {
    try {
      const response = await fetch('/api/debug/upload')
      const result = await response.json()
      setDebugInfo(result)
      
      if (result.cloudinary?.configured) {
        toast.success('Upload service is properly configured!')
      } else {
        toast.error('Upload service configuration issues detected')
      }
    } catch (error) {
      toast.error('Failed to check configuration')
      setError('Failed to check configuration')
    }
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setError(null)
      setUploadResult(null)
      
      // Validate file client-side
      if (file.size > 10 * 1024 * 1024) {
        setError('File too large (max 10MB)')
        return
      }
      
      const isImage = file.type.startsWith('image/')
      const isDocument = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.type)
      
      if (!isImage && !isDocument) {
        setError('Unsupported file type. Only images (JPG, PNG, GIF, WebP) and documents (PDF, DOC, DOCX) are allowed.')
        return
      }
      
      toast.success(`File selected: ${file.name}`)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error('Please select a file first')
      return
    }

    setUploading(true)
    setError(null)
    
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      
      // Try to get token from localStorage
      const token = localStorage.getItem('token')
      const headers: any = {}
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      console.log('Starting upload test...', {
        fileName: selectedFile.name,
        fileType: selectedFile.type,
        fileSize: selectedFile.size,
        hasToken: !!token
      })

      const response = await fetch('/api/upload', {
        method: 'POST',
        headers,
        body: formData
      })

      const result = await response.json()
      
      console.log('Upload response:', { status: response.status, result })

      if (response.ok) {
        setUploadResult(result)
        toast.success('Upload successful!')
      } else {
        setError(result.error || 'Upload failed')
        toast.error(`Upload failed: ${result.error}`)
      }
    } catch (error) {
      console.error('Upload error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setError(errorMessage)
      toast.error(`Upload error: ${errorMessage}`)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Upload Test Page</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Configuration Test */}
          <div>
            <Button onClick={testConfiguration} variant="outline">
              Test Upload Configuration
            </Button>
            
            {debugInfo && (
              <div className="mt-4 p-4 bg-gray-100 rounded-lg">
                <h4 className="font-semibold mb-2">Configuration Status:</h4>
                <pre className="text-sm overflow-auto">
                  {JSON.stringify(debugInfo, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* File Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Select File (Images: JPG, PNG, GIF, WebP | Documents: PDF, DOC, DOCX)
            </label>
            <input
              type="file"
              onChange={handleFileSelect}
              accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx"
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            
            {selectedFile && (
              <div className="mt-2 p-3 bg-green-50 rounded-lg">
                <p className="text-sm">
                  <strong>Selected:</strong> {selectedFile.name}<br/>
                  <strong>Type:</strong> {selectedFile.type}<br/>
                  <strong>Size:</strong> {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            )}
          </div>

          {/* Upload Button */}
          <Button 
            onClick={handleUpload} 
            disabled={!selectedFile || uploading}
            className="w-full"
          >
            {uploading ? 'Uploading...' : 'Test Upload'}
          </Button>

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Success Display */}
          {uploadResult && (
            <div className="p-4 bg-green-50 rounded-lg">
              <h4 className="font-semibold mb-2 text-green-800">Upload Successful!</h4>
              <div className="space-y-2">
                <p className="text-sm">
                  <strong>URL:</strong> 
                  <a href={uploadResult.data.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">
                    {uploadResult.data.url}
                  </a>
                </p>
                <p className="text-sm">
                  <strong>Public ID:</strong> {uploadResult.data.public_id}
                </p>
                {uploadResult.data.width && uploadResult.data.height && (
                  <p className="text-sm">
                    <strong>Dimensions:</strong> {uploadResult.data.width} x {uploadResult.data.height}
                  </p>
                )}
                
                {/* Preview for images */}
                {selectedFile?.type.startsWith('image/') && (
                  <div className="mt-4">
                    <p className="text-sm font-medium mb-2">Preview:</p>
                    <img 
                      src={uploadResult.data.url} 
                      alt="Uploaded file" 
                      className="max-w-full h-48 object-contain border rounded"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}