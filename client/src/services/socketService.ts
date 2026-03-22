// src/services/socketService.ts
// Service singleton quản lý kết nối Socket.IO giữa Frontend ↔ Bootstrap Server

import { io, Socket } from 'socket.io-client'

import {
  MessageType,
  PeerInfo,
  BaseMessage,
  RegisterPayload,
  DiscoveryResPayload,
  ChatPrivatePayload
} from '@shared/types'

export interface RegisterResponse {
  success: boolean
  peers: PeerInfo[]
  selfId: string
}

// -------------------------------------------------------------------------
// SOCKET SERVICE — Singleton Pattern
// -------------------------------------------------------------------------

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

// Callback types cho các event listeners
type PeerListCallback = (peers: PeerInfo[]) => void
type MessageCallback = (msg: BaseMessage<ChatPrivatePayload>) => void
type StatusCallback = (status: ConnectionStatus) => void

class SocketService {
  private socket: Socket | null = null
  private _status: ConnectionStatus = 'disconnected'
  private _selfId: string = ''
  private _username: string = ''
  private _peers: PeerInfo[] = []

  // Event listeners
  private peerListListeners: PeerListCallback[] = []
  private messageListeners: MessageCallback[] = []
  private statusListeners: StatusCallback[] = []

  // -----------------------------------------------------------------------
  // GETTERS — Truy cập trạng thái hiện tại
  // -----------------------------------------------------------------------

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

  // -----------------------------------------------------------------------
  // CONNECT — Kết nối tới Bootstrap Server và đăng ký peer
  // -----------------------------------------------------------------------

