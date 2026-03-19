// Định nghĩa các loại thông điệp (Message Types) trong hệ thống
export enum MessageType {
    // --- Kịch bản với Bootstrap Server ---
    REGISTER = "REGISTER",                 // Đăng ký với Bootstrap server để tham gia mạng
    DISCOVERY_REQ = "DISCOVERY_REQ",       // Yêu cầu lấy danh sách peer
    DISCOVERY_RES = "DISCOVERY_RES",       // Server trả về danh sách peer đang online
    HEARTBEAT = "HEARTBEAT",               // Gửi tín hiệu báo "Tôi vẫn đang online"

    // --- Kịch bản Chat P2P (Trực tiếp giữa các Peer) ---
    CHAT_PRIVATE = "CHAT_PRIVATE",         // Gửi tin nhắn 1-1 trực tiếp
    ACK_RECEIVE = "ACK_RECEIVE",           // Xác nhận đã nhận tin nhắn (Truyền tin đáng tin cậy)

    // --- Kịch bản Group Chat ---
    GROUP_CREATE = "GROUP_CREATE",         // Yêu cầu tạo nhóm mới
    GROUP_JOIN = "GROUP_JOIN",             // Yêu cầu vào nhóm / Mời vào nhóm
    GROUP_LEAVE = "GROUP_LEAVE",           // Thông báo rời nhóm
    CHAT_GROUP = "CHAT_GROUP",             // Gửi tin nhắn vào nhóm

    // --- Hệ thống / Lỗi ---
    ERROR = "ERROR",                       // Trả về khi có lỗi xảy ra
    NODE_OFFLINE = "NODE_OFFLINE"          // Thông báo một peer đã mất kết nối
}

// Mã lỗi chuẩn hóa (Error Codes) để dễ dàng debug
export enum ErrorCode {
    PEER_NOT_FOUND = "PEER_NOT_FOUND",         // Không tìm thấy peer đích
    GROUP_NOT_FOUND = "GROUP_NOT_FOUND",       // Không tìm thấy nhóm
    UNAUTHORIZED = "UNAUTHORIZED",             // Chưa đăng ký mạng mà đòi chat
    CONNECTION_LOST = "CONNECTION_LOST",       // Mất kết nối mạng đột ngột
    PAYLOAD_INVALID = "PAYLOAD_INVALID"        // Gửi sai định dạng JSON
}

// Cấu trúc chuẩn của một Peer
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
    senderId: string;      // ID của người gửi (Peer hoặc Server)
    timestamp: number;     // Thời gian gửi (Unix timestamp)
    messageId: string;     // UUID định danh duy nhất cho mỗi tin nhắn (Dùng cho ACK)
    payload: T;            // Dữ liệu chi tiết, phụ thuộc vào 'type'
}

// ---------------------------------------------------------
// CÁC PAYLOAD CỤ THỂ CHO TỪNG KỊCH BẢN
// ---------------------------------------------------------

// 1. Kịch bản Discovery: Kết quả danh sách Peer trả về từ Server
export interface DiscoveryResPayload {
    peers: PeerInfo[];
}

// 2. Kịch bản Chat 1-1
export interface ChatPrivatePayload {
    receiverId: string;
    content: string;
}

// 3. Kịch bản Truyền tin đáng tin cậy (ACK)
export interface AckPayload {
    originalMessageId: string; // ID của tin nhắn vừa nhận được
    status: "SUCCESS" | "FAILED";
}

// 4. Kịch bản Group Chat
export interface ChatGroupPayload {
    groupId: string;
    content: string;
}

export interface GroupActionPayload {
    groupId: string;
    groupName?: string;
    memberIds: string[]; // Danh sách ID các thành viên trong nhóm
}

// 5. Kịch bản Lỗi
export interface ErrorPayload {
    code: ErrorCode;
    details: string;
}