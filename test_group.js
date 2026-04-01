const { io } = require("socket.io-client");

console.log("Bắt đầu test kịch bản Group P2P bằng script...");

const tracker = io("http://localhost:4000");

tracker.on("connect", () => {
    console.log("1. Đã kết nối với Bootstrap Server (Tracker).");
    
    // Đăng ký như một Peer mới
    tracker.emit("REGISTER", {
        version: "1.0",
        type: "REGISTER",
        senderId: "unknown",
        timestamp: Date.now(),
        messageId: "msg_" + Date.now(),
        payload: { username: "Tester_Node", port: 4003 }
    }, (res) => {
        if (!res.success) {
            console.error("Đăng ký Tester_Node thất bại!");
            process.exit(1);
        }
        
        console.log(`2. Đã đăng ký thành công. ID của tôi là: ${res.selfId}`);
        const peers = res.peers || [];
        console.log(`=> Có ${peers.length} peer online:`, peers.map((p) => p.username).join(", "));
        
        const node1 = peers.find((p) => p.username === "Trung_Node1");
        const node2 = peers.find((p) => p.username === "Trung_Node2");
        
        if (!node1 || !node2) {
            console.log("❌ Không tìm thấy Trung_Node1 hoặc Trung_Node2 đang online. Vui lòng đảm bảo các terminal Node1/Node2 đang chạy.");
            process.exit(1);
        }
        
        console.log(`3. Yêu cầu tạo group với ${node1.username} và ${node2.username}...`);
        
        tracker.emit("GROUP_CREATE", {
            name: "Test_Group_Zalo",
            members: [res.selfId, node1.id, node2.id]
        }, (groupRes) => {
            console.log(`=> Đã tạo Group thành công! ID nhóm: ${groupRes.groupId}`);
            
            console.log("4. Tiến hành gửi tin nhắn CHAT_GROUP P2P trực tiếp tới Node 1 và Node 2...");
            
            const peer1Socket = io(`http://localhost:${node1.port}`);
            peer1Socket.on("connect", () => {
                peer1Socket.emit("CHAT_GROUP", {
                    groupId: groupRes.groupId,
                    senderId: res.selfId,
                    content: "Xin chào từ Test Script! Các bạn có nhận được không?",
                    timestamp: Date.now()
                });
                console.log(`   -> Đã bắn tin nhắn thẳng vào port ${node1.port} của ${node1.username}`);
                setTimeout(() => peer1Socket.disconnect(), 1000);
            });
            
            const peer2Socket = io(`http://localhost:${node2.port}`);
            peer2Socket.on("connect", () => {
                peer2Socket.emit("CHAT_GROUP", {
                    groupId: groupRes.groupId,
                    senderId: res.selfId,
                    content: "Xin chào từ Test Script! Các bạn có nhận được không?",
                    timestamp: Date.now()
                });
                console.log(`   -> Đã bắn tin nhắn thẳng vào port ${node2.port} của ${node2.username}`);
                setTimeout(() => peer2Socket.disconnect(), 1000);
            });
            
            setTimeout(() => {
                console.log(`5. Rời nhóm ${groupRes.groupId}...`);
                tracker.emit("GROUP_LEAVE", groupRes.groupId);
                
                setTimeout(() => {
                    console.log("✅ Kịch bản test hoàn tất!");
                    process.exit(0);
                }, 500);
            }, 3000);
        });
    });
});
