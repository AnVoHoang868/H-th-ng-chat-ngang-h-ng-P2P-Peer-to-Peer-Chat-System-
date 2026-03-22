// src/shared/types.ts

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
}

export interface DiscoveryResPayload {
    peers: PeerInfo[];
}

export interface HeartbeatPayload {
    status: "ONLINE";
}

export interface NodeOfflinePayload {
    offlinePeerId: string;
}

export interface ChatPrivatePayload {
    receiverId: string;
    content: string;
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
