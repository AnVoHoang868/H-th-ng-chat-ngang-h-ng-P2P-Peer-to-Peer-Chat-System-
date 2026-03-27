// src/services/socketService.ts
// Service singleton quản lý kết nối Socket.IO giữa Frontend ↔ Bootstrap Server

import { io, Socket } from 'socket.io-client'

import {
  MessageType,
  PeerInfo,
  BaseMessage,
  RegisterPayload,
  DiscoveryResPayload,
  DiscoveryReqPayload,
  ChatPrivatePayload,
  HeartbeatPayload,
  NodeOfflinePayload,
  AckPayload,
} from '@shared/types'
import { createE2eeOperations } from '@shared/e2eeOperations'

/**
 * Factory E2EE dùng chung `src/shared/e2eeOperations.ts`.
 * - `subtle`: Web Crypto của trình duyệt (HTTPS / localhost đều có).
 * - `getRandomValues`: truyền tường minh để IV AES-GCM dùng cùng nguồn RNG với môi trường (tránh lệ thuộc ngầm vào `globalThis.crypto` nếu sau này test SSR).
 */
const e2ee = createE2eeOperations(globalThis.crypto.subtle, {
  getRandomValues: (buf) => globalThis.crypto.getRandomValues(buf),
})

export interface RegisterResponse {
  success: boolean
  peers: PeerInfo[]
  selfId: string
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

type PeerListCallback = (peers: PeerInfo[]) => void
type MessageCallback = (msg: BaseMessage<ChatPrivatePayload>) => void
type StatusCallback = (status: ConnectionStatus) => void
type NodeOfflineCallback = (offlinePeerId: string) => void
type AckCallback = (ack: BaseMessage<AckPayload>) => void

const HEARTBEAT_INTERVAL_MS = 15000

class SocketService {
  private socket: Socket | null = null
  private _status: ConnectionStatus = 'disconnected'
  private _selfId: string = ''
  private _username: string = ''
  /** Cổng bootstrap đã dùng khi đăng ký — trùng với PeerInfo.port của client web (không có server P2P riêng). */
  private _trackerPort: number = 4000
  /**
   * Khóa riêng identity ECDH (P-256), sinh một lần sau mỗi lần `connect` → REGISTER.
   * Không bao giờ gửi lên mạng; chỉ dùng cục bộ để derive AES với public key của peer (đã lấy từ DISCOVERY).
   */
  private _privateIdentityKey: CryptoKey | null = null
  /**
   * Cache khóa AES-256-GCM đã derive cho từng cặp (self ↔ peer).
   * - Key Map = `peer.id` (socket id bên tracker).
   * - Lưu thêm `publicJwkSnapshot`: nếu cùng id mà tracker phát JWK mới (peer đăng ký lại hiếm khi trùng id — chủ yếu phòng tương lai), ta derive lại thay vì dùng khóa cũ.
   * - `syncAesKeyCacheWithPeers()` xóa entry cho peer không còn trong `_peers` sau mỗi lần discovery cập nhật.
   */
  private aesKeyByPeerId = new Map<string, { key: CryptoKey; publicJwkSnapshot: string }>()
  private _peers: PeerInfo[] = []
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null

  private peerListListeners: PeerListCallback[] = []
  private messageListeners: MessageCallback[] = []
  private statusListeners: StatusCallback[] = []
  private nodeOfflineListeners: NodeOfflineCallback[] = []
  private ackListeners: AckCallback[] = []

  get status(): ConnectionStatus {
    return this._status
  }

  get selfId(): string {
    return this._selfId
  }

  get username(): string {
    return this._username
  }

  get peers(): PeerInfo[] {
    return this._peers
  }

  get isConnected(): boolean {
    return this._status === 'connected' && this.socket?.connected === true
  }

  getSocket(): Socket | null {
    return this.socket
  }

