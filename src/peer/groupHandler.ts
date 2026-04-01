// src/peer/groupHandler.ts
// Xử lý logic nhóm phía Peer (CLI node)
// Tin nhắn nhóm được gửi TRỰC TIẾP giữa các peer (P2P), KHÔNG qua server

import { Socket as ClientSocket } from 'socket.io-client';
import { Server, Socket as ServerSocket } from 'socket.io';
import {
    PeerInfo,
    MessageType,
    BaseMessage,
    GroupActionPayload,
    ChatGroupPayload,
    GroupLeaveNotifyPayload
} from '../shared/types';
import * as crypto from 'crypto';

// Bộ nhớ cục bộ lưu danh sách nhóm của peer này
const myGroups = new Map<string, GroupActionPayload>();

// Lưu kết nối đến (incoming) từ các peer khác (để gửi lại tin nhắn)
const incomingPeerSockets = new Map<string, ServerSocket>();

// -------------------------------------------------------------------------
// ĐĂNG KÝ CÁC HANDLER NHÓM CHO PEER NODE
// -------------------------------------------------------------------------

export function registerPeerGroupHandlers(
    bootstrapClient: ClientSocket,
    peerServer: Server,
    myPeerInfo: Partial<PeerInfo>,
    knownPeersRef: { peers: PeerInfo[] },
    activeConnections: Map<string, ClientSocket>
) {

    // -----------------------------------------------------------------
    // Lắng nghe GROUP_JOIN từ Server (Tracker) — Được thêm vào nhóm
    // Server chỉ gửi metadata nhóm, KHÔNG relay tin nhắn
    // -----------------------------------------------------------------
    bootstrapClient.on(MessageType.GROUP_JOIN, (msg: BaseMessage<GroupActionPayload>) => {
        const group = msg.payload;
        myGroups.set(group.groupId, group);
        console.log(`\n[👥 GROUP] Joined group: "${group.groupName}" (${group.memberIds.length} members)`);
    });

    // -----------------------------------------------------------------
    // Lắng nghe GROUP_LEAVE từ Server (Tracker) — Thành viên rời nhóm
    // -----------------------------------------------------------------
    bootstrapClient.on(MessageType.GROUP_LEAVE, (msg: BaseMessage<GroupLeaveNotifyPayload>) => {
        const { groupId, peerId, username } = msg.payload;
        const group = myGroups.get(groupId);

        if (group) {
            if (peerId === myPeerInfo.id) {
                myGroups.delete(groupId);
                console.log(`\n[👥 GROUP] You left group: "${group.groupName}"`);
            } else {
                group.memberIds = group.memberIds.filter(id => id !== peerId);
                console.log(`\n[👥 GROUP] ${username} left group: "${group.groupName}"`);
            }
        }
    });

    // -----------------------------------------------------------------
    // Lắng nghe CHAT_GROUP từ Server (Relay) 
    // Do Browser clients không thể gửi P2P trực tiếp, họ phải gửi qua Server relay.
    // Vì vậy CLI peer cũng cần lắng nghe relay từ Server tại đây.
    // -----------------------------------------------------------------
    bootstrapClient.on(MessageType.CHAT_GROUP, (msg: BaseMessage<ChatGroupPayload>) => {
        const group = myGroups.get(msg.payload.groupId);
        const groupName = group?.groupName || msg.payload.groupId;
        let senderName = msg.senderId;

        // Thử tìm tên sender trong danh sách known peers
        const senderInfo = knownPeersRef.peers.find(p => p.id === msg.senderId);
        if (senderInfo) {
            senderName = senderInfo.username;
        }

        console.log(`\n💬 [Group "${groupName}"] ${senderName}: ${msg.payload.content}`);
    });

    // -----------------------------------------------------------------
    // Lắng nghe CHAT_GROUP trực tiếp từ Peer khác (P2P)
    // Khi peer khác kết nối tới peer server và gửi tin nhắn nhóm
    // -----------------------------------------------------------------
    peerServer.on('connection', (socket: ServerSocket) => {

        // Khi peer kết nối, họ có thể tự định danh ngay
        // (Browser client không có server nên cần làm vậy để nhận CHAT_GROUP ngược lại)
        socket.on('PEER_IDENTIFY', ({ peerId }: { peerId: string }) => {
            incomingPeerSockets.set(peerId, socket);
            console.log(`\n[👥 GROUP] Peer identified: ${peerId.slice(0, 8)}... mapped to socket ${socket.id.slice(0, 6)}`);
        });

        socket.on(MessageType.CHAT_GROUP, (msg: BaseMessage<ChatGroupPayload>, callback) => {
            const group = myGroups.get(msg.payload.groupId);
            const groupName = group?.groupName || msg.payload.groupId;
            console.log(`\n💬 [Group "${groupName}"] ${msg.senderId}: ${msg.payload.content}`);

            // Lưu lại socket incoming để có thể gửi lại cho peer này
            incomingPeerSockets.set(msg.senderId, socket);

            // ACK cho peer gửi
            if (typeof callback === 'function') {
                callback({ status: 'OK', originalMessageId: msg.messageId });
            }
        });

        socket.on('disconnect', () => {
            // Dọn dẹp incoming socket khi ngắt kết nối
            for (const [peerId, s] of incomingPeerSockets.entries()) {
                if (s.id === socket.id) {
                    incomingPeerSockets.delete(peerId);
                    break;
                }
            }
        });
    });

}