  connect(serverUrl: string, username: string, port: number): Promise<RegisterResponse> {
    return new Promise((resolve, reject) => {
      // Ngắt kết nối cũ nếu có
      if (this.socket) {
        this.socket.disconnect()
      }

      this._username = username
      this.setStatus('connecting')

      console.log(`[SocketService] Connecting to Bootstrap Server: ${serverUrl}`)

      // Khởi tạo Socket.IO client
      this.socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        timeout: 10000,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
      })

      // --- Event: Kết nối thành công ---
      this.socket.on('connect', () => {
        console.log(`[SocketService] Connected to server. Socket ID: ${this.socket?.id}`)

        // Tạo message đăng ký theo chuẩn BaseMessage
        const registerMsg: BaseMessage<RegisterPayload> = {
          version: '1.0',
          type: MessageType.REGISTER,
          senderId: 'unknown', // Server sẽ gán ID thực
          timestamp: Date.now(),
          messageId: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          payload: {
            username,
            port,
          },
        }

        // Emit REGISTER với callback
        this.socket!.emit(MessageType.REGISTER, registerMsg, (response: RegisterResponse) => {
          if (response.success) {
            this._selfId = response.selfId
            this._peers = response.peers
            this.setStatus('connected')

            console.log(`[SocketService] Registered successfully! ID: ${response.selfId}`)
            console.log(`[SocketService] Found ${response.peers.length} peers online.`)

            // Thông báo cho listeners
            this.notifyPeerListListeners()
            resolve(response)
          } else {
            this.setStatus('error')
            reject(new Error('Registration failed'))
          }
        })
      })

      // --- Event: Nhận cập nhật danh sách peers ---
      this.socket.on(MessageType.DISCOVERY_RES, (msg: BaseMessage<DiscoveryResPayload>) => {
        // Lọc bỏ bản thân ra khỏi danh sách
        this._peers = msg.payload.peers.filter((p) => p.id !== this._selfId)
        console.log(`[SocketService] Peer list updated: ${this._peers.length} online.`)
        this.notifyPeerListListeners()
      })

      // --- Event: Nhận tin nhắn trực tiếp ---
      this.socket.on(MessageType.CHAT_PRIVATE, (msg: BaseMessage<ChatPrivatePayload>) => {
        console.log(`[SocketService] Message from ${msg.senderId}: ${msg.payload.content}`)
        this.notifyMessageListeners(msg)
      })

      // --- Event: Lỗi kết nối ---
      this.socket.on('connect_error', (err: Error) => {
        console.error(`[SocketService] Connection error:`, err.message)
        this.setStatus('error')
        reject(err)
      })

      // --- Event: Mất kết nối ---
      this.socket.on('disconnect', (reason: string) => {
        console.log(`[SocketService] Disconnected: ${reason}`)
        this.setStatus('disconnected')
      })

      // --- Event: Tự động reconnect ---
      this.socket.on('reconnect', () => {
        console.log(`[SocketService] Reconnected!`)
        this.setStatus('connected')
      })
    })
  }

  // Cache direct connections to other peers
  private activePeerConnections: Map<string, Socket> = new Map()

  // -----------------------------------------------------------------------
  // SEND MESSAGE — Gửi tin nhắn trực tiếp đến 1 peer
  // -----------------------------------------------------------------------

  sendPrivateMessage(receiverId: string, content: string): void {
    if (!this._selfId) {
      console.warn('[SocketService] Cannot send message: Not registered yet')
      return
    }

    // 1. Tìm thông tin IP và Cổng của người nhận từ danh sách Peers
    const targetPeer = this._peers.find(p => p.id === receiverId)
    if (!targetPeer) {
      console.error(`[SocketService] Cannot find peer with ID ${receiverId}`)
      return
    }

    // 2. Tạo gói tin theo chuẩn giao thức
    const msg: BaseMessage<ChatPrivatePayload> = {
      version: '1.0',
      type: MessageType.CHAT_PRIVATE,
      senderId: this._selfId,
      timestamp: Date.now(),
      messageId: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      payload: {
        receiverId,
        content,
      },
    }

    // 3. Kiểm tra xem đã có kết nối Socket.IO trực tiếp với peer này chưa
    let peerSocket = this.activePeerConnections.get(receiverId)

    // Nếu chưa có kết nối hoặc kết nối đã chết, tạo mới:
    if (!peerSocket || !peerSocket.connected) {
      // Xử lý an toàn các định dạng localhost/IPv6 để trình duyệt không báo lỗi URL
      const rawIp = targetPeer.ip
      const isLocal = rawIp.includes('127.0.0.1') || rawIp === '::1' || rawIp === '::ffff:127.0.0.1'
      const safeIp = isLocal ? 'localhost' : rawIp
      const peerUrl = `http://${safeIp}:${targetPeer.port}`
      
      console.log(`[SocketService] 🌐 Initiating Direct P2P connection to ${peerUrl}...`)
      
      peerSocket = io(peerUrl, {
        transports: ['websocket', 'polling'],
        timeout: 5000
      })

      // Lưu vào cache
      this.activePeerConnections.set(receiverId, peerSocket)

      // Lắng nghe trạng thái
      peerSocket.on('connect', () => {
        console.log(`[SocketService] ✅ P2P Connected to ${targetPeer.username}.`)
      })

      peerSocket.on('connect_error', (err) => {
        console.error(`[SocketService] ❌ P2P Connection Error to ${targetPeer.username}:`, err.message)
      })

      // Thiết lập lắng nghe tin nhắn chiều ngược lại
      peerSocket.on(MessageType.CHAT_PRIVATE, (incomingMsg: BaseMessage<ChatPrivatePayload>) => {
        console.log(`[SocketService] 📥 Received direct message from ${incomingMsg.senderId}`)
        this.notifyMessageListeners(incomingMsg)
      })
    }

    // Gửi tin nhắn. Socket.IO tự động buffer (lưu tạm) lệnh emit này nếu chưa kết nối xong, 
    // và sẽ tự động nhả ra ngay khi 'connect' thành công. Không lo race condition.
    console.log(`[SocketService] ⚡ Emitting P2P message to ${targetPeer.username}...`)
    peerSocket.emit(MessageType.CHAT_PRIVATE, msg, (ack: any) => {
      console.log(`[SocketService] 📨 Message ACK from ${targetPeer.username}:`, ack)
    })
  }

  // -----------------------------------------------------------------------
  // DISCONNECT — Ngắt kết nối
  // -----------------------------------------------------------------------

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }

    // Disconnect all P2P connections
    this.activePeerConnections.forEach((socket) => socket.disconnect())
    this.activePeerConnections.clear()

    this._peers = []
    this._selfId = ''
    this.setStatus('disconnected')
    console.log('[SocketService] Disconnected from server and all peers.')
  }

  // -----------------------------------------------------------------------
  // EVENT LISTENERS — Đăng ký/hủy lắng nghe sự kiện
  // -----------------------------------------------------------------------

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

  // -----------------------------------------------------------------------
  // PRIVATE HELPERS
  // -----------------------------------------------------------------------

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

// Export singleton instance
const socketService = new SocketService()
export default socketService
