import 'dotenv/config';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import express from 'express';
import { createServer } from 'http';
import { Server, Socket as ServerSocket } from 'socket.io';
import cors from 'cors';
import {
    PeerInfo,
    MessageType,
    BaseMessage,
    ChatPrivatePayload,
    RegisterPayload,
    DiscoveryResPayload,
    HeartbeatPayload,
    NodeOfflinePayload,
    AckPayload
} from '../shared/types';
import * as crypto from 'crypto';
import { webcrypto } from 'crypto';
import { createE2eeOperations } from '../shared/e2eeOperations';
import { registerPeerGroupHandlers } from './groupHandler';

/**
 * Cùng module `e2eeOperations` với client React, nhưng Node dùng `import { webcrypto } from 'crypto'`.
 * Truyền `getRandomValues` từ `webcrypto` để mã hóa IV không phụ thuộc `globalThis.crypto` (tránh lỗi trên Node 18).
 */
const e2ee = createE2eeOperations(webcrypto.subtle, {
    getRandomValues: (buf) => webcrypto.getRandomValues(buf)
});

const PORT = parseInt(process.env.PEER_PORT || '4001');
const USERNAME = process.env.USERNAME || `User_${PORT}`;
const BOOTSTRAP_SERVER_URL = process.env.BOOTSTRAP_SERVER_URL || 'http://localhost:4000';
const ADVERTISE_IP = process.env.PEER_IP || '127.0.0.1';
const HEARTBEAT_INTERVAL_MS = parseInt(process.env.HEARTBEAT_INTERVAL_MS || '15000', 10);

function newMsgId(): string {
    return crypto.randomUUID ? crypto.randomUUID() : `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

let knownPeers: PeerInfo[] = [];
let myPeerInfo: Partial<PeerInfo> = { username: USERNAME, port: PORT };
/** Private key ECDH của peer CLI — chỉ RAM; dùng với public key của người gửi (trong `knownPeers`) để giải mã `aes-gcm-v1`. */
let identityPrivateKey: CryptoKey | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function clearHeartbeat() {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
}

function startHeartbeat(client: ClientSocket, peerId: string) {
    clearHeartbeat();
    heartbeatTimer = setInterval(() => {
        if (!client.connected) return;
        const hb: BaseMessage<HeartbeatPayload> = {
            version: '1.0',
            type: MessageType.HEARTBEAT,
            senderId: peerId,
            timestamp: Date.now(),
            messageId: newMsgId(),
            payload: { status: 'ONLINE' }
        };
        client.emit(MessageType.HEARTBEAT, hb);
    }, HEARTBEAT_INTERVAL_MS);
}

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const peerServer = new Server(httpServer, { cors: { origin: '*' } });

peerServer.on('connection', (socket: ServerSocket) => {
    console.log(`[+] P2P Connection established from another peer: ${socket.id}`);

    // Tin P2P trực tiếp: legacy có `content` plaintext; E2EE có `encryption: aes-gcm-v1` + ciphertext/iv (đồng bộ với client web).
    socket.on(MessageType.CHAT_PRIVATE, async (msg: BaseMessage<ChatPrivatePayload>, callback) => {
        let display = msg.payload.content ?? '';
        if (msg.payload.encryption === 'aes-gcm-v1' && msg.payload.ciphertextB64 && msg.payload.ivB64) {
            // Giải mã: AES = ECDH(priv_CLI, pub_người_gửi) — trùng khóa với phía gửi dùng ECDH(priv_người_gửi, pub_CLI).
            const sender = knownPeers.find((p) => p.id === msg.senderId);
            if (sender?.publicKeyJwk && identityPrivateKey) {
                try {
                    const aes = await e2ee.deriveSharedAesKey(identityPrivateKey, sender.publicKeyJwk);
                    display = await e2ee.decryptWithAesGcm(aes, msg.payload.ciphertextB64, msg.payload.ivB64);
                } catch {
                    display = '[Lỗi giải mã E2EE]';
                }
            } else {
                display = '[E2EE: thiếu khóa peer]';
            }
        }
        console.log(`\n💬 [Direct from ${msg.senderId}]: ${display}`);

        const ackMsg: BaseMessage<AckPayload> = {
            version: '1.0',
            type: MessageType.ACK_RECEIVE,
            senderId: myPeerInfo.id || 'unknown',
            timestamp: Date.now(),
            messageId: newMsgId(),
            payload: {
                originalMessageId: msg.messageId,
                status: 'SUCCESS'
            }
        };
        socket.emit(MessageType.ACK_RECEIVE, ackMsg);

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

const bootstrapClient: ClientSocket = ioClient(BOOTSTRAP_SERVER_URL);
const activeConnections = new Map<string, ClientSocket>();

bootstrapClient.on('connect', () => {
    // Đồng bộ với React: generateIdentityKeyPair → đăng ký publicKeyJwk để peer khác (và tab browser) derive AES khi chat tới mình.
    void (async () => {
        console.log(`\n[✔] Connected to Bootstrap Server (Tracker). Registering...`);

        const { privateKey, publicJwkString } = await e2ee.generateIdentityKeyPair();
        identityPrivateKey = privateKey;

        const registerMsg: BaseMessage<RegisterPayload> = {
            version: '1.0',
            type: MessageType.REGISTER,
            senderId: 'unknown',
            timestamp: Date.now(),
            messageId: newMsgId(),
            payload: {
                username: USERNAME,
                port: PORT,
                ip: ADVERTISE_IP,
                publicKeyJwk: publicJwkString
            }
        };

        bootstrapClient.emit(MessageType.REGISTER, registerMsg, (response: any) => {
            if (response.success) {
                console.log(`[✔] Registered successfully! My ID is ${response.selfId}`);
                myPeerInfo.id = response.selfId;
                knownPeers = response.peers;
                console.log(`[ℹ] Discovery: ${knownPeers.length} peer(s) in registry (online + offline).`);
                startHeartbeat(bootstrapClient, response.selfId);
            }
        });
    })().catch((err) => console.error('[peer] REGISTER / E2EE keygen failed', err));
});

bootstrapClient.on(MessageType.DISCOVERY_RES, (msg: BaseMessage<DiscoveryResPayload>) => {
    knownPeers = msg.payload.peers.filter((p) => p.id !== myPeerInfo.id);
    const online = knownPeers.filter((p) => p.status === 'ONLINE').length;
    console.log(`\n[📡] Peer list updated: ${knownPeers.length} total (${online} online).`);
});

bootstrapClient.on(MessageType.NODE_OFFLINE, (msg: BaseMessage<NodeOfflinePayload>) => {
    console.log(`\n[📴 NODE_OFFLINE] Peer ${msg.payload.offlinePeerId} is now offline.`);
});

bootstrapClient.on('disconnect', () => {
    clearHeartbeat();
});

const knownPeersRef = { get peers() { return knownPeers; } };

registerPeerGroupHandlers(bootstrapClient, peerServer, myPeerInfo, knownPeersRef, activeConnections);
