export class CAReviewError extends Error {
  readonly status: 400 | 404 | 409

  constructor(message: string, status: 400 | 404 | 409) {
    super(message)
    this.name = 'CAReviewError'
    this.status = status
  }
}
