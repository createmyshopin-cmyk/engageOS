import { encryptSecret, decryptSecret } from '../crypto'

/**
 * WhatsApp token encryption adapter.
 * Wraps the EngageOS standard AES-256-GCM encryption helpers (from crypto.ts)
 * to maintain compatibility with the ported wacrm codebase.
 */

export function encrypt(text: string): string {
  return encryptSecret(text)
}

export function decrypt(encryptedText: string): string {
  if (!encryptedText) return ''
  
  // If it is in the EngageOS format (starts with v1:), decrypt using decryptSecret
  if (encryptedText.startsWith('v1:')) {
    return decryptSecret(encryptedText)
  }

  // Fallback for plaintext (e.g. verify_token saved during initial integration setup)
  if (!encryptedText.includes(':')) {
    return encryptedText
  }

  // If it is in the old wacrm format (legacy GCM/CBC format with colons but no v1 prefix),
  // we can't decrypt it because WACRM_ENCRYPTION_KEY is different from the old ENCRYPTION_KEY.
  // However, since this is a fresh setup of the integrated wacrm, there are no legacy keys.
  throw new Error('Unsupported legacy encryption format')
}

export function isLegacyFormat(encryptedText: string): boolean {
  // Anything not matching the new 'v1:' format is considered legacy and eligible for upgrade.
  return !encryptedText.startsWith('v1:')
}
