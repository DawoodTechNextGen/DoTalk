// DoTalk End-to-End Encryption (E2EE) Cryptographic Helpers
// Uses native Web Crypto API (RSA-OAEP 2048-bit + AES-GCM 256-bit)
// Stores Private Key securely in IndexedDB so it never leaves the browser.

const DB_NAME = 'dotalk-crypto-db';
const DB_VERSION = 1;
const STORE_NAME = 'keys-store';

// ─── IndexedDB Secure Storage helper ───────────────────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function getStoredKey(keyName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(keyName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function setStoredKey(keyName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(key, keyName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ─── Base64 conversions ────────────────────────────────────────────────────────
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binaryString = window.atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// ─── Key Generation & Verification ─────────────────────────────────────────────
export async function getOrCreateKeyPair() {
  try {
    // 1. Try reading existing keys from IndexedDB
    const privateKey = await getStoredKey('privateKey');
    const publicKeyJwk = await getStoredKey('publicKeyJwk');

    if (privateKey && publicKeyJwk) {
      return { privateKey, publicKeyJwk };
    }

    // 2. Generate new RSA-OAEP key pair
    console.log('[E2EE] Keys not found. Generating new 2048-bit RSA-OAEP keypair...');
    const keyPair = await window.crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256'
      },
      true, // extractable
      ['encrypt', 'decrypt']
    );

    // 3. Export public key in JWK format to send to database
    const exportedPublicKey = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const publicKeyJwkString = JSON.stringify(exportedPublicKey);

    // 4. Save keys in IndexedDB
    await setStoredKey('privateKey', keyPair.privateKey);
    await setStoredKey('publicKeyJwk', publicKeyJwkString);

    return { privateKey: keyPair.privateKey, publicKeyJwk: publicKeyJwkString };
  } catch (err) {
    console.error('[E2EE] Failed to generate/fetch keypair:', err);
    throw err;
  }
}

// ─── Key import ────────────────────────────────────────────────────────────────
export async function importPublicKey(jwkString) {
  try {
    const jwk = JSON.parse(jwkString);
    return await window.crypto.subtle.importKey(
      'jwk',
      jwk,
      {
        name: 'RSA-OAEP',
        hash: 'SHA-256'
      },
      true,
      ['encrypt']
    );
  } catch (err) {
    console.error('[E2EE] Failed to import public key:', err);
    return null;
  }
}

// ─── Symmetric AES-GCM Helpers ─────────────────────────────────────────────────
export async function generateAesKey() {
  return await window.crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256
    },
    true,
    ['encrypt', 'decrypt']
  );
}

// Encrypt payload with AES key
async function encryptWithAes(text, aesKey) {
  const enc = new TextEncoder();
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit iv for AES-GCM
  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    aesKey,
    enc.encode(text)
  );

  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv)
  };
}

// Decrypt payload with AES key
async function decryptWithAes(ciphertextBase64, ivBase64, aesKey) {
  const ciphertext = base64ToArrayBuffer(ciphertextBase64);
  const iv = base64ToArrayBuffer(ivBase64);

  const decrypted = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    aesKey,
    ciphertext
  );

  const dec = new TextDecoder();
  return dec.decode(decrypted);
}

// ─── Asymmetric RSA Encryption/Decryption of Keys ─────────────────────────────
async function encryptAesKeyWithRsa(aesKey, rsaPublicKey) {
  // Export raw AES key buffer to encrypt
  const rawAesKey = await window.crypto.subtle.exportKey('raw', aesKey);
  const encryptedKey = await window.crypto.subtle.encrypt(
    {
      name: 'RSA-OAEP'
    },
    rsaPublicKey,
    rawAesKey
  );
  return arrayBufferToBase64(encryptedKey);
}

async function decryptAesKeyWithRsa(encryptedKeyBase64, rsaPrivateKey) {
  const encryptedBuffer = base64ToArrayBuffer(encryptedKeyBase64);
  const decryptedRaw = await window.crypto.subtle.decrypt(
    {
      name: 'RSA-OAEP'
    },
    rsaPrivateKey,
    encryptedBuffer
  );

  // Import raw AES key back to CryptoKey
  return await window.crypto.subtle.importKey(
    'raw',
    decryptedRaw,
    {
      name: 'AES-GCM',
      length: 256
    },
    true,
    ['encrypt', 'decrypt']
  );
}

