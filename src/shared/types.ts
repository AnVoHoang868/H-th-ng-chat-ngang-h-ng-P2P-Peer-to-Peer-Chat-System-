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
