// src/services/groupService.ts
// Service singleton quản lý tính năng nhóm
// Server (Tracker) chỉ quản lý metadata nhóm (tạo/join/leave)
// Tin nhắn nhóm được gửi TRỰC TIẾP giữa các peer (P2P)

import { io, Socket } from 'socket.io-client'
import socketService from './socketService'
import {
  MessageType,
  PeerInfo,
  BaseMessage,
  GroupActionPayload,
  ChatGroupPayload,
  GroupLeaveNotifyPayload
} from '@shared/types'

// -------------------------------------------------------------------------
// INTERFACES
// -------------------------------------------------------------------------

export interface GroupInfo {
  groupId: string
  groupName: string
  memberIds: string[]
}

export interface GroupMessage {
  id: string
  groupId: string
  senderId: string
  senderName: string
  content: string
  time: string
  isMe: boolean
}

// -------------------------------------------------------------------------
// CALLBACK TYPES
// -------------------------------------------------------------------------

type GroupListCallback = (groups: GroupInfo[]) => void
type GroupMessageCallback = (msg: GroupMessage) => void
type GroupLeaveCallback = (data: { groupId: string; peerId: string; username: string }) => void

// -------------------------------------------------------------------------
// GROUP SERVICE — Singleton Pattern
// -------------------------------------------------------------------------

class GroupService {
  private _groups: Map<string, GroupInfo> = new Map()
  private _initialized = false

  // Cache các kết nối P2P trực tiếp tới peer khác (dùng chung với socketService)
  private peerConnections: Map<string, Socket> = new Map()

  // Event listeners
  private groupListListeners: GroupListCallback[] = []
  private groupMessageListeners: GroupMessageCallback[] = []
  private groupLeaveListeners: GroupLeaveCallback[] = []

  // -----------------------------------------------------------------------
  // GETTERS
  // -----------------------------------------------------------------------

  get groups(): GroupInfo[] {
    return Array.from(this._groups.values())
  }

  getGroup(groupId: string): GroupInfo | undefined {
    return this._groups.get(groupId)
  }

  // -----------------------------------------------------------------------
  // INIT — Đăng ký lắng nghe sự kiện nhóm
  // -----------------------------------------------------------------------

  init(): void {
    if (this._initialized) return
    this._initialized = true

    const socket = socketService.getSocket()
    if (!socket) {
      console.warn('[GroupService] Socket not available yet. Will init on next call.')
      this._initialized = false
      return
    }

    // --- Event từ Server (Tracker): Metadata nhóm ---
    // Server chỉ gửi thông tin tạo/join/leave nhóm, KHÔNG relay tin nhắn

    // Được thêm vào nhóm / Cập nhật nhóm
    socket.on(MessageType.GROUP_JOIN, (msg: BaseMessage<GroupActionPayload>) => {
      const group: GroupInfo = {
        groupId: msg.payload.groupId,
        groupName: msg.payload.groupName || '',
        memberIds: msg.payload.memberIds
      }
      this._groups.set(group.groupId, group)
      console.log(`[GroupService] Joined/Updated group: "${group.groupName}"`)
      this.notifyGroupListListeners()

      // Proactively tạo P2P connections tới tất cả thành viên để nhận tin nhắn ngược lại
      // Đây là chìa khoá để UI nhận được CHAT_GROUP từ các peer khác
      group.memberIds.forEach(memberId => {
        if (memberId === socketService.selfId) return
        const targetPeer = socketService.peers.find(p => p.id === memberId)
        if (targetPeer) {
          this.getOrCreatePeerConnection(targetPeer)
        }
      })
    })

    // Thành viên rời nhóm
    socket.on(MessageType.GROUP_LEAVE, (msg: BaseMessage<GroupLeaveNotifyPayload>) => {
      const { groupId, peerId, username } = msg.payload

      if (peerId === socketService.selfId) {
        this._groups.delete(groupId)
        console.log(`[GroupService] You left group ${groupId}`)
      } else {
        const group = this._groups.get(groupId)
        if (group) {
          group.memberIds = group.memberIds.filter(id => id !== peerId)
          console.log(`[GroupService] ${username} left group "${group.groupName}"`)
        }
      }

      this.notifyGroupListListeners()
      this.notifyGroupLeaveListeners({ groupId, peerId, username })
    })

    // Nhận tin nhắn nhóm relay từ server (dành cho browser clients)
    // Browser client không thể host peer server nên nhận qua bootstrap socket
    socket.on(MessageType.CHAT_GROUP, (msg: BaseMessage<ChatGroupPayload>) => {
      this.handleIncomingGroupMessage(msg)
    })
  }

