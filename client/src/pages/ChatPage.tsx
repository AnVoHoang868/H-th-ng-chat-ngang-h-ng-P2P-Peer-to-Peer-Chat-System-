import { useState, useEffect, useRef } from 'react'
import socketService from '../services/socketService'
import { PeerInfo, BaseMessage, ChatPrivatePayload } from '@shared/types'

interface ChatMessage {
  id: string
  senderId: string
  senderName: string
  content: string
  time: string
  isMe: boolean
}

export default function ChatPage() {
  const [peers, setPeers] = useState<PeerInfo[]>([])
  const [activePeer, setActivePeer] = useState<PeerInfo | null>(null)
  const [messagesByPeer, setMessagesByPeer] = useState<Record<string, ChatMessage[]>>({})
  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messagesByPeer, activePeer])

  useEffect(() => {
    // Initial peers load
    setPeers(socketService.peers)

    const unsubscribePeers = socketService.onPeerListUpdate((updatedPeers) => {
      setPeers(updatedPeers)
      // Note: If activePeer goes offline, we keep them selected to see messages, 
      // but status will show offline if we update activePeer object.
    })

    // socketService đã giải mã E2EE (nếu có) — msg.payload.content là plaintext cho UI
    const unsubscribeMessages = socketService.onMessage((msg: BaseMessage<ChatPrivatePayload>) => {
      const senderInfo = socketService.peers.find(p => p.id === msg.senderId)
      const senderName = senderInfo ? senderInfo.username : 'Unknown'

      const newMsg: ChatMessage = {
        id: msg.messageId,
        senderId: msg.senderId,
        senderName: senderName,
        content: msg.payload.content ?? '',
        time: new Date(msg.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        isMe: false,
      }

      setMessagesByPeer(prev => {
        const existing = prev[msg.senderId] || []
        return {
          ...prev,
          [msg.senderId]: [...existing, newMsg]
        }
      })
    })

    return () => {
      unsubscribePeers()
      unsubscribeMessages()
    }
  }, [])

  // sendPrivateMessage là async (ECDH + AES-GCM trước khi emit); chỉ append UI sau khi gửi thành công
  const handleSend = async () => {
    if (!inputValue.trim() || !activePeer) return

    try {
      await socketService.sendPrivateMessage(activePeer.id, inputValue)
    } catch (e) {
      console.error('Gửi tin thất bại', e)
      return
    }

    const newMsg: ChatMessage = {
      id: Date.now().toString(),
      senderId: socketService.selfId,
      senderName: socketService.username,
      content: inputValue,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      isMe: true,
    }

    setMessagesByPeer(prev => {
      const existing = prev[activePeer.id] || []
      return {
        ...prev,
        [activePeer.id]: [...existing, newMsg]
      }
    })

    setInputValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const currentMessages = activePeer ? (messagesByPeer[activePeer.id] || []) : []
  const onlinePeers = peers.filter(p => p.status === 'ONLINE')
  const offlinePeers = peers.filter(p => p.status === 'OFFLINE')

  return (
    <div className="flex flex-1 overflow-hidden">

        {/* Main Chat Area */}
        <main className="flex-1 bg-surface flex flex-col relative overflow-hidden">
          {/* Channel Header */}
          <div className="h-12 flex items-center justify-between px-6 bg-surface-container-low shadow-sm z-10 shrink-0">
            <div className="flex items-center gap-2">
              {activePeer ? (
                <>
                  <span className="material-symbols-outlined text-outline">alternate_email</span>
                  <h1 className="font-bold text-sm tracking-tight">{activePeer.username}</h1>
                  <span className="mx-2 w-[1px] h-4 bg-outline-variant/30"></span>
                  <p className="text-xs text-on-surface-variant font-normal">
                    Trò chuyện riêng tư P2P
                  </p>
                </>
              ) : (
                <>
                  <span className="text-outline">#</span>
                  <h1 className="font-bold text-sm tracking-tight">Kênh chung</h1>
                  <span className="mx-2 w-[1px] h-4 bg-outline-variant/30"></span>
                  <p className="text-xs text-on-surface-variant font-normal">
                    Chọn một người dùng bên phải để bắt đầu chat riêng tư.
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Messages */}
          <section className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
            {!activePeer && (
               <div className="h-full flex flex-col items-center justify-center text-outline opacity-50">
                 <span className="material-symbols-outlined text-6xl mb-4">forum</span>
                 <p>Vui lòng chọn một người dùng từ danh sách Trực tuyến để chat.</p>
               </div>
            )}

            {activePeer && currentMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-outline opacity-50">
                <span className="material-symbols-outlined text-4xl mb-2">waving_hand</span>
                <p>Hãy gửi lời chào đến {activePeer.username}!</p>
              </div>
            )}

            {activePeer && currentMessages.map((msg, i) => (
              <div key={msg.id}>
                {msg.isMe ? (
                  <div className="flex gap-4 group justify-end">
                    <div className="flex-1 min-w-0 flex flex-col items-end">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-[10px] text-outline font-medium tracking-wide">{msg.time}</span>
                        <span className="text-sm font-bold text-primary-fixed-dim">Bạn</span>
                      </div>
                      <div className="bg-primary-container p-4 rounded-xl rounded-tr-sm max-w-2xl text-sm leading-relaxed text-on-primary-container shadow-lg shadow-primary-container/20">
                        {msg.content}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-4 group">
                    <div className="w-10 h-10 rounded-xl mt-1 bg-surface-container-highest flex items-center justify-center text-outline text-xs font-bold uppercase">
                      {msg.senderName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-sm font-bold text-primary">{msg.senderName}</span>
                        <span className="text-[10px] text-outline font-medium tracking-wide">{msg.time}</span>
                      </div>
                      <div className="bg-surface-variant p-4 rounded-xl rounded-tl-sm max-w-2xl text-sm leading-relaxed text-on-surface-variant">
                        {msg.content}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </section>

          {/* Chat Input */}
          <footer className="p-6 pt-0 shrink-0">
            <div className={`bg-surface-container-high rounded-xl p-2 transition-all shadow-xl ${!activePeer ? 'opacity-50 cursor-not-allowed' : 'focus-within:ring-1 focus-within:ring-primary-container/50'}`}>
              <div className="flex items-end gap-2 px-2">
                <textarea
                  className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2 max-h-48 custom-scrollbar resize-none text-on-surface placeholder:text-outline outline-none disabled:cursor-not-allowed"
                  placeholder={activePeer ? `Nhắn tin cho ${activePeer.username}...` : "Chọn người dùng để nhắn tin..."}
                  rows={1}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={!activePeer}
                ></textarea>
                <div className="flex items-center gap-1 pb-1">
                  <button
                    className="bg-primary-container text-on-primary-container p-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                    onClick={handleSend}
                    disabled={!activePeer || !inputValue.trim()}
                  >
                    <span className="material-symbols-outlined">send</span>
                  </button>
                </div>
              </div>
            </div>
          </footer>
        </main>

        {/* Right Sidebar (Peers List) */}
        <aside className="hidden lg:flex w-64 bg-surface-container-low flex-col font-inter shrink-0 border-l border-outline-variant/10">
          <div className="p-6 h-full overflow-y-auto custom-scrollbar">
            <div className="mb-6">
              <h3 className="text-sm font-bold text-on-surface mb-1">Thành viên</h3>
              <p className="text-xs text-outline">ID: {socketService.selfId.slice(0,6)}...</p>
            </div>

            <div className="mb-8">
              <h3 className="text-[10px] font-bold text-green-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                TRỰC TUYẾN ({onlinePeers.length})
              </h3>
              <div className="space-y-2">
                {onlinePeers.map((peer) => (
                  <div 
                    key={peer.id} 
                    onClick={() => setActivePeer(peer)}
                    className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${activePeer?.id === peer.id ? 'bg-primary-container/20' : 'hover:bg-surface-container-highest'}`}
                  >
                    <div className="relative">
                      <div className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-xs font-bold text-outline uppercase group-hover:text-primary transition-colors">
                        {peer.username[0]}
                      </div>
                      <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-surface-container-low"></div>
                    </div>
                    <div className="flex flex-col overflow-hidden">
                      <span className={`text-sm font-medium truncate ${activePeer?.id === peer.id ? 'text-primary' : 'text-on-surface-variant'}`}>
                        {peer.username}
                      </span>
                      <span className="text-[10px] text-outline truncate">{peer.ip}:{peer.port}</span>
                    </div>
                  </div>
                ))}
                {onlinePeers.length === 0 && (
                  <p className="text-xs text-outline italic px-2">Đang đợi người dùng kết nối...</p>
                )}
              </div>
            </div>

            {offlinePeers.length > 0 && (
              <div className="mb-8 opacity-60">
                <h3 className="text-[10px] font-bold text-outline uppercase tracking-widest mb-4">
                  NGOẠI TUYẾN ({offlinePeers.length})
                </h3>
                <div className="space-y-2">
                  {offlinePeers.map((peer) => (
                    <div key={peer.id} className="flex items-center gap-3 p-2">
                      <div className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-xs font-bold text-outline uppercase">
                        {peer.username[0]}
                      </div>
                      <span className="text-sm font-medium text-outline truncate">{peer.username}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
  )
}
