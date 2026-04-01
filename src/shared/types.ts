// src/shared/types.ts

// Định nghĩa cấu trúc của một Peer
export interface IPeer {
    id: string;        // ID duy nhất của peer (ví dụ: socket.id)
    username: string;  // Tên hiển thị
    ip: string;        // Địa chỉ IP
    port: number;      // Cổng lắng nghe
}

// Các loại sự kiện giao tiếp giữa các thành phần
export enum SocketEvents {
    // Client <-> Bootstrap Server
    REGISTER_PEER = 'REGISTER_PEER',
    UNREGISTER_PEER = 'UNREGISTER_PEER',
    PEER_LIST_UPDATE = 'PEER_LIST_UPDATE',

    // Peer <-> Peer
    DIRECT_MESSAGE = 'DIRECT_MESSAGE',
    DIRECT_MESSAGE_ACK = 'DIRECT_MESSAGE_ACK',
    GROUP_MESSAGE = 'GROUP_MESSAGE',
    BROADCAST_MESSAGE = 'BROADCAST_MESSAGE'
}

// Cấu trúc tin nhắn Chat 1-1
export interface IDirectMessage {
    id: string;        // ID tin nhắn (để dùng cho ACK)
    senderId: string;
    receiverId: string;
    content: string;
    timestamp: number;
}
// Định nghĩa các loại thông điệp (Message Types) trong hệ thống
export enum MessageType {
    REGISTER = "REGISTER",
    DISCOVERY_REQ = "DISCOVERY_REQ",
    DISCOVERY_RES = "DISCOVERY_RES",
    HEARTBEAT = "HEARTBEAT",
    CHAT_PRIVATE = "CHAT_PRIVATE",
    ACK_RECEIVE = "ACK_RECEIVE",
    GROUP_CREATE = "GROUP_CREATE",
    GROUP_JOIN = "GROUP_JOIN",
    GROUP_LEAVE = "GROUP_LEAVE",
    CHAT_GROUP = "CHAT_GROUP",
    ERROR = "ERROR",
    NODE_OFFLINE = "NODE_OFFLINE"
}

export enum ErrorCode {
    PEER_NOT_FOUND = "PEER_NOT_FOUND",
    GROUP_NOT_FOUND = "GROUP_NOT_FOUND",
    UNAUTHORIZED = "UNAUTHORIZED",
    CONNECTION_LOST = "CONNECTION_LOST",
    PAYLOAD_INVALID = "PAYLOAD_INVALID"
}

// Cấu trúc của một Peer
export interface PeerInfo {
    id: string;
    username: string;
    ip: string;
    port: number;
    status: "ONLINE" | "OFFLINE";
    /**
     * E2EE: khóa công khai ECDH (P-256), dạng JSON.stringify(JsonWebKey).
     * Peer khác dùng cùng với khóa riêng của họ để derive AES — tracker không cần biết private key.
     */
    publicKeyJwk?: string;
}

// ---------------------------------------------------------
// DATA CONTRACT (VỎ BỌC CHUNG CHO MỌI TIN NHẮN)
// ---------------------------------------------------------
export interface BaseMessage<T = any> {
    version: "1.0";
    type: MessageType;
    senderId: string;
    timestamp: number;
    messageId: string;
    payload: T;
}

// ---------------------------------------------------------
// CÁC PAYLOAD CỤ THỂ
// ---------------------------------------------------------

export interface RegisterPayload {
    username: string;
    port: number;
    ip?: string;
    /**
     * E2EE: gửi kèm lúc REGISTER để server đưa vào PeerInfo và phát qua DISCOVERY_RES.
     * Thiếu field này → peer chỉ chat plaintext (tương thích bản cũ).
     */
    publicKeyJwk?: string;
}

/** Yêu cầu danh sách peer (có thể rỗng — payload không bắt buộc field) */
export type DiscoveryReqPayload = Record<string, never>;

export interface DiscoveryResPayload {
    peers: PeerInfo[];
}

export interface HeartbeatPayload {
    status: "ONLINE";
}

export interface NodeOfflinePayload {
    offlinePeerId: string;
}

/** Phiên bản mã hóa tin riêng: `aes-gcm-v1` = ECDH-derived AES-GCM (xem e2eeOperations). */
export type PrivateEncryptionScheme = "none" | "aes-gcm-v1";

export interface ChatPrivatePayload {
    receiverId: string;
    /** Plaintext: khi không E2EE, hoặc sau khi client giải mã để hiển thị UI */
    content?: string;
    /** Có mặt khi gửi qua mạng ở chế độ E2EE */
    encryption?: PrivateEncryptionScheme;
    /** Bản mã hóa AES-GCM (không phải UTF-8), biểu diễn base64 */
    ciphertextB64?: string;
    /** IV nonce GCM, 12 byte, base64 — bắt buộc khớp với ciphertext */
    ivB64?: string;
}

export interface AckPayload {
    originalMessageId: string;
    status: "SUCCESS" | "FAILED";
}

export interface ChatGroupPayload {
    groupId: string;
    content: string;
}

export interface GroupActionPayload {
    groupId: string;
    groupName?: string;
    memberIds: string[];
}

export interface ErrorPayload {
    code: ErrorCode;
    details: string;
}

// Thông tin nhóm lưu trữ trên server
export interface GroupInfo {
    groupId: string;
    groupName: string;
    memberIds: string[];
    createdBy: string;
}

// Payload thông báo khi thành viên rời nhóm
export interface GroupLeaveNotifyPayload {
    groupId: string;
    peerId: string;
    username: string;
}