// -------------------------------------------------------------------------
// GỬI TIN NHẮN NHÓM — Gửi TRỰC TIẾP tới từng peer trong nhóm (P2P)
// Ưu tiên outgoing connections, fallback sang incoming, cuối cùng tạo mới
// -------------------------------------------------------------------------

export function sendGroupMessage(
    myPeerInfo: Partial<PeerInfo>,
    knownPeersRef: { peers: PeerInfo[] },
    activeConnections: Map<string, ClientSocket>,
    groupId: string,
    content: string
) {
    const group = myGroups.get(groupId);
    if (!group) {
        console.log(`[!] Group ${groupId} not found.`);
        return;
    }

    const msg: BaseMessage<ChatGroupPayload> = {
        version: "1.0",
        type: MessageType.CHAT_GROUP,
        senderId: myPeerInfo.id || "unknown",
        timestamp: Date.now(),
        messageId: crypto.randomUUID ? crypto.randomUUID() : `msg_${Date.now()}`,
        payload: {
            groupId,
            content
        }
    };

    console.log(`[Group "${group.groupName}"] Sending message P2P to ${group.memberIds.length - 1} members...`);

    group.memberIds.forEach(memberId => {
        if (memberId === myPeerInfo.id) return;

        // Ưu tiên 1: Dùng outgoing connection (peer đã tạo kết nối ra ngoài)
        const outSocket = activeConnections.get(memberId);
        if (outSocket && outSocket.connected) {
            outSocket.emit(MessageType.CHAT_GROUP, msg, (ack: any) => {
                if (ack?.status === 'OK') console.log(`  ✅ Delivered to ${memberId.slice(0, 8)}...`);
            });
            return;
        }

        // Ưu tiên 2: Dùng incoming connection (peer đã kết nối tới mình)
        const inSocket = incomingPeerSockets.get(memberId);
        if (inSocket && inSocket.connected) {
            inSocket.emit(MessageType.CHAT_GROUP, msg);
            console.log(`  ✅ Delivered via incoming to ${memberId.slice(0, 8)}...`);
            return;
        }

        // Ưu tiên 3: Tạo kết nối mới tới peer (chỉ khi peer còn ONLINE)
        const targetPeer = knownPeersRef.peers.find(p => p.id === memberId && p.status === 'ONLINE');
        if (targetPeer) {
            const { io: ioClient } = require('socket.io-client');
            const rawIp = targetPeer.ip;
            const isLocal = rawIp.includes('127.0.0.1') || rawIp === '::1' || rawIp === '::ffff:127.0.0.1';
            const safeIp = isLocal ? 'localhost' : rawIp;
            const peerUrl = `http://${safeIp}:${targetPeer.port}`;

            console.log(`  🌐 Creating P2P connection to ${targetPeer.username} (${peerUrl})...`);
            const newSocket = ioClient(peerUrl, {
                transports: ['websocket', 'polling'],
                timeout: 5000
            });

            activeConnections.set(memberId, newSocket);
            newSocket.emit(MessageType.CHAT_GROUP, msg);
        } else {
            console.log(`  ⚠ Peer ${memberId.slice(0, 8)}... not found.`);
        }
    });
}

// -------------------------------------------------------------------------
// GETTER — Lấy danh sách nhóm hiện tại
// -------------------------------------------------------------------------

export function getMyGroups(): Map<string, GroupActionPayload> {
    return myGroups;
}