  // -----------------------------------------------------------------------
  // P2P CONNECTION — Tạo/lấy kết nối trực tiếp tới peer
  // -----------------------------------------------------------------------

  private getOrCreatePeerConnection(targetPeer: PeerInfo): Socket {
    let peerSocket = this.peerConnections.get(targetPeer.id)

    if (!peerSocket || !peerSocket.connected) {
      const rawIp = targetPeer.ip
      const isLocal = rawIp.includes('127.0.0.1') || rawIp === '::1' || rawIp === '::ffff:127.0.0.1'
      const safeIp = isLocal ? 'localhost' : rawIp
      const peerUrl = `http://${safeIp}:${targetPeer.port}`

      console.log(`[GroupService] 🌐 Creating P2P connection to ${targetPeer.username} (${peerUrl})...`)

      peerSocket = io(peerUrl, {
        transports: ['websocket', 'polling'],
        timeout: 5000
      })

      this.peerConnections.set(targetPeer.id, peerSocket)

      // Lắng nghe tin nhắn nhóm chiều ngược lại qua kết nối P2P này
      peerSocket.on(MessageType.CHAT_GROUP, (msg: BaseMessage<ChatGroupPayload>) => {
        this.handleIncomingGroupMessage(msg)
      })

      peerSocket.on('connect', () => {
        console.log(`[GroupService] ✅ P2P Connected to ${targetPeer.username}`)
        // Gửi định danh ngay khi kết nối để peer biết socket này là của ai
        // Peer sẽ dùng thông tin này để gửi CHAT_GROUP ngược lại
        peerSocket!.emit('PEER_IDENTIFY', { peerId: socketService.selfId })
      })

      peerSocket.on('connect_error', (err) => {
        console.error(`[GroupService] ❌ P2P Error to ${targetPeer.username}:`, err.message)
      })
    }

    return peerSocket
  }


