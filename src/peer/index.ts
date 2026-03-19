import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import express from 'express';
import { createServer } from 'http';
import { Server, Socket as ServerSocket } from 'socket.io';
import cors from 'cors';
import { IPeer, SocketEvents, IDirectMessage } from '../shared/types';
import * as crypto from 'crypto';

// -------------------------------------------------------------------------
// THIẾT LẬP THÔNG SỐ PEER
// Lấy từ biến môi trường hoặc tham số truyền vào
const PORT = parseInt(process.env.PEER_PORT || '4001');
const USERNAME = process.env.USERNAME || `User_${PORT}`;

// Kết nối tới Bootstrap Server
const BOOTSTRAP_SERVER_URL = process.env.BOOTSTRAP_SERVER_URL || 'http://localhost:4000';
let knownPeers: IPeer[] = [];
let myPeerInfo: Partial<IPeer> = { username: USERNAME, port: PORT };

// -------------------------------------------------------------------------
// 1. PHẦN SERVER (MỞ CỔNG CHỜ PEER KHÁC KẾT NỐI TỚI)
// Tạo 1 máy chủ mini bằng Express + Socket.IO chạy trên port P.
// Mục đích: Nếu peer A nháp tin cho B, A sẽ act như client, kết nối vào B Server.
const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const peerServer = new Server(httpServer, { cors: { origin: "*" } });

peerServer.on('connection', (socket: ServerSocket) => {
    console.log(`[+] P2P Connection established from another peer: ${socket.id}`);

    // Nhận được tin nhắn trực tiếp
    socket.on(SocketEvents.DIRECT_MESSAGE, (msg: IDirectMessage, callback) => {
        console.log(`\n💬 [Direct from ${msg.senderId}]: ${msg.content}`);
        
        // Trả về ACK (Xác nhận đã nhận) cho người gửi
        if (typeof callback === 'function') {
            callback({ status: 'OK', dest_id: socket.id });
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

// Lưu danh sách kết nối đã mở tới các peer khác
// Key: peerId, Value: ClientSocket nối trực tiếp tới peer đó
const activeConnections = new Map<string, ClientSocket>();

bootstrapClient.on('connect', () => {
    console.log(`\n[✔] Connected to Bootstrap Server (Tracker). Registering...`);
    
    // Gửi thông tin của mình lên cho server
    bootstrapClient.emit(SocketEvents.REGISTER_PEER, myPeerInfo, (response: any) => {
        if (response.success) {
            console.log(`[✔] Registered successfully! My ID is ${response.selfId}`);
            myPeerInfo.id = response.selfId;
            knownPeers = response.peers;
            console.log(`[ℹ] Found ${knownPeers.length} peers currently online.`);
            
            // Ở đây bạn có thể gọi hàm kết nối thẳng tới các peer đang online
            // connectToAllPeers(knownPeers);
        }
    });
});

// Lắng nghe lệnh cập nhật danh sách peer từ Bootstrap Server
bootstrapClient.on(SocketEvents.PEER_LIST_UPDATE, (updateList: IPeer[]) => {
    // Chỉ lấy các máy khác (loại bỏ chính mình dựa vào ID đã register)
    knownPeers = updateList.filter(p => p.id !== myPeerInfo.id);
    console.log(`\n[📡] Peer list updated: ${knownPeers.length} online.`);
    // TODO: So sánh với activeConnections để mở/đóng socket phù hợp (sẽ code ở Tuần 2)
});

// TODO: Module giao diện dòng lệnh (CLI) để gõ chữ gửi tin nhắn (Tương tự chat box)
// Ví dụ: process.stdin.on('data', ...)