  /** Yêu cầu server trả lại danh sách peer (REGISTER + DISCOVERY_RES đã đủ; dùng khi cần refresh thủ công) */
  requestDiscovery(): void {
    if (!this.socket?.connected || !this._selfId) return
    const req: BaseMessage<DiscoveryReqPayload> = {
      version: '1.0',
      type: MessageType.DISCOVERY_REQ,
      senderId: this._selfId,
      timestamp: Date.now(),
      messageId: `disc_${Date.now()}`,
      payload: {},
    }
    this.socket.emit(MessageType.DISCOVERY_REQ, req, (res: { success: boolean; peers: PeerInfo[] }) => {
      if (res?.success && Array.isArray(res.peers)) {
        this._peers = res.peers.filter((p) => p.id !== this._selfId)
        this.syncAesKeyCacheWithPeers() // peer biến mất khỏi danh sách → bỏ cache AES tương ứng
        this.notifyPeerListListeners()
      }
    })
  }

  connect(serverUrl: string, username: string, port: number): Promise<RegisterResponse> {
    return new Promise((resolve, reject) => {
      if (this.socket) {
        this.stopHeartbeat()
        this.socket.disconnect()
      }

      this._username = username
      this._trackerPort = port
      this.setStatus('connecting')

      console.log(`[SocketService] Connecting to Bootstrap Server: ${serverUrl}`)

      this.socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        timeout: 10000,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
      })

      this.socket.on('connect', () => {
        // Bất đồng bộ: sinh cặp ECDH trước khi REGISTER — public JWK đưa vào payload để mọi peer trong mạng biết khóa công khai của mình (directory trên tracker).
        void (async () => {
          console.log(`[SocketService] Connected to server. Socket ID: ${this.socket?.id}`)

          const { privateKey, publicJwkString } = await e2ee.generateIdentityKeyPair()
          this._privateIdentityKey = privateKey
          this.aesKeyByPeerId.clear() // phiên mới / reconnect: không tái sử dụng AES đã derive từ lần đăng ký trước

          const registerMsg: BaseMessage<RegisterPayload> = {
            version: '1.0',
            type: MessageType.REGISTER,
            senderId: 'unknown',
            timestamp: Date.now(),
            messageId: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            payload: {
              username,
              port,
              // Tracker chỉ lưu chuỗi JWK vào PeerInfo.publicKeyJwk và phát lại qua DISCOVERY — không có private key nên không đọc được tin E2EE.
              publicKeyJwk: publicJwkString,
            },
          }

          this.socket!.emit(MessageType.REGISTER, registerMsg, (response: RegisterResponse) => {
            if (response.success) {
              this._selfId = response.selfId
              this._peers = response.peers
              this.syncAesKeyCacheWithPeers()
              this.setStatus('connected')
              this.startHeartbeat()

              console.log(`[SocketService] Registered successfully! ID: ${response.selfId}`)
              console.log(`[SocketService] Peers in registry: ${response.peers.length}.`)

              this.notifyPeerListListeners()
              resolve(response)
            } else {
              this.setStatus('error')
              reject(new Error('Registration failed'))
            }
          })
        })().catch((err) => {
          console.error('[SocketService] E2EE keygen / register failed', err)
          this.setStatus('error')
          reject(err)
        })
      })

      this.socket.on(MessageType.DISCOVERY_RES, (msg: BaseMessage<DiscoveryResPayload>) => {
        this._peers = msg.payload.peers.filter((p) => p.id !== this._selfId)
        // Peer rời mạng / đổi danh sách: gỡ cache AES cho id không còn; id vẫn còn nhưng JWK đổi thì getAesForPeer so khớp snapshot.
        this.syncAesKeyCacheWithPeers()
        console.log(`[SocketService] Peer list updated: ${this._peers.length} entries (online + offline).`)
        this.notifyPeerListListeners()
      })

      this.socket.on(MessageType.NODE_OFFLINE, (msg: BaseMessage<NodeOfflinePayload>) => {
        console.log(`[SocketService] NODE_OFFLINE: ${msg.payload.offlinePeerId}`)
        this.nodeOfflineListeners.forEach((cb) => cb(msg.payload.offlinePeerId))
      })

      /**
       * Tin 1-1 relay qua bootstrap: server chỉ chuyển tiếp gói (có thể `aes-gcm-v1`).
       * Giải mã ở đây rồi mới `notifyMessageListeners` — ChatPage luôn nhận `payload.content` plaintext hoặc chuỗi lỗi thân thiện.
       */
      this.socket.on(MessageType.CHAT_PRIVATE, (msg: BaseMessage<ChatPrivatePayload>) => {
        void this.handleIncomingPrivateMessage(msg, 'tracker')
      })

      this.socket.on('connect_error', (err: Error) => {
        console.error(`[SocketService] Connection error:`, err.message)
        this.setStatus('error')
        reject(err)
      })

      this.socket.on('disconnect', (reason: string) => {
        console.log(`[SocketService] Disconnected: ${reason}`)
        this.stopHeartbeat()
        this.setStatus('disconnected')
      })

      this.socket.on('reconnect', () => {
        console.log(`[SocketService] Reconnected (REGISTER sẽ chạy lại qua sự kiện connect).`)
        this.setStatus('connected')
      })
    })
  }

  private activePeerConnections: Map<string, Socket> = new Map()

  /**
   * Sau mỗi lần cập nhật `_peers` (REGISTER callback, DISCOVERY_RES, DISCOVERY_REQ callback):
   * gỡ khỏi cache các peer id không còn trong danh sách — tránh giữ CryptoKey trỏ tới cặp hội thoại đã kết thúc.
   * (Không xóa toàn bộ cache: peer vẫn online có thể chỉ đổi metadata khác publicKey — khi đó `getAesForPeer` so `publicJwkSnapshot`.)
   */
  private syncAesKeyCacheWithPeers(): void {
    const ids = new Set(this._peers.map((p) => p.id))
    for (const id of this.aesKeyByPeerId.keys()) {
      if (!ids.has(id)) this.aesKeyByPeerId.delete(id)
    }
  }

  /**
   * Derive khóa AES dùng cho **cả** mã hóa tới peer và (khi peer đóng vai “đối tượng có pub trong discovery”) giải mã —
   * với **một peer cụ thể** ta luôn dùng `derive(priv_self, pub_peer)`; ECDH đối xứng nên trùng secret với phía kia dùng `derive(priv_peer, pub_self)`.
   *
   * - Gửi tin tới B: gọi với `peer = B` (khóa = ECDH(self, B)).
   * - Nhận tin từ A: trong `decryptIncomingIfNeeded` gọi với `peer = A` (sender trong `_peers`) — cùng khóa phiên với hướng A→B.
   */
  private async getAesForPeer(peer: PeerInfo): Promise<CryptoKey | null> {
    if (!this._privateIdentityKey || !peer.publicKeyJwk) return null
    const snap = peer.publicKeyJwk
    const cached = this.aesKeyByPeerId.get(peer.id)
    if (cached && cached.publicJwkSnapshot === snap) {
      return cached.key
    }
    const k = await e2ee.deriveSharedAesKey(this._privateIdentityKey, peer.publicKeyJwk)
    this.aesKeyByPeerId.set(peer.id, { key: k, publicJwkSnapshot: snap })
    return k
  }

  /**
   * Chuẩn hoá tin đến về dạng plaintext cho UI.
   * - `aes-gcm-v1`: lấy `sender` từ `_peers` theo `msg.senderId` → `getAesForPeer(sender)` = ECDH(priv_self, pub_người_gửi) → `decryptWithAesGcm`.
   * - Thiếu khóa / lỗi crypto: trả về `content` là chuỗi cảnh báo (không throw) để ChatPage vẫn render được.
   * - Plaintext legacy (không `encryption`): trả nguyên `msg`.
   */
  private async decryptIncomingIfNeeded(msg: BaseMessage<ChatPrivatePayload>): Promise<BaseMessage<ChatPrivatePayload>> {
    const p = msg.payload
    if (p.encryption === 'aes-gcm-v1' && p.ciphertextB64 && p.ivB64) {
      const sender = this._peers.find((x) => x.id === msg.senderId)
      if (!sender?.publicKeyJwk || !this._privateIdentityKey) {
        return {
          ...msg,
          payload: {
            receiverId: p.receiverId,
            content: '[Không giải mã E2EE: thiếu khóa công khai peer]',
          },
        }
      }
      try {
        const aes = await this.getAesForPeer(sender)
        if (!aes) throw new Error('no aes key')
        const text = await e2ee.decryptWithAesGcm(aes, p.ciphertextB64, p.ivB64)
        return { ...msg, payload: { receiverId: p.receiverId, content: text } }
      } catch (e) {
        console.error('[SocketService] E2EE decrypt failed', e)
        return {
          ...msg,
          payload: { receiverId: p.receiverId, content: '[Lỗi giải mã E2EE]' },
        }
      }
    }
    return msg
  }

  /**
   * Điểm vào duy nhất cho tin nhận (dù đi qua tracker relay hay socket `io(peerUrl)`).
   * Luồng: decrypt (nếu E2EE) → log → `notifyMessageListeners` — tránh nhân đôi logic decrypt giữa hai nhánh.
   */
  private async handleIncomingPrivateMessage(
    msg: BaseMessage<ChatPrivatePayload>,
    _source: 'tracker' | 'p2p'
  ): Promise<void> {
    const plain = await this.decryptIncomingIfNeeded(msg)
    console.log(`[SocketService] Message from ${plain.senderId}: ${plain.payload.content}`)
    this.notifyMessageListeners(plain)
  }

  /**
   * Gửi tin nhắn riêng tới `receiverId`.
   * - E2EE: khi `_privateIdentityKey` và `targetPeer.publicKeyJwk` đều có → payload `aes-gcm-v1` (tracker/peer chỉ thấy base64).
   * - Relay: nếu `targetPeer.port === _trackerPort` → `emit` trên socket tracker; ngược lại → P2P `io(http://ip:port)`.
   * - Thiếu public key đích: gửi plaintext (tương thích bản không E2EE).
   */
  async sendPrivateMessage(receiverId: string, content: string): Promise<void> {
    if (!this._selfId) {
      console.warn('[SocketService] Cannot send message: Not registered yet')
      return
    }

    const targetPeer = this._peers.find((p) => p.id === receiverId)
    if (!targetPeer) {
      console.error(`[SocketService] Cannot find peer with ID ${receiverId}`)
      return
    }
    if (targetPeer.status !== 'ONLINE') {
      console.warn(`[SocketService] Peer ${targetPeer.username} is OFFLINE — cannot open P2P.`)
      return
    }

    // Mặc định: gửi plaintext (tương thích peer cũ / thiếu khóa). E2EE: ghi đè — không đặt `content` trên dây.
    let payload: ChatPrivatePayload = { receiverId, content }

    if (this._privateIdentityKey && targetPeer.publicKeyJwk) {
      try {
        // Mã hóa với ECDH(self, pub_đích): cùng khóa mà đích sẽ dùng khi giải (derive với pub mình).
        const aes = await this.getAesForPeer(targetPeer)
        if (aes) {
          const enc = await e2ee.encryptWithAesGcm(aes, content)
          payload = {
            receiverId,
            encryption: 'aes-gcm-v1',
            ciphertextB64: enc.ciphertextB64,
            ivB64: enc.ivB64,
          }
        }
      } catch (e) {
        console.error('[SocketService] E2EE encrypt failed, fallback plaintext', e)
      }
    } else if (!targetPeer.publicKeyJwk) {
      console.warn('[SocketService] Peer không có publicKeyJwk — gửi plaintext (legacy).')
    }

    const msg: BaseMessage<ChatPrivatePayload> = {
      version: '1.0',
      type: MessageType.CHAT_PRIVATE,
      senderId: this._selfId,
      timestamp: Date.now(),
      messageId: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      payload,
    }

    // Hai tab browser thường dùng cùng cổng đã join (== `_trackerPort`) — không có server P2P riêng → bắt buộc relay; ciphertext vẫn an toàn (server không có private key).
    if (targetPeer.port === this._trackerPort && this.socket?.connected) {
      console.log(`[SocketService] 📨 CHAT_PRIVATE via tracker relay → ${targetPeer.username}`)
      this.socket.emit(MessageType.CHAT_PRIVATE, msg, (ack: unknown) => {
        console.log(`[SocketService] Tracker ack:`, ack)
      })
      return
    }

    let peerSocket = this.activePeerConnections.get(receiverId)

    if (!peerSocket || !peerSocket.connected) {
      const rawIp = targetPeer.ip
      const isLocal =
        rawIp.includes('127.0.0.1') || rawIp === '::1' || rawIp === '::ffff:127.0.0.1'
      const safeIp = isLocal ? 'localhost' : rawIp
      const peerUrl = `http://${safeIp}:${targetPeer.port}`

      console.log(`[SocketService] 🌐 Initiating Direct P2P connection to ${peerUrl}...`)

      peerSocket = io(peerUrl, {
        transports: ['websocket', 'polling'],
        timeout: 5000,
      })

      this.activePeerConnections.set(receiverId, peerSocket)

      peerSocket.on('connect', () => {
        console.log(`[SocketService] ✅ P2P Connected to ${targetPeer.username}.`)
      })

      peerSocket.on('connect_error', (err) => {
        console.error(`[SocketService] ❌ P2P Connection Error to ${targetPeer.username}:`, err.message)
      })

      peerSocket.on(MessageType.ACK_RECEIVE, (ack: BaseMessage<AckPayload>) => {
        this.ackListeners.forEach((cb) => cb(ack))
      })

      peerSocket.on(MessageType.CHAT_PRIVATE, (incomingMsg: BaseMessage<ChatPrivatePayload>) => {
        // Tin từ peer CLI / cổng riêng: vẫn có thể là `aes-gcm-v1` — dùng chung `handleIncomingPrivateMessage`.
        void this.handleIncomingPrivateMessage(incomingMsg, 'p2p')

        const ackMsg: BaseMessage<AckPayload> = {
          version: '1.0',
          type: MessageType.ACK_RECEIVE,
          senderId: this._selfId,
          timestamp: Date.now(),
          messageId: `ack_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          payload: {
            originalMessageId: incomingMsg.messageId,
            status: 'SUCCESS',
          },
        }
        peerSocket!.emit(MessageType.ACK_RECEIVE, ackMsg)
      })
    }

    console.log(`[SocketService] ⚡ Emitting P2P message to ${targetPeer.username}...`)
    peerSocket.emit(MessageType.CHAT_PRIVATE, msg, (ack: unknown) => {
      console.log(`[SocketService] 📨 Socket.IO ack from ${targetPeer.username}:`, ack)
    })
  }

  disconnect(): void {
    this.stopHeartbeat()
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }

    this.activePeerConnections.forEach((socket) => socket.disconnect())
    this.activePeerConnections.clear()

    this._privateIdentityKey = null
    this.aesKeyByPeerId.clear() // session mới sẽ sinh identity key + derive AES mới sau khi user connect lại
    this._peers = []
    this._selfId = ''
    this.setStatus('disconnected')
    console.log('[SocketService] Disconnected from server and all peers.')
  }

  onPeerListUpdate(callback: PeerListCallback): () => void {
    this.peerListListeners.push(callback)
    return () => {
      this.peerListListeners = this.peerListListeners.filter((cb) => cb !== callback)
    }
  }

  onMessage(callback: MessageCallback): () => void {
    this.messageListeners.push(callback)
    return () => {
      this.messageListeners = this.messageListeners.filter((cb) => cb !== callback)
    }
  }

  onStatusChange(callback: StatusCallback): () => void {
    this.statusListeners.push(callback)
    return () => {
      this.statusListeners = this.statusListeners.filter((cb) => cb !== callback)
    }
  }

  onNodeOffline(callback: NodeOfflineCallback): () => void {
    this.nodeOfflineListeners.push(callback)
    return () => {
      this.nodeOfflineListeners = this.nodeOfflineListeners.filter((cb) => cb !== callback)
    }
  }

  onAckReceive(callback: AckCallback): () => void {
    this.ackListeners.push(callback)
    return () => {
      this.ackListeners = this.ackListeners.filter((cb) => cb !== callback)
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (!this.socket?.connected || !this._selfId) return
      const hb: BaseMessage<HeartbeatPayload> = {
        version: '1.0',
        type: MessageType.HEARTBEAT,
        senderId: this._selfId,
        timestamp: Date.now(),
        messageId: `hb_${Date.now()}`,
        payload: { status: 'ONLINE' },
      }
      this.socket.emit(MessageType.HEARTBEAT, hb)
    }, HEARTBEAT_INTERVAL_MS)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private setStatus(status: ConnectionStatus): void {
    this._status = status
    this.statusListeners.forEach((cb) => cb(status))
  }

  private notifyPeerListListeners(): void {
    this.peerListListeners.forEach((cb) => cb(this._peers))
  }

  private notifyMessageListeners(msg: BaseMessage<ChatPrivatePayload>): void {
    this.messageListeners.forEach((cb) => cb(msg))
  }
}

const socketService = new SocketService()
export default socketService
