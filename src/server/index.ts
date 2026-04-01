import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import {
    registerPeerNetworkHandlers,
    startHeartbeatWatchdog,
    HEARTBEAT_TIMEOUT_MS,
    HEARTBEAT_CHECK_MS
} from './peerHandler';
import { PeerInfo, MessageType, BaseMessage, RegisterPayload, DiscoveryResPayload, GroupInfo } from '../shared/types';
import * as crypto from 'crypto';
import { registerGroupHandlers, cleanupPeerFromGroups } from './groupHandler';

// Cấu hình Express 123
const app = express();
app.use(cors());
app.use(express.json());

// Khởi tạo HTTP & Socket.io Server
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: '*', // Trong thực tế nên giới hạn, nhưng đồ án thì để * cho dễ test
        methods: ['GET', 'POST']
    }
});

// Bộ nhớ đệm lưu danh sách Peers đang online
const activePeers = new Map<string, PeerInfo>();
// Registry phiên: peer đã từng đăng ký (kèm trạng thái ONLINE/OFFLINE) — dùng cho discovery P2P 1-1
const peerRegistry = new Map<string, PeerInfo>();
// Thời điểm nhận heartbeat / đăng ký gần nhất (socket còn trong activePeers)
const lastSeen = new Map<string, number>();

// Khai báo biến lưu trữ nhóm
const activeGroups = new Map<string, GroupInfo>();

// Kiểm tra timeout heartbeat toàn cục (một lần khi khởi động server)
startHeartbeatWatchdog(io, activePeers, peerRegistry, lastSeen, activeGroups);


// Lắng nghe sự kiện khi có máy con (Peer) kết nối tới
io.on('connection', (socket) => {
    console.log(`[+] Client connected: ${socket.id}`);

    // Đăng ký handler peer / discovery / heartbeat (tách file peerHandler.ts — hỗ trợ hai peer tự tìm nhau để chat trực tiếp)
    registerPeerNetworkHandlers(io, socket, activePeers, peerRegistry, lastSeen, activeGroups);

    // Khi máy con đăng ký tham gia mạng (xài chuẩn MessageContracts mới)
    socket.on(MessageType.REGISTER, (msg: BaseMessage<RegisterPayload>, callback) => {
        const payload = msg.payload;

        const newPeer: PeerInfo = {
            id: socket.id,
            username: payload.username || `User_${socket.id.substring(0, 5)}`,
            ip: socket.handshake.address || "127.0.0.1",
            port: payload.port || 0,
            status: "ONLINE"
        };

        // Lưu vào memory
        activePeers.set(socket.id, newPeer);
        console.log(`[REGISTER] Peer ${newPeer.username} (${newPeer.ip}:${newPeer.port}) joined P2P network.`);

        // Lấy danh sách nhưng trừ chính mình ra
        const currentPeersList = Array.from(activePeers.values()).filter(p => p.id !== socket.id);

        // Gọi callback (Acknowledge)
        if (typeof callback === 'function') {
            callback({ success: true, peers: currentPeersList, selfId: socket.id });
        }

        // Tạo message chuẩn DISCOVERY_RES để broadcast cho các peer khác cập nhật danh sách
        const broadcastMsg: BaseMessage<DiscoveryResPayload> = {
            version: "1.0",
            type: MessageType.DISCOVERY_RES,
            senderId: "server_bootstrap",
            timestamp: Date.now(),
            messageId: crypto.randomUUID ? crypto.randomUUID() : `msg_${Date.now()}`,
            payload: {
                peers: Array.from(activePeers.values())
            }
        };
        socket.broadcast.emit(MessageType.DISCOVERY_RES, broadcastMsg);
    });

    // Khi máy con ngắt kết nối (VD: tắt terminal rớt mạng)
    socket.on('disconnect', () => {
        if (activePeers.has(socket.id)) {
            const peer = activePeers.get(socket.id);
            console.log(`[-] Peer ${peer?.username} disconnected`);

            // Cleanup nhóm trước khi xóa peer
            cleanupPeerFromGroups(io, socket.id, activePeers, activeGroups);

            activePeers.delete(socket.id);

            // Gửi message cập nhật danh sách cho các peer còn lại
            const broadcastMsg: BaseMessage<DiscoveryResPayload> = {
                version: "1.0",
                type: MessageType.DISCOVERY_RES,
                senderId: "server_bootstrap",
                timestamp: Date.now(),
                messageId: crypto.randomUUID ? crypto.randomUUID() : `msg_${Date.now()}`,
                payload: {
                    peers: Array.from(activePeers.values())
                }
            };
            io.emit(MessageType.DISCOVERY_RES, broadcastMsg);
        }
    });

    // Đăng ký các handler nhóm (tách file riêng)
    registerGroupHandlers(io, socket, activePeers, activeGroups);
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
    console.log(`🚀 Bootstrap Server (Tracker) is running on http://localhost:${PORT}`);
    console.log(`📡 Waiting for peers to connect...`);
    console.log(`⏱ Heartbeat timeout: ${HEARTBEAT_TIMEOUT_MS}ms, check every ${HEARTBEAT_CHECK_MS}ms`);
});