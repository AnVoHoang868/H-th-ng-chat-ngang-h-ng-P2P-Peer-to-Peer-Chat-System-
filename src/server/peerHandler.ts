// src/server/peerHandler.ts
// =============================================================================
// BOOTSTRAP / TRACKER — Lớp hỗ trợ mạng P2P 1-1 (peer-to-peer trực tiếp)
// =============================================================================
// - Nhiệm vụ: cho phép peer ĐĂNG KÝ, biết danh sách peer khác (IP, cổng, online/offline),
//   duy trì trạng thái sống (HEARTBEAT), và thông báo khi một peer rời mạng (NODE_OFFLINE).
// - Client web đăng ký cổng bootstrap (vd. 4000) và không thể mở server TCP riêng; khi cả hai peer
//   dùng cùng cổng đó, tracker RELAY CHAT_PRIVATE tới socket đích (receiverId).
// - Peer CLI (src/peer/index.ts) quảng bá cổng lắng nghe riêng (vd. 4001): tin vẫn đi trực tiếp peer↔peer.
// - Dữ liệu chia hai lớp:
//     + activePeers: chỉ peer đang kết nối WebSocket tới server (đang ONLINE thực sự).
//     + peerRegistry: lịch sử phiên — peer đã đăng ký; khi mất kết nối vẫn giữ bản ghi với status OFFLINE
//       để client có thể hiển thị “ai đã từng trong mạng / đang offline”.
//     + lastSeen: thời điểm cuối cùng nhận REGISTER hoặc HEARTBEAT — dùng để phát hiện treo/mất heartbeat.

import { Server, Socket } from 'socket.io';
import * as crypto from 'crypto';
import {
    PeerInfo,
    MessageType,
    BaseMessage,
    RegisterPayload,
    DiscoveryResPayload,
    DiscoveryReqPayload,
    HeartbeatPayload,
    NodeOfflinePayload,
    GroupInfo,
    ChatPrivatePayload
} from '../shared/types';
import { cleanupPeerFromGroups } from './groupHandler';

// -----------------------------------------------------------------------------
// Cấu hình thời gian (có thể ghi đè bằng biến môi trường khi chạy server)
// -----------------------------------------------------------------------------
// HEARTBEAT_TIMEOUT_MS: nếu quá lâu không cập nhật lastSeen (không REGISTER/HEARTBEAT),
//   coi như peer “chết treo” và sẽ bị đưa ra khỏi activePeers (xử lý trong startHeartbeatWatchdog).
// HEARTBEAT_CHECK_MS: chu kỳ quét toàn bộ activePeers — nên nhỏ hơn TIMEOUT để phản ứng kịp.
export const HEARTBEAT_TIMEOUT_MS = parseInt(process.env.HEARTBEAT_TIMEOUT_MS || '45000', 10);
export const HEARTBEAT_CHECK_MS = parseInt(process.env.HEARTBEAT_CHECK_MS || '5000', 10);

/**
 * Chuẩn hóa địa chỉ IP hiển thị cho peer khác dùng khi gọi P2P tới `ip:port`.
 * - Ưu tiên payload.ip do chính peer gửi (peer biết IP mạng LAN/WAN của mình tốt hơn server sau NAT).
 * - Nếu không có: lấy từ socket.handshake.address (có thể là IPv6 map IPv4 dạng ::ffff:x.x.x.x).
 * - Bỏ tiền tố ::ffff: để URL `http://ip:port` ở client/peer dễ dùng hơn.
 */
function normalizeIp(socket: Socket, payloadIp?: string): string {
    if (payloadIp && payloadIp.trim()) {
        return payloadIp.replace(/^::ffff:/, '');
    }
    const raw = socket.handshake.address || '127.0.0.1';
    return raw.replace(/^::ffff:/, '');
}

