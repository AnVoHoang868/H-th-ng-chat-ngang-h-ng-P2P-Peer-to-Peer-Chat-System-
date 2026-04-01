// src/server/groupHandler.ts
// Xử lý toàn bộ logic nhóm trên Bootstrap Server

import { Server, Socket } from 'socket.io';
import * as crypto from 'crypto';
import {
    PeerInfo,
    MessageType,
    BaseMessage,
    GroupActionPayload,
    ChatGroupPayload,
    GroupInfo,
    GroupLeaveNotifyPayload
} from '../shared/types';

// -------------------------------------------------------------------------
// ĐĂNG KÝ CÁC HANDLER NHÓM CHO MỖI SOCKET KẾT NỐI
// -------------------------------------------------------------------------

export function registerGroupHandlers(
    io: Server,
    socket: Socket,
    activePeers: Map<string, PeerInfo>,
    activeGroups: Map<string, GroupInfo>
) {

    // -----------------------------------------------------------------
    // GROUP_CREATE — Tạo nhóm mới
    // -----------------------------------------------------------------
    socket.on(MessageType.GROUP_CREATE, (msg: BaseMessage<GroupActionPayload>, callback) => {
        const { groupName, memberIds } = msg.payload;

        // Tạo ID nhóm duy nhất
        const groupId = `group_${Date.now()}_${crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)}`;

        // Đảm bảo người tạo cũng nằm trong danh sách thành viên
        const allMembers = Array.from(new Set([socket.id, ...memberIds]));

        const newGroup: GroupInfo = {
            groupId,
            groupName: groupName || `Group_${groupId.slice(0, 8)}`,
            memberIds: allMembers,
            createdBy: socket.id
        };

        activeGroups.set(groupId, newGroup);
        console.log(`[GROUP_CREATE] Group "${newGroup.groupName}" created by ${socket.id} with ${allMembers.length} members.`);

        // Tạo payload thông báo cho tất cả thành viên
        const groupPayload: GroupActionPayload = {
            groupId: newGroup.groupId,
            groupName: newGroup.groupName,
            memberIds: newGroup.memberIds
        };

        // Gửi thông báo GROUP_JOIN tới tất cả thành viên (bao gồm người tạo)
        const joinMsg: BaseMessage<GroupActionPayload> = {
            version: "1.0",
            type: MessageType.GROUP_JOIN,
            senderId: "server_bootstrap",
            timestamp: Date.now(),
            messageId: crypto.randomUUID ? crypto.randomUUID() : `msg_${Date.now()}`,
            payload: groupPayload
        };

        allMembers.forEach(memberId => {
            io.to(memberId).emit(MessageType.GROUP_JOIN, joinMsg);
        });

        // Callback xác nhận cho người tạo
        if (typeof callback === 'function') {
            callback({ success: true, groupId, group: groupPayload });
        }
    });

    // -----------------------------------------------------------------
    // GROUP_JOIN — Tự join hoặc mời thành viên vào nhóm đã có
    // -----------------------------------------------------------------
    socket.on(MessageType.GROUP_JOIN, (msg: BaseMessage<GroupActionPayload>, callback) => {
        const { groupId, memberIds: invitedIds } = msg.payload;
        const group = activeGroups.get(groupId);

        if (!group) {
            if (typeof callback === 'function') {
                callback({ success: false, error: 'GROUP_NOT_FOUND' });
            }
            return;
        }

        // Xác định ai sẽ được thêm vào nhóm:
        // - Nếu payload.memberIds có và người gửi đã là thành viên → invite người khác
        // - Nếu không → tự join
        const isAdminInvite = invitedIds && invitedIds.length > 0 && group.memberIds.includes(socket.id);
        const toAdd = isAdminInvite ? invitedIds : [socket.id];

        // Thêm từng người vào nhóm nếu chưa có
        let added = false;
        toAdd.forEach(id => {
            if (!group.memberIds.includes(id)) {
                group.memberIds.push(id);
                added = true;
            }
        });

        if (added) {
            const who = isAdminInvite
                ? `${toAdd.join(', ')} (invited by ${socket.id.slice(0, 6)}...)`
                : socket.id;
            console.log(`[GROUP_JOIN] ${who} joined group "${group.groupName}".`);
        }

        // Tạo payload cập nhật
        const updatedPayload: GroupActionPayload = {
            groupId: group.groupId,
            groupName: group.groupName,
            memberIds: group.memberIds
        };

        const joinNotifyMsg: BaseMessage<GroupActionPayload> = {
            version: "1.0",
            type: MessageType.GROUP_JOIN,
            senderId: "server_bootstrap",
            timestamp: Date.now(),
            messageId: crypto.randomUUID ? crypto.randomUUID() : `msg_${Date.now()}`,
            payload: updatedPayload
        };

        // Gửi thông báo cho tất cả thành viên (bao gồm người mới)
        group.memberIds.forEach(memberId => {
            io.to(memberId).emit(MessageType.GROUP_JOIN, joinNotifyMsg);
        });

        if (typeof callback === 'function') {
            callback({ success: true, group: updatedPayload });
        }
    });


    // -----------------------------------------------------------------
    // GROUP_LEAVE — Rời nhóm
    // -----------------------------------------------------------------
    socket.on(MessageType.GROUP_LEAVE, (msg: BaseMessage<GroupActionPayload>, callback) => {
        const { groupId } = msg.payload;
        const group = activeGroups.get(groupId);

        if (!group) {
            if (typeof callback === 'function') {
                callback({ success: false, error: 'GROUP_NOT_FOUND' });
            }
            return;
        }

        // Xóa peer khỏi nhóm
        group.memberIds = group.memberIds.filter(id => id !== socket.id);
        const peerInfo = activePeers.get(socket.id);
        console.log(`[GROUP_LEAVE] ${peerInfo?.username || socket.id} left group "${group.groupName}".`);

        // Nếu nhóm trống thì xóa luôn
        if (group.memberIds.length === 0) {
            activeGroups.delete(groupId);
            console.log(`[GROUP_LEAVE] Group "${group.groupName}" deleted (no members left).`);
        } else {
            // Thông báo cho các thành viên còn lại
            const leaveNotifyMsg: BaseMessage<GroupLeaveNotifyPayload> = {
                version: "1.0",
                type: MessageType.GROUP_LEAVE,
                senderId: "server_bootstrap",
                timestamp: Date.now(),
                messageId: crypto.randomUUID ? crypto.randomUUID() : `msg_${Date.now()}`,
                payload: {
                    groupId,
                    peerId: socket.id,
                    username: peerInfo?.username || 'Unknown'
                }
            };

            group.memberIds.forEach(memberId => {
                io.to(memberId).emit(MessageType.GROUP_LEAVE, leaveNotifyMsg);
            });
        }

        if (typeof callback === 'function') {
            callback({ success: true });
        }
    });

    // -----------------------------------------------------------------
    // CHAT_GROUP — Relay tin nhắn tới các peer trong nhóm
    // Server chỉ làm nhiệm vụ chuyển phát (relay), KHÔNG lưu trữ hay log nội dung
    // Browser clients không thể kết nối trực tiếp nhau nên cần relay qua server
    // CLI peers có thể gửi trực tiếp (P2P) thông qua activeConnections
    // -----------------------------------------------------------------
    socket.on(MessageType.CHAT_GROUP, (msg: BaseMessage<ChatGroupPayload>, callback) => {
        const { groupId } = msg.payload;
        const group = activeGroups.get(groupId);

        if (!group) {
            if (typeof callback === 'function') callback({ success: false, error: 'GROUP_NOT_FOUND' });
            return;
        }

        if (!group.memberIds.includes(socket.id)) {
            if (typeof callback === 'function') callback({ success: false, error: 'UNAUTHORIZED' });
            return;
        }

        // Relay tới các thành viên khác — server KHÔNG log nội dung
        console.log(`[CHAT_GROUP] Relay from ${socket.id.slice(0, 6)}... → group "${group.groupName}" (${group.memberIds.length - 1} recipients)`);

        const forwardMsg: BaseMessage<ChatGroupPayload> = {
            version: "1.0",
            type: MessageType.CHAT_GROUP,
            senderId: socket.id,
            timestamp: msg.timestamp,
            messageId: msg.messageId,
            payload: msg.payload   // forward nguyên vẹn, không inspect nội dung
        };

        group.memberIds.forEach(memberId => {
            if (memberId !== socket.id) {
                io.to(memberId).emit(MessageType.CHAT_GROUP, forwardMsg);
            }
        });

        if (typeof callback === 'function') callback({ success: true });
    });
}



