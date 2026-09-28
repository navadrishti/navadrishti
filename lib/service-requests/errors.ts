export class ServiceRequestDeleteBlockedError extends Error {
  constructor(message = 'This need has payment records and cannot be deleted.') {
    super(message)
    this.name = 'ServiceRequestDeleteBlockedError'
  }
}
