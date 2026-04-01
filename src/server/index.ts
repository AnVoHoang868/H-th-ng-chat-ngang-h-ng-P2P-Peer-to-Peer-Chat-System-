import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { PeerInfo, GroupInfo } from '../shared/types';
import {
    registerPeerNetworkHandlers,
    startHeartbeatWatchdog,
    HEARTBEAT_TIMEOUT_MS,
    HEARTBEAT_CHECK_MS
} from './peerHandler';
import { registerGroupHandlers } from './groupHandler';

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

    // Đăng ký các handler nhóm (tách file riêng)
    registerGroupHandlers(io, socket, activePeers, activeGroups);
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
    console.log(`🚀 Bootstrap Server (Tracker) is running on http://localhost:${PORT}`);
    console.log(`📡 Waiting for peers to connect...`);
    console.log(`⏱ Heartbeat timeout: ${HEARTBEAT_TIMEOUT_MS}ms, check every ${HEARTBEAT_CHECK_MS}ms`);
});