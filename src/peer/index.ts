import 'dotenv/config';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import express from 'express';
import { createServer } from 'http';
import { Server, Socket as ServerSocket } from 'socket.io';
import cors from 'cors';
import { PeerInfo, MessageType, BaseMessage, ChatPrivatePayload, RegisterPayload, DiscoveryResPayload } from '../shared/types';
import * as crypto from 'crypto';

// -------------------------------------------------------------------------
// THIẾT LẬP THÔNG SỐ PEER
const PORT = parseInt(process.env.PEER_PORT || '4001');
const USERNAME = process.env.USERNAME || `User_${PORT}`;
const BOOTSTRAP_SERVER_URL = process.env.BOOTSTRAP_SERVER_URL || 'http://localhost:4000';

let knownPeers: PeerInfo[] = [];
let myPeerInfo: Partial<PeerInfo> = { username: USERNAME, port: PORT };

// -------------------------------------------------------------------------
// 1. PHẦN SERVER (MỞ CỔNG CHỜ PEER KHÁC KẾT NỐI TỚI)
const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const peerServer = new Server(httpServer, { cors: { origin: "*" } });

peerServer.on('connection', (socket: ServerSocket) => {
    console.log(`[+] P2P Connection established from another peer: ${socket.id}`);

    // Dùng Message Type mới để giao tiếp (CHAT_PRIVATE)
    socket.on(MessageType.CHAT_PRIVATE, (msg: BaseMessage<ChatPrivatePayload>, callback) => {
        console.log(`\n💬 [Direct from ${msg.senderId}]: ${msg.payload.content}`);

        // Trả về ACK (Xác nhận đã nhận) cho người gửi
        if (typeof callback === 'function') {
            callback({ status: 'OK', dest_id: socket.id, originalMessageId: msg.messageId });
        }
    });

    socket.on('disconnect', () => {
        console.log(`[-] A peer disconnected.`);
    });
});

httpServer.listen(PORT, () => {
    console.log(`📡 Peer Server [${USERNAME}] listening on http://localhost:${PORT}`);
});

// -------------------------------------------------------------------------
// 2. PHẦN CLIENT (KẾT NỐI BOOTSTRAP ĐỂ LẤY DANH SÁCH + KẾT NỐI TỚI PEER)
const bootstrapClient: ClientSocket = ioClient(BOOTSTRAP_SERVER_URL);
const activeConnections = new Map<string, ClientSocket>();

bootstrapClient.on('connect', () => {
    console.log(`\n[✔] Connected to Bootstrap Server (Tracker). Registering...`);

    // Gửi thông tin đăng ký bằng chuẩn cấu trúc BaseMessage
    const registerMsg: BaseMessage<RegisterPayload> = {
        version: "1.0",
        type: MessageType.REGISTER,
        senderId: "unknown",
        timestamp: Date.now(),
        messageId: crypto.randomUUID ? crypto.randomUUID() : `msg_${Date.now()}`,
        payload: {
            username: USERNAME,
            port: PORT
        }
    };

    bootstrapClient.emit(MessageType.REGISTER, registerMsg, (response: any) => {
        if (response.success) {
            console.log(`[✔] Registered successfully! My ID is ${response.selfId}`);
            myPeerInfo.id = response.selfId;
            knownPeers = response.peers;
            console.log(`[ℹ] Found ${knownPeers.length} peers currently online.`);
        }
    });
});

// Lắng nghe lệnh cập nhật danh sách peer từ Bootstrap Server
bootstrapClient.on(MessageType.DISCOVERY_RES, (msg: BaseMessage<DiscoveryResPayload>) => {
    // Lấy toàn bộ danh sách, trừ bản thân mình ra
    knownPeers = msg.payload.peers.filter(p => p.id !== myPeerInfo.id);
    console.log(`\n[📡] Peer list updated: ${knownPeers.length} online.`);
});

