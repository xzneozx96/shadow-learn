/**
 * Utilities for image file validation.
 */

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

export type ImageValidationError = 'unsupported_type' | 'too_large'

/**
 * Validate that a file is an acceptable image upload.
 * Returns null if valid, or an error code string if not.
 */
export function validateImageFile(file: File): ImageValidationError | null {
  if (!ALLOWED_TYPES.has(file.type)) {
    return 'unsupported_type'
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'too_large'
  }
  return null
}
