import { ErrorCode } from './error-codes';

/**
 * Centralized typed error for all expected failure modes. Route/middleware
 * code should throw this (or a subclass) instead of a bare Error so the
 * error handler can map it to a stable HTTP status and response envelope
 * without string-sniffing messages.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;
  readonly isOperational: boolean;

  constructor(code: ErrorCode, message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    // Operational errors are expected/handled failures (bad input, missing
    // resource, etc.) as opposed to programmer errors/bugs.
    this.isOperational = true;
    Error.captureStackTrace?.(this, AppError);
  }

  static validation(message: string, details?: unknown): AppError {
    return new AppError(ErrorCode.VALIDATION_ERROR, message, 400, details);
  }

  static notFound(message = 'Resource not found'): AppError {
    return new AppError(ErrorCode.NOT_FOUND, message, 404);
  }

  static unauthorized(message = 'Authentication required'): AppError {
    return new AppError(ErrorCode.UNAUTHORIZED, message, 401);
  }

  static unauthenticated(message = 'Authentication required', details?: unknown): AppError {
    return new AppError(ErrorCode.UNAUTHENTICATED, message, 401, details);
  }

  static forbidden(message = 'Forbidden'): AppError {
    return new AppError(ErrorCode.FORBIDDEN, message, 403);
  }

  static authenticationRequired(message = 'Authentication required', details?: unknown): AppError {
    return new AppError(ErrorCode.AUTHENTICATION_REQUIRED, message, 401, details);
  }

  static authenticationInvalid(
    message = 'Invalid or expired access token',
    details?: unknown,
  ): AppError {
    return new AppError(ErrorCode.AUTHENTICATION_INVALID, message, 401, details);
  }

  static authorizationDenied(message = 'Forbidden', details?: unknown): AppError {
    return new AppError(ErrorCode.AUTHORIZATION_DENIED, message, 403, details);
  }

  static accessTokenExpired(message = 'The access token has expired', details?: unknown): AppError {
    return new AppError(ErrorCode.ACCESS_TOKEN_EXPIRED, message, 401, details);
  }

  static tokenAudienceInvalid(message = 'Invalid audience claim', details?: unknown): AppError {
    return new AppError(ErrorCode.TOKEN_AUDIENCE_INVALID, message, 401, details);
  }

  static mediaUploadForbidden(
    message = 'You are not allowed to upload this media',
    details?: unknown,
  ): AppError {
    return new AppError(ErrorCode.MEDIA_UPLOAD_FORBIDDEN, message, 403, details);
  }

  static mediaTypeUnsupported(
    message = 'This file type is not supported',
    details?: unknown,
  ): AppError {
    return new AppError(ErrorCode.MEDIA_TYPE_UNSUPPORTED, message, 415, details);
  }

  static mediaSizeExceeded(
    message = 'This file exceeds the maximum allowed size',
    details?: unknown,
  ): AppError {
    return new AppError(ErrorCode.MEDIA_SIZE_EXCEEDED, message, 413, details);
  }

  static mediaNotOwned(message = 'Media not found', details?: unknown): AppError {
    return new AppError(ErrorCode.MEDIA_NOT_OWNED, message, 403, details);
  }

  static mediaBindingConflict(
    message = 'This media is already attached',
    details?: unknown,
  ): AppError {
    return new AppError(ErrorCode.MEDIA_BINDING_CONFLICT, message, 409, details);
  }

  static uploadIncomplete(message = 'Upload is incomplete', details?: unknown): AppError {
    return new AppError(ErrorCode.UPLOAD_INCOMPLETE, message, 422, details);
  }

  static invalidDraftState(message = 'Draft is not in a valid state', details?: unknown): AppError {
    return new AppError(ErrorCode.INVALID_DRAFT_STATE, message, 409, details);
  }

  static retryableUploadFailure(
    message = 'Upload failed. Please retry.',
    details?: unknown,
  ): AppError {
    return new AppError(ErrorCode.RETRYABLE_UPLOAD_FAILURE, message, 503, details);
  }

  static resourceOwnershipRequired(
    message = 'You do not own this resource',
    details?: unknown,
  ): AppError {
    return new AppError(ErrorCode.RESOURCE_OWNERSHIP_REQUIRED, message, 403, details);
  }

  static countryNotFound(message = 'Country not found', details?: unknown): AppError {
    return new AppError(ErrorCode.COUNTRY_NOT_FOUND, message, 404, details);
  }

  static locationNotFound(message = 'Location not found', details?: unknown): AppError {
    return new AppError(ErrorCode.LOCATION_NOT_FOUND, message, 404, details);
  }

  static locationParentInvalid(message = 'Unknown parent location', details?: unknown): AppError {
    return new AppError(ErrorCode.LOCATION_PARENT_INVALID, message, 404, details);
  }

  static animalTypeNotFound(message = 'Animal type not found', details?: unknown): AppError {
    return new AppError(ErrorCode.ANIMAL_TYPE_NOT_FOUND, message, 404, details);
  }

  static animalBreedNotFound(message = 'Breed not found', details?: unknown): AppError {
    return new AppError(ErrorCode.ANIMAL_BREED_NOT_FOUND, message, 404, details);
  }

  static animalBreedSpeciesMismatch(
    message = 'This breed does not belong to the selected species',
    details?: unknown,
  ): AppError {
    return new AppError(ErrorCode.ANIMAL_BREED_SPECIES_MISMATCH, message, 422, details);
  }

  static fundraiserNotFound(message = 'Campaign not found', details?: unknown): AppError {
    return new AppError(ErrorCode.FUNDRAISER_NOT_FOUND, message, 404, details);
  }

  static fundraiserNotPublic(
    message = 'This fundraiser is not publicly available',
    details?: unknown,
  ): AppError {
    return new AppError(ErrorCode.FUNDRAISER_NOT_PUBLIC, message, 403, details);
  }

  static fundraiserAccessDenied(message = 'Campaign not found', details?: unknown): AppError {
    return new AppError(ErrorCode.FUNDRAISER_ACCESS_DENIED, message, 403, details);
  }

  static fundraiserNotDonatable(
    message = 'This fundraiser is not accepting donations',
    details?: unknown,
  ): AppError {
    return new AppError(ErrorCode.FUNDRAISER_NOT_DONATABLE, message, 422, details);
  }

  static fundraiserEditForbidden(message = 'Campaign not found', details?: unknown): AppError {
    return new AppError(ErrorCode.FUNDRAISER_EDIT_FORBIDDEN, message, 403, details);
  }

  /** Payout-sensitive operations only — never campaign submission. */
  static fundraisingAccountNotVerified(
    message = 'Complete fundraising verification before withdrawing funds',
    details?: unknown,
  ): AppError {
    return new AppError(ErrorCode.FUNDRAISING_ACCOUNT_NOT_VERIFIED, message, 403, details);
  }

  static paymentProviderUnavailable(
    message = 'The payment provider is temporarily unavailable',
    details?: unknown,
  ): AppError {
    return new AppError(ErrorCode.PAYMENT_PROVIDER_UNAVAILABLE, message, 503, details);
  }

  static conflict(message: string, details?: unknown): AppError {
    return new AppError(ErrorCode.CONFLICT, message, 409, details);
  }

  static requestTimeout(message = 'Request timed out'): AppError {
    return new AppError(ErrorCode.REQUEST_TIMEOUT, message, 408);
  }

  static payloadTooLarge(message = 'Request body too large'): AppError {
    return new AppError(ErrorCode.PAYLOAD_TOO_LARGE, message, 413);
  }

  static rateLimited(message = 'Too many requests', details?: unknown): AppError {
    return new AppError(ErrorCode.RATE_LIMITED, message, 429, details);
  }

  static databaseUnavailable(message = 'Database unavailable', details?: unknown): AppError {
    return new AppError(ErrorCode.DATABASE_UNAVAILABLE, message, 503, details);
  }

  static serviceUnavailable(message = 'Service unavailable', details?: unknown): AppError {
    return new AppError(ErrorCode.SERVICE_UNAVAILABLE, message, 503, details);
  }

  static adoptionNotFound(message = 'Adoption listing not found', details?: unknown): AppError {
    return new AppError(ErrorCode.ADOPTION_NOT_FOUND, message, 404, details);
  }

  static adoptionAccessDenied(message = 'Access denied', details?: unknown): AppError {
    return new AppError(ErrorCode.ADOPTION_ACCESS_DENIED, message, 403, details);
  }

  static adoptionEditForbidden(message = 'Edit forbidden', details?: unknown): AppError {
    return new AppError(ErrorCode.ADOPTION_EDIT_FORBIDDEN, message, 403, details);
  }

  static adoptionNotPublic(message = 'Listing not public', details?: unknown): AppError {
    return new AppError(ErrorCode.ADOPTION_NOT_PUBLIC, message, 403, details);
  }

  static adoptionInvalidStatus(message = 'Invalid status transition', details?: unknown): AppError {
    return new AppError(ErrorCode.ADOPTION_INVALID_STATUS, message, 409, details);
  }

  static adoptionValidationFailed(message = 'Validation failed', details?: unknown): AppError {
    return new AppError(ErrorCode.ADOPTION_VALIDATION_FAILED, message, 422, details);
  }

  static adoptionMediaNotOwned(message = 'Media not owned', details?: unknown): AppError {
    return new AppError(ErrorCode.ADOPTION_MEDIA_NOT_OWNED, message, 403, details);
  }

  static adoptionMediaAlreadyBound(
    message = 'One or more media items are already attached to another adoption listing',
    details?: unknown,
  ): AppError {
    return new AppError(ErrorCode.ADOPTION_MEDIA_ALREADY_BOUND, message, 409, details);
  }

  static adoptionStatusTransitionInvalid(
    message = 'Invalid status transition',
    details?: unknown,
  ): AppError {
    return new AppError(ErrorCode.ADOPTION_STATUS_TRANSITION_INVALID, message, 400, details);
  }

  static adoptionStatusChangeForbidden(
    message = 'Adoption status change forbidden',
    details?: unknown,
  ): AppError {
    return new AppError(ErrorCode.ADOPTION_STATUS_CHANGE_FORBIDDEN, message, 403, details);
  }

  static adoptionAlreadyClosed(
    message = 'Adoption listing is already closed',
    details?: unknown,
  ): AppError {
    return new AppError(ErrorCode.ADOPTION_ALREADY_CLOSED, message, 409, details);
  }

  static adoptionDateInvalid(
    message = 'Invalid approximate date of birth',
    details?: unknown,
  ): AppError {
    return new AppError(ErrorCode.ADOPTION_DATE_INVALID, message, 422, details);
  }

  static adoptionLocationRequired(
    message = 'Adoption location is required',
    details?: unknown,
  ): AppError {
    return new AppError(ErrorCode.ADOPTION_LOCATION_REQUIRED, message, 422, details);
  }

  static internal(message = 'Internal server error'): AppError {
    return new AppError(ErrorCode.INTERNAL_ERROR, message, 500);
  }

  static postCaptionTooLong(message: string, details?: unknown): AppError {
    return new AppError(ErrorCode.POST_CAPTION_TOO_LONG, message, 400, details);
  }

  static postBackgroundWithMediaNotAllowed(
    message = 'A post cannot have both media and a text background',
    details?: unknown,
  ): AppError {
    return new AppError(ErrorCode.POST_BACKGROUND_WITH_MEDIA_NOT_ALLOWED, message, 400, details);
  }
}
