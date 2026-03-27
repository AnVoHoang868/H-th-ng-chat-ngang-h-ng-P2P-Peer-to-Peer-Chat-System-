/**
 * =============================================================================
 * E2EE (mã hóa đầu cuối) — lớp crypto dùng chung trình duyệt + Node.js
 * =============================================================================
 * - Thuật toán: ECDH trên đường cong NIST P-256 → derive khóa AES-256-GCM.
 * - Tracker / relay chỉ thấy ciphertext (base64) + IV — không có khóa giải mã.
 * - Web Crypto: `globalThis.crypto.subtle` (browser); Node: `import('crypto').webcrypto.subtle`.
 * - Chi tiết kiến trúc & hạn chế: `docs/04-e2ee-ma-hoa-dau-cuoi.md`
 */

/** Đường cong elliptic chuẩn hóa cho ECDH; Web Crypto bắt buộc dùng tên này cho P-256. */
const CURVE = 'P-256' as const

/**
 * Chuyển mảng byte nhị phân → chuỗi base64 (để đưa ciphertext/IV vào JSON qua mạng).
 * Dùng vòng lặp + btoa thay vì spread để tránh tràn stack với buffer rất lớn.
 */
function bytesToBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!)
  return btoa(s)
}

/** Giải mã base64 → Uint8Array (đầu vào cho subtle.decrypt). */
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Tuỳ chọn: nguồn RNG cho IV (AES-GCM). Trên Node < 20 có thể chưa có `globalThis.crypto` — peer CLI nên truyền `crypto.webcrypto.getRandomValues`. */
export type E2eeFactoryOptions = {
  getRandomValues?: (array: Uint8Array) => Uint8Array
}

/**
 * Factory: nhận `SubtleCrypto` (browser hoặc Node webcrypto) vì kiểu TypeScript của hai môi trường
 * hơi khác nhau — union giúp tsc chấp nhận cả hai mà không cần ép kiểu ở mỗi call site.
 *
 * @param options.getRandomValues — nếu không truyền: dùng `globalThis.crypto.getRandomValues` (browser, Node 20+).
 *   Peer Node 18: truyền `(buf) => webcrypto.getRandomValues(buf)` cùng gói với `subtle`.
 */
export function createE2eeOperations(
  subtle: SubtleCrypto | import('crypto').webcrypto.SubtleCrypto,
  options?: E2eeFactoryOptions
) {
  /**
   * Hàm lấy byte ngẫu nhiên an toàn cho IV (12 byte, AES-GCM).
   * - Ưu tiên `options.getRandomValues` khi gọi từ peer Node: dùng `crypto.webcrypto.getRandomValues` vì Node 18 có thể chưa gán `globalThis.crypto`.
   * - Fallback: `globalThis.crypto.getRandomValues` (browser, Node 20+).
   * Lưu ý: `SubtleCrypto` không có API random — bắt buộc tách RNG ra đây.
   */
  const getRandomValues: (array: Uint8Array) => Uint8Array =
    options?.getRandomValues ??
    ((array: Uint8Array) => {
      if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
        return globalThis.crypto.getRandomValues(array)
      }
      throw new Error(
        'E2EE: thiếu RNG an toàn. Trên Node < 20 hãy truyền options.getRandomValues từ crypto.webcrypto (xem src/peer/index.ts).'
      )
    })
  /**
   * Sinh cặp khóa ECDH (private + public).
   * - Private: giữ trong bộ nhớ client/peer, không gửi đi.
   * - Public: export dạng JWK string → gửi trong REGISTER để peer khác derive AES.
   */
  async function generateIdentityKeyPair(): Promise<{ privateKey: CryptoKey; publicJwkString: string }> {
    const keyPair = await subtle.generateKey({ name: 'ECDH', namedCurve: CURVE }, true, ['deriveKey'])
    const jwk = await subtle.exportKey('jwk', keyPair.publicKey)
    return { privateKey: keyPair.privateKey, publicJwkString: JSON.stringify(jwk) }
  }

  /** Nhập khóa công khai của peer từ chuỗi JWK (đã lưu trong PeerInfo.publicKeyJwk). */
  async function importPublicKeyFromJwk(publicJwkString: string): Promise<CryptoKey> {
    const jwk = JSON.parse(publicJwkString) as JsonWebKey
    return subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: CURVE }, false, [])
  }

  /**
   * Từ khóa riêng của mình + chuỗi JWK public của peer → khóa AES-256 dùng chung cho cặp hội thoại.
   * ECDH đối xứng: A(privA, pubB) và B(privB, pubA) cho cùng một shared secret → cùng một AES key.
   */
  async function deriveSharedAesKey(privateKey: CryptoKey, peerPublicJwkString: string): Promise<CryptoKey> {
    const peerPublic = await importPublicKeyFromJwk(peerPublicJwkString)
    return subtle.deriveKey(
      { name: 'ECDH', public: peerPublic },
      privateKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    )
  }

  /**
   * Mã hóa plaintext UTF-8 bằng AES-GCM.
   * - IV 12 byte: chuẩn GCM; mỗi tin dùng IV mới (getRandomValues) để không lộ pattern.
   * - Trả về base64 để nhét vào ChatPrivatePayload (JSON).
   */
  async function encryptWithAesGcm(
    aesKey: CryptoKey,
    plaintext: string
  ): Promise<{ ciphertextB64: string; ivB64: string }> {
    const iv = new Uint8Array(12)
    getRandomValues(iv)
    const enc = new TextEncoder()
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, enc.encode(plaintext))
    const ctBytes = new Uint8Array(ct)
    return { ciphertextB64: bytesToBase64(ctBytes), ivB64: bytesToBase64(iv) }
  }

  /**
   * Giải mã: cần đúng IV đã dùng lúc encrypt + cùng khóa AES derive từ cặp ECDH.
   */
  async function decryptWithAesGcm(aesKey: CryptoKey, ciphertextB64: string, ivB64: string): Promise<string> {
    const iv = new Uint8Array(base64ToBytes(ivB64))
    const raw = new Uint8Array(base64ToBytes(ciphertextB64))
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, raw)
    return new TextDecoder().decode(pt)
  }

  return {
    generateIdentityKeyPair,
    importPublicKeyFromJwk,
    deriveSharedAesKey,
    encryptWithAesGcm,
    decryptWithAesGcm,
  }
}
