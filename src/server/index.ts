import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import { IPeer, SocketEvents } from '../shared/types';

// Cấu hình Express
const app = express();
app.use(cors());
app.use(express.json());

// Khởi tạo HTTP & Socket.io Server
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*", // Trong thực tế nên giới hạn, nhưng đồ án thì để * cho dễ test
        methods: ["GET", "POST"]
    }
});

// Bộ nhớ đệm lưu danh sách Peers đang online
// Key: socket.id, Value: Thông tin IPeer
const activePeers = new Map<string, IPeer>();

// Lắng nghe sự kiện khi có máy con (Peer) kết nối tới
io.on('connection', (socket: Socket) => {
    console.log(`[+] Client connected: ${socket.id}`);

    // Khi máy con gửi yêu cầu đăng ký tham gia mạng
    socket.on(SocketEvents.REGISTER_PEER, (peerInfo: Partial<IPeer>, callback) => {
        const newPeer: IPeer = {
            id: socket.id, // Sử dụng always socket id của bootstrap server làm mã định danh Peer
            username: peerInfo.username || `User_${socket.id.substring(0, 5)}`,
            ip: socket.handshake.address,
            port: peerInfo.port || 0
        };

        // Lưu vào memory
        activePeers.set(socket.id, newPeer);
        console.log(`[REGISTER] Peer ${newPeer.username} (${newPeer.ip}:${newPeer.port}) joined P2P network.`);

        // Gửi trả danh sách peer hiện tại cho máy vừa mới đăng ký (không bao gồm chính nó)
        const currentPeersList = Array.from(activePeers.values()).filter(p => p.id !== socket.id);
        
        // Gọi callback (acknowledge) để peer biết đã đăng ký thành công và nhận danh sách
        if (typeof callback === 'function') {
            callback({ success: true, peers: currentPeersList, selfId: socket.id });
        }

        // Broadcast danh sách mới cho TẤT CẢ peer khác (để các peer khác biết có ng mới)
        socket.broadcast.emit(SocketEvents.PEER_LIST_UPDATE, Array.from(activePeers.values()));
    });

    // Khi máy con ngắt kết nối (VD: tắt máy, rớt mạng)
    socket.on('disconnect', () => {
        if (activePeers.has(socket.id)) {
            const peer = activePeers.get(socket.id);
            console.log(`[-] Peer ${peer?.username} disconnected`);
            activePeers.delete(socket.id);

            // Cập nhật lại danh sách cho các peer còn lại
            io.emit(SocketEvents.PEER_LIST_UPDATE, Array.from(activePeers.values()));
        }
    });
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
    console.log(`🚀 Bootstrap Server (Tracker) is running on http://localhost:${PORT}`);
    console.log(`📡 Waiting for peers to connect...`);
});