// -------------------------------------------------------------------------
// CLEANUP — Xóa peer khỏi tất cả nhóm khi disconnect
// -------------------------------------------------------------------------

export function cleanupPeerFromGroups(
    io: Server,
    socketId: string,
    activePeers: Map<string, PeerInfo>,
    activeGroups: Map<string, GroupInfo>
) {
    const peerInfo = activePeers.get(socketId);

    activeGroups.forEach((group, groupId) => {
        if (group.memberIds.includes(socketId)) {
            group.memberIds = group.memberIds.filter(id => id !== socketId);

            if (group.memberIds.length === 0) {
                activeGroups.delete(groupId);
                console.log(`[CLEANUP] Group "${group.groupName}" deleted (last member disconnected).`);
            } else {
                // Thông báo cho các thành viên còn lại
                const leaveNotifyMsg: BaseMessage<GroupLeaveNotifyPayload> = {
                    version: "1.0",
                    type: MessageType.GROUP_LEAVE,
                    senderId: "server_bootstrap",
                    timestamp: Date.now(),
                    messageId: `msg_cleanup_${Date.now()}`,
                    payload: {
                        groupId,
                        peerId: socketId,
                        username: peerInfo?.username || 'Unknown'
                    }
                };

                group.memberIds.forEach(memberId => {
                    io.to(memberId).emit(MessageType.GROUP_LEAVE, leaveNotifyMsg);
                });
            }
        }
    });
}
