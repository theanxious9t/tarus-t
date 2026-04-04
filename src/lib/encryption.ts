/**
 * Simple End-to-End Encryption (E2EE) utility using Web Crypto API.
 * This implementation uses a shared secret (derived from chatId) for symmetric encryption.
 * In a production app, you would use a more robust key exchange like Diffie-Hellman.
 */

const ENCRYPTION_KEY_PREFIX = "tarsus-e2ee-";

async function getEncryptionKey(chatId: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(ENCRYPTION_KEY_PREFIX + chatId);
  
  // Use SHA-256 to derive a 256-bit key from the chatId
  const hash = await crypto.subtle.digest('SHA-256', keyData);
  
  return await crypto.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptMessage(text: string, chatId: string): Promise<string> {
  try {
    const key = await getEncryptionKey(chatId);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const encodedText = encoder.encode(text);
    
    const encryptedContent = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encodedText
    );
    
    // Combine IV and encrypted content into a single base64 string
    const combined = new Uint8Array(iv.length + encryptedContent.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encryptedContent), iv.length);
    
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error("Encryption failed:", error);
    return text; // Fallback to plain text if encryption fails
  }
}

export async function decryptMessage(encryptedBase64: string, chatId: string): Promise<string> {
  try {
    const key = await getEncryptionKey(chatId);
    const combined = new Uint8Array(
      atob(encryptedBase64).split('').map(c => c.charCodeAt(0))
    );
    
    const iv = combined.slice(0, 12);
    const encryptedContent = combined.slice(12);
    
    const decryptedContent = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encryptedContent
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decryptedContent);
  } catch (error) {
    // If decryption fails, it might be a plain text message or wrong key
    return encryptedBase64;
  }
}