/** Sinh messageId cho các gói BaseMessage (UUID nếu runtime hỗ trợ, không thì chuỗi duy nhất theo thời gian). */
function newMsgId(): string {
    return crypto.randomUUID ? crypto.randomUUID() : `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Dựng tin DISCOVERY_RES chuẩn hợp đồng — toàn bộ danh sách peer trong registry (online + offline),
 * để mọi client cập nhật UI/danh sách đồng bộ.
 */
function buildDiscoveryRes(peers: PeerInfo[]): BaseMessage<DiscoveryResPayload> {
    return {
        version: '1.0',
        type: MessageType.DISCOVERY_RES,
        senderId: 'server_bootstrap',
        timestamp: Date.now(),
        messageId: newMsgId(),
        payload: { peers }
    };
}

/**
 * Tin NODE_OFFLINE: chỉ rõ socket.id (peerId) của peer vừa rời mạng — client có thể bôi đỏ / toast
 * mà không cần so sánh toàn bộ danh sách (vẫn nên áp dụng DISCOVERY_RES sau đó để đồng bộ đầy đủ).
 */
function buildNodeOffline(socketId: string): BaseMessage<NodeOfflinePayload> {
    return {
        version: '1.0',
        type: MessageType.NODE_OFFLINE,
        senderId: 'server_bootstrap',
        timestamp: Date.now(),
        messageId: newMsgId(),
        payload: { offlinePeerId: socketId }
    };
}

/**
 * Lọc registry: trả về mọi peer trừ chính người gọi — dùng cho callback REGISTER và DISCOVERY_REQ
 * để client không thấy bản thân trong danh sách “người khác”.
 */
function peersFromRegistryExcludingSelf(peerRegistry: Map<string, PeerInfo>, selfId: string): PeerInfo[] {
    return Array.from(peerRegistry.values()).filter((p) => p.id !== selfId);
}

// -------------------------------------------------------------------------
// markPeerOffline — Một peer không còn trong activePeers (disconnect hoặc xử lý sau timeout)
// -------------------------------------------------------------------------
// Thứ tự quan trọng:
// 1) cleanupPeerFromGroups: cần peer còn trong activePeers để lấy username / membership (xem groupHandler).
// 2) Xóa khỏi activePeers và lastSeen — không còn coi là đang online.
// 3) Ghi đè peerRegistry với cùng id nhưng status OFFLINE — giữ ip/port/username cho lịch sử discovery.
// 4) Phát NODE_OFFLINE (sự kiện tường minh) rồi DISCOVERY_RES (ảnh chụp danh sách đầy đủ cho mọi client).
export function markPeerOffline(
    io: Server,
    socketId: string,
    activePeers: Map<string, PeerInfo>,
    peerRegistry: Map<string, PeerInfo>,
    lastSeen: Map<string, number>,
    activeGroups: Map<string, GroupInfo>
): void {
    if (!activePeers.has(socketId)) return;

    const peer = activePeers.get(socketId)!;
    cleanupPeerFromGroups(io, socketId, activePeers, activeGroups);
    activePeers.delete(socketId);
    lastSeen.delete(socketId);

    peerRegistry.set(socketId, { ...peer, status: 'OFFLINE' });

    const offlineMsg = buildNodeOffline(socketId);
    io.emit(MessageType.NODE_OFFLINE, offlineMsg);

    const broadcastMsg = buildDiscoveryRes(Array.from(peerRegistry.values()));
    io.emit(MessageType.DISCOVERY_RES, broadcastMsg);

    console.log(`[OFFLINE] Peer ${peer.username} (${socketId}) — heartbeat timeout or disconnect`);
}

// -------------------------------------------------------------------------
// startHeartbeatWatchdog — Chạy một lần khi server khởi động (gọi từ index.ts)
// -------------------------------------------------------------------------
// Mục đích: phát hiện kết nối “câm” (client treo, mất mạng mà không bắn disconnect sạch).
// Cách làm: định kỳ so sánh Date.now() - lastSeen với HEARTBEAT_TIMEOUT_MS.
// - Thu trước danh sách socketId timeout vào mảng: tránh sửa Map activePeers trong lúc đang for...of (an toàn).
// - Nếu socket vẫn tồn tại trên server: disconnect(true) — thường sẽ kích hoạt sự kiện 'disconnect'
//   và markPeerOffline chạy từ handler (tránh trùng logic).
// - Nếu socket đã mất khỏi io.sockets (hiếm): gọi markPeerOffline trực tiếp để không bỏ sót registry.
export function startHeartbeatWatchdog(
    io: Server,
    activePeers: Map<string, PeerInfo>,
    peerRegistry: Map<string, PeerInfo>,
    lastSeen: Map<string, number>,
    activeGroups: Map<string, GroupInfo>
): void {
    setInterval(() => {
        const now = Date.now();
        const timedOut: string[] = [];
        for (const socketId of activePeers.keys()) {
            const seen = lastSeen.get(socketId);
            if (seen === undefined) continue;
            if (now - seen > HEARTBEAT_TIMEOUT_MS) timedOut.push(socketId);
        }
        for (const socketId of timedOut) {
            console.warn(`[HEARTBEAT] Timeout for socket ${socketId}`);
            const s = io.sockets.sockets.get(socketId);
            if (s) s.disconnect(true);
            else markPeerOffline(io, socketId, activePeers, peerRegistry, lastSeen, activeGroups);
        }
    }, HEARTBEAT_CHECK_MS);
}

// -------------------------------------------------------------------------
// registerPeerNetworkHandlers — Gắn vào từng socket mới (mỗi lần có client kết nối tới tracker)
// -------------------------------------------------------------------------
// Các sự kiện Socket.IO đăng ký tại đây:
//   REGISTER       — peer lần đầu (hoặc sau reconnect) gửi username/port/ip; server gán id = socket.id.
//   DISCOVERY_REQ  — peer xin lại snapshot danh sách (không broadcast, chỉ callback).
//   HEARTBEAT      — reset lastSeen; nếu trước đó status lệch, đồng bộ lại ONLINE trong registry.
//   disconnect     — kết nối TCP/WebSocket đứt; nếu peer còn trong activePeers thì markPeerOffline.
export function registerPeerNetworkHandlers(
    io: Server,
    socket: Socket,
    activePeers: Map<string, PeerInfo>,
    peerRegistry: Map<string, PeerInfo>,
    lastSeen: Map<string, number>,
    activeGroups: Map<string, GroupInfo>
): void {
    // Khi máy con đăng ký tham gia mạng (chuẩn BaseMessage / MessageContracts)
    socket.on(MessageType.REGISTER, (msg: BaseMessage<RegisterPayload>, callback) => {
        const payload = msg.payload;
        const ip = normalizeIp(socket, payload.ip);

        const newPeer: PeerInfo = {
            id: socket.id,
            username: payload.username || `User_${socket.id.substring(0, 5)}`,
            ip,
            port: payload.port || 0,
            status: 'ONLINE',
            // E2EE: chỉ lưu chuỗi JWK public — server không verify chữ ký / không decrypt; phát lại qua DISCOVERY_RES
            ...(payload.publicKeyJwk ? { publicKeyJwk: payload.publicKeyJwk } : {})
        };

        // Hai map: activePeers = đang kết nối; peerRegistry = cả lịch sử (sau này có thể OFFLINE).
        activePeers.set(socket.id, newPeer);
        peerRegistry.set(socket.id, newPeer);
        // REGISTER cũng coi như “vừa có tín hiệu sống” — tránh bị watchdog cắt trước khi peer kịp gửi HEARTBEAT lần đầu.
        lastSeen.set(socket.id, Date.now());

        console.log(`[REGISTER] Peer ${newPeer.username} (${newPeer.ip}:${newPeer.port}) joined P2P network.`);

        const peersForClient = peersFromRegistryExcludingSelf(peerRegistry, socket.id);

        // Socket.IO ack: client (hoặc peer CLI) nhận ngay selfId + danh sách “người khác” (kèm offline nếu có trong registry).
        if (typeof callback === 'function') {
            callback({ success: true, peers: peersForClient, selfId: socket.id });
        }

        // Phát cho mọi socket đang nối (kể cả peer vừa join): snapshot đầy đủ để UI đồng nhất.
        const broadcastMsg = buildDiscoveryRes(Array.from(peerRegistry.values()));
        io.emit(MessageType.DISCOVERY_RES, broadcastMsg);
    });

    // Peer chủ động yêu cầu danh sách (DISCOVERY_REQ) — trả về qua callback
    socket.on(MessageType.DISCOVERY_REQ, (msg: BaseMessage<DiscoveryReqPayload>, callback) => {
        const list = peersFromRegistryExcludingSelf(peerRegistry, socket.id);
        if (typeof callback === 'function') {
            callback({ success: true, peers: list });
        }
    });

    // Peer gửi heartbeat định kỳ — server cập nhật lastSeen để không bị timeout
    socket.on(MessageType.HEARTBEAT, (msg: BaseMessage<HeartbeatPayload>) => {
        // Chỉ chấp nhận HEARTBEAT sau khi đã REGISTER (còn trong activePeers).
        if (!activePeers.has(socket.id)) return;
        lastSeen.set(socket.id, Date.now());
        const p = activePeers.get(socket.id);
        // Phòng trường hợp dữ liệu lệch: đảm bảo cả activePeers và peerRegistry đều ghi ONLINE.
        if (p && p.status !== 'ONLINE') {
            const updated = { ...p, status: 'ONLINE' as const };
            activePeers.set(socket.id, updated);
            peerRegistry.set(socket.id, updated);
        }
    });

    /**
     * Relay CHAT_PRIVATE (thường là client web cùng cổng bootstrap).
     * Nội dung có thể là ciphertext E2EE — server forward nguyên gói, không đọc plaintext.
     */
    socket.on(MessageType.CHAT_PRIVATE, (msg: BaseMessage<ChatPrivatePayload>, callback) => {
        if (!activePeers.has(socket.id)) return;
        if (msg.senderId !== socket.id) return;
        const receiverId = msg.payload.receiverId;
        if (!receiverId || !activePeers.has(receiverId)) {
            if (typeof callback === 'function') {
                callback({ status: 'FAILED', reason: 'Receiver not online' });
            }
            return;
        }
        const target = io.sockets.sockets.get(receiverId);
        if (target) {
            target.emit(MessageType.CHAT_PRIVATE, msg);
            if (typeof callback === 'function') {
                callback({ status: 'OK', delivered: true });
            }
        } else if (typeof callback === 'function') {
            callback({ status: 'FAILED', reason: 'Receiver socket missing' });
        }
    });

    // Khi máy con ngắt kết nối (VD: tắt terminal, rớt mạng)
    socket.on('disconnect', () => {
        if (activePeers.has(socket.id)) {
            const peer = activePeers.get(socket.id);
            console.log(`[-] Peer ${peer?.username} disconnected`);

            markPeerOffline(io, socket.id, activePeers, peerRegistry, lastSeen, activeGroups);
        }
    });
}