// ─── High Level Message Encryption (Hybrid E2EE) ──────────────────────────────
export async function encryptDirectMessage(text, receiverPublicKeyJwk, senderPublicKeyJwk) {
  try {
    const rxPublicKey = await importPublicKey(receiverPublicKeyJwk);
    const txPublicKey = await importPublicKey(senderPublicKeyJwk);

    if (!rxPublicKey || !txPublicKey) {
      throw new Error('Could not import public keys for encryption.');
    }

    // 1. Generate AES key
    const aesKey = await generateAesKey();

    // 2. Encrypt text with AES key
    const { ciphertext, iv } = await encryptWithAes(text, aesKey);

    // 3. Encrypt AES key with receiver's public key
    const encryptedKeyReceiver = await encryptAesKeyWithRsa(aesKey, rxPublicKey);

    // 4. Encrypt AES key with sender's public key (so sender can decrypt in sent history)
    const encryptedKeySender = await encryptAesKeyWithRsa(aesKey, txPublicKey);

    return {
      ciphertext,
      encryptedKeyReceiver,
      encryptedKeySender,
      iv
    };
  } catch (err) {
    console.error('[E2EE] Direct message encryption failed:', err);
    throw err;
  }
}

export async function decryptDirectMessage(msg, ownPrivateKey) {
  try {
    const keyReceiver = msg.encryptedKeyReceiver || msg.encrypted_key_receiver;
    const keySender = msg.encryptedKeySender || msg.encrypted_key_sender;

    if (!msg.iv || (!keyReceiver && !keySender)) {
      // Not encrypted / legacy plain text message
      return msg.message;
    }

    // Determine correct key to decrypt
    const keyToDecrypt = ownPrivateKey.isSender ? keySender : keyReceiver;
    
    if (!keyToDecrypt) {
      return '[Encrypted Message: Key missing]';
    }

    // 1. Decrypt AES key with own private key
    const aesKey = await decryptAesKeyWithRsa(keyToDecrypt, ownPrivateKey.key);

    // 2. Decrypt message using decrypted AES key
    return await decryptWithAes(msg.message, msg.iv, aesKey);
  } catch (err) {
    console.warn('[E2EE] Failed to decrypt message (possible key mismatch or legacy message):', err.message);
    return msg.message || '[Unable to decrypt message]';
  }
}

// ─── Group Encryption Helpers ──────────────────────────────────────────────────
// Creator generates raw group key (AES Key) and exports it in raw Base64 format
export async function createGroupKeyExport() {
  const aesKey = await generateAesKey();
  const rawKey = await window.crypto.subtle.exportKey('raw', aesKey);
  return arrayBufferToBase64(rawKey);
}

// Encrypt the raw group key with a member's public key
export async function encryptGroupKeyForMember(rawGroupKeyBase64, memberPublicKeyJwk) {
  try {
    const publicKey = await importPublicKey(memberPublicKeyJwk);
    if (!publicKey) return null;

    const rawKey = base64ToArrayBuffer(rawGroupKeyBase64);
    const encryptedGroupKey = await window.crypto.subtle.encrypt(
      {
        name: 'RSA-OAEP'
      },
      publicKey,
      rawKey
    );

    return arrayBufferToBase64(encryptedGroupKey);
  } catch (err) {
    console.error('[E2EE] Failed to encrypt group key for member:', err);
    return null;
  }
}

// Decrypt the member's group key using their private key and import it
export async function decryptGroupKey(encryptedGroupKeyBase64, ownPrivateKey) {
  try {
    const encryptedBuffer = base64ToArrayBuffer(encryptedGroupKeyBase64);
    const decryptedRaw = await window.crypto.subtle.decrypt(
      {
        name: 'RSA-OAEP'
      },
      ownPrivateKey,
      encryptedBuffer
    );

    // Import decrypted raw AES key
    return await window.crypto.subtle.importKey(
      'raw',
      decryptedRaw,
      {
        name: 'AES-GCM',
        length: 256
      },
      true,
      ['encrypt', 'decrypt']
    );
  } catch (err) {
    console.error('[E2EE] Failed to decrypt group key:', err);
    return null;
  }
}

// Encrypt group message
export async function encryptGroupMessage(text, groupAesKey) {
  const { ciphertext, iv } = await encryptWithAes(text, groupAesKey);
  return { ciphertext, iv };
}

// Decrypt group message
export async function decryptGroupMessage(msg, groupAesKey) {
  try {
    if (!msg.iv || !groupAesKey) return msg.message;
    return await decryptWithAes(msg.message, msg.iv, groupAesKey);
  } catch (err) {
    return msg.message || '[Unable to decrypt group message]';
  }
}