  // Xử lý tin nhắn nhóm nhận được qua kết nối P2P
  private handleIncomingGroupMessage(msg: BaseMessage<ChatGroupPayload>): void {
    const senderInfo = socketService.peers.find(p => p.id === msg.senderId)
    const senderName = senderInfo ? senderInfo.username : msg.senderId.slice(0, 8)

    const groupMsg: GroupMessage = {
      id: msg.messageId,
      groupId: msg.payload.groupId,
      senderId: msg.senderId,
      senderName,
      content: msg.payload.content,
      time: new Date(msg.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      isMe: false
    }

    console.log(`[GroupService] 📥 P2P group message from ${senderName} in group ${msg.payload.groupId}`)
    this.notifyGroupMessageListeners(groupMsg)
  }

  // -----------------------------------------------------------------------
  // CREATE GROUP — Tạo nhóm mới (gửi tới Server Tracker)
  // -----------------------------------------------------------------------

  createGroup(name: string, memberIds: string[]): Promise<{ success: boolean; groupId?: string }> {
    this.init()

    return new Promise((resolve) => {
      const socket = socketService.getSocket()
      if (!socket) {
        resolve({ success: false })
        return
      }

      const msg: BaseMessage<GroupActionPayload> = {
        version: '1.0',
        type: MessageType.GROUP_CREATE,
        senderId: socketService.selfId,
        timestamp: Date.now(),
        messageId: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        payload: {
          groupId: '',
          groupName: name,
          memberIds
        }
      }

      socket.emit(MessageType.GROUP_CREATE, msg, (response: any) => {
        if (response?.success) {
          console.log(`[GroupService] Group created: ${response.groupId}`)
          resolve({ success: true, groupId: response.groupId })
        } else {
          resolve({ success: false })
        }
      })
    })
  }

  // -----------------------------------------------------------------------
  // INVITE MEMBER — Thêm thành viên vào nhóm đã tạo
  // -----------------------------------------------------------------------

  inviteMember(groupId: string, peerId: string): Promise<{ success: boolean }> {
    return new Promise((resolve) => {
      const socket = socketService.getSocket()
      const group = this._groups.get(groupId)
      if (!socket || !group) {
        resolve({ success: false })
        return
      }

      // Gửi GROUP_JOIN với groupId đã có — server sẽ thêm peerId vào nhóm
      const msg: BaseMessage<GroupActionPayload> = {
        version: '1.0',
        type: MessageType.GROUP_JOIN,
        senderId: socketService.selfId,
        timestamp: Date.now(),
        messageId: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        payload: {
          groupId,
          groupName: group.groupName,
          memberIds: [peerId]
        }
      }

      socket.emit(MessageType.GROUP_JOIN, msg, (response: any) => {
        if (response?.success) {
          console.log(`[GroupService] Invited ${peerId} to group ${groupId}`)
          resolve({ success: true })
        } else {
          resolve({ success: false })
        }
      })
    })
  }

  // -----------------------------------------------------------------------
  // LEAVE GROUP — Rời nhóm (thông báo Server Tracker)
  // -----------------------------------------------------------------------

  leaveGroup(groupId: string): Promise<{ success: boolean }> {
    return new Promise((resolve) => {
      const socket = socketService.getSocket()
      if (!socket) {
        resolve({ success: false })
        return
      }

      const msg: BaseMessage<GroupActionPayload> = {
        version: '1.0',
        type: MessageType.GROUP_LEAVE,
        senderId: socketService.selfId,
        timestamp: Date.now(),
        messageId: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        payload: {
          groupId,
          memberIds: []
        }
      }

      socket.emit(MessageType.GROUP_LEAVE, msg, (response: any) => {
        if (response?.success) {
          this._groups.delete(groupId)
          this.notifyGroupListListeners()
          console.log(`[GroupService] Left group ${groupId}`)
          resolve({ success: true })
        } else {
          resolve({ success: false })
        }
      })
    })
  }

  // -----------------------------------------------------------------------
  // SEND GROUP MESSAGE — Gửi tin nhắn qua server relay
  // Server chỉ chuyển phát (relay) không log nội dung
  // -----------------------------------------------------------------------

  sendGroupMessage(groupId: string, content: string): void {
    const socket = socketService.getSocket()
    if (!socket) return

    const msg: BaseMessage<ChatGroupPayload> = {
      version: '1.0',
      type: MessageType.CHAT_GROUP,
      senderId: socketService.selfId,
      timestamp: Date.now(),
      messageId: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      payload: {
        groupId,
        content
      }
    }

    // Gửi qua bootstrap socket → server relay tới các member
    socket.emit(MessageType.CHAT_GROUP, msg, (ack: any) => {
      if (!ack?.success) {
        console.warn(`[GroupService] Failed to send group message: ${ack?.error}`)
      }
    })
  }

  // -----------------------------------------------------------------------

  // EVENT LISTENERS — Đăng ký/hủy lắng nghe
  // -----------------------------------------------------------------------

  onGroupListUpdate(callback: GroupListCallback): () => void {
    this.groupListListeners.push(callback)
    return () => {
      this.groupListListeners = this.groupListListeners.filter(cb => cb !== callback)
    }
  }

  onGroupMessage(callback: GroupMessageCallback): () => void {
    this.groupMessageListeners.push(callback)
    return () => {
      this.groupMessageListeners = this.groupMessageListeners.filter(cb => cb !== callback)
    }
  }

  onGroupLeave(callback: GroupLeaveCallback): () => void {
    this.groupLeaveListeners.push(callback)
    return () => {
      this.groupLeaveListeners = this.groupLeaveListeners.filter(cb => cb !== callback)
    }
  }

  // -----------------------------------------------------------------------
  // PRIVATE HELPERS
  // -----------------------------------------------------------------------

  private notifyGroupListListeners(): void {
    const groups = this.groups
    this.groupListListeners.forEach(cb => cb(groups))
  }

  private notifyGroupMessageListeners(msg: GroupMessage): void {
    this.groupMessageListeners.forEach(cb => cb(msg))
  }

  private notifyGroupLeaveListeners(data: { groupId: string; peerId: string; username: string }): void {
    this.groupLeaveListeners.forEach(cb => cb(data))
  }
}

// Export singleton instance
const groupService = new GroupService()
export default groupService
