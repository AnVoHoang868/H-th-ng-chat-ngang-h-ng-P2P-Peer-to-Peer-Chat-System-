import { useState } from 'react'

interface ChatMessage {
  id: string
  sender: string
  content: string
  time: string
  isMe: boolean
  avatar?: string
}

const initialMessages: ChatMessage[] = [
  {
    id: '1',
    sender: 'Jordan',
    content: "Hey everyone, I've just pushed the latest updates to the peer discovery module. Can someone take a quick look at the PR?",
    time: 'Hôm nay lúc 10:24 AM',
    isMe: false,
  },
  {
    id: '2',
    sender: 'Sarah',
    content: "On it! I'll check the crypto signatures implementation specifically. The last merge had some issues with the handshake latency.",
    time: 'Hôm nay lúc 10:26 AM',
    isMe: false,
  },
  {
    id: '3',
    sender: 'Alex (Bạn)',
    content: "Thanks Sarah. I've also added the new emoji support icons. Checking the build status now. 🚀",
    time: 'Hôm nay lúc 10:45 AM',
    isMe: true,
  },
]

const onlinePeers = ['Jordan', 'Sarah', 'Mike.dev', 'LinterBot']
const offlinePeers = ['Elena', 'Marcus']

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [inputValue, setInputValue] = useState('')

  const handleSend = () => {
    if (!inputValue.trim()) return
    const newMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'Alex (Bạn)',
      content: inputValue,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      isMe: true,
    }
    setMessages([...messages, newMsg])
    setInputValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden">

        {/* Main Chat Area */}
        <main className="flex-1 bg-surface flex flex-col relative overflow-hidden">
          {/* Channel Header */}
          <div className="h-12 flex items-center justify-between px-6 bg-surface-container-low shadow-sm z-10">
            <div className="flex items-center gap-2">
              <span className="text-outline">#</span>
              <h1 className="font-bold text-sm tracking-tight">Phát triển</h1>
              <span className="mx-2 w-[1px] h-4 bg-outline-variant/30"></span>
              <p className="text-xs text-on-surface-variant font-normal truncate max-w-md">
                Thảo luận dự án, xem xét mã nguồn và nhật ký triển khai.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span className="material-symbols-outlined text-xl text-outline hover:text-on-surface cursor-pointer">push_pin</span>
              <span className="material-symbols-outlined text-xl text-outline hover:text-on-surface cursor-pointer">group_add</span>
              <span className="material-symbols-outlined text-xl text-outline hover:text-on-surface cursor-pointer">inbox</span>
            </div>
          </div>

          {/* Messages */}
          <section className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
            {messages.map((msg, i) => (
              <div key={msg.id}>
                {/* Date divider before "me" messages */}
                {msg.isMe && i > 0 && !messages[i - 1].isMe && (
                  <div className="relative flex items-center py-4 mb-8">
                    <div className="flex-grow border-t border-outline-variant/20"></div>
                    <span className="flex-shrink mx-4 text-[10px] font-bold text-outline uppercase tracking-[0.2em]">TIN NHẮN MỚI</span>
                    <div className="flex-grow border-t border-outline-variant/20"></div>
                  </div>
                )}

                {msg.isMe ? (
                  <div className="flex gap-4 group justify-end">
                    <div className="flex-1 min-w-0 flex flex-col items-end">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-[10px] text-outline font-medium tracking-wide">{msg.time}</span>
                        <span className="text-sm font-bold text-primary-fixed-dim">{msg.sender}</span>
                      </div>
                      <div className="bg-primary-container p-4 rounded-xl rounded-tr-sm max-w-2xl text-sm leading-relaxed text-on-primary-container shadow-lg shadow-primary-container/20">
                        {msg.content}
                      </div>
                    </div>
                    <div className="w-10 h-10 rounded-xl mt-1 bg-primary-container flex items-center justify-center text-on-primary-container text-xs font-bold border-2 border-primary-container">
                      A
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-4 group">
                    <div className="w-10 h-10 rounded-xl mt-1 bg-surface-container-highest flex items-center justify-center text-outline text-xs font-bold">
                      {msg.sender[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-sm font-bold text-primary">{msg.sender}</span>
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

            {/* System Card */}
            <div className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/10 flex flex-col md:flex-row gap-6 items-center">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-primary text-xl">terminal</span>
                  <h3 className="font-bold text-sm">Triển khai thành công</h3>
                </div>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Lõi hệ thống v2.4.0 hiện đã hoạt động trên mạng thử nghiệm. Tất cả các nút báo cáo đồng bộ hóa 100%.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 w-full md:w-auto">
                <div className="bg-surface-container-high p-3 rounded-lg text-center">
                  <div className="text-[10px] text-outline uppercase font-bold mb-1">ĐỘ TRỄ</div>
                  <div className="text-primary font-bold">14ms</div>
                </div>
                <div className="bg-surface-container-high p-3 rounded-lg text-center">
                  <div className="text-[10px] text-outline uppercase font-bold mb-1">NÚT MẠNG</div>
                  <div className="text-primary font-bold">1.2k</div>
                </div>
              </div>
            </div>
          </section>

          {/* Chat Input */}
          <footer className="p-6 pt-0">
            <div className="bg-surface-container-high rounded-xl p-2 focus-within:ring-1 focus-within:ring-primary-container/50 transition-all shadow-xl">
              <div className="flex items-end gap-2 px-2">
                <button className="p-2 text-outline hover:text-primary transition-colors">
                  <span className="material-symbols-outlined">add_circle</span>
                </button>
                <textarea
                  className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2 max-h-48 custom-scrollbar resize-none text-on-surface placeholder:text-outline outline-none"
                  placeholder="Nhắn tin tại #Phát-triển"
                  rows={1}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                ></textarea>
                <div className="flex items-center gap-1 pb-1">
                  <button className="p-2 text-outline hover:text-primary transition-colors">
                    <span className="material-symbols-outlined">sentiment_satisfied</span>
                  </button>
                  <button className="p-2 text-outline hover:text-primary transition-colors">
                    <span className="material-symbols-outlined">gif_box</span>
                  </button>
                  <button
                    className="bg-primary-container text-on-primary-container p-2 rounded-lg hover:opacity-90 transition-opacity"
                    onClick={handleSend}
                  >
                    <span className="material-symbols-outlined">send</span>
                  </button>
                </div>
              </div>
            </div>
          </footer>
        </main>

        {/* Right Sidebar (Peers List) */}
        <aside className="hidden lg:flex w-64 bg-surface-container-low flex-col font-inter">
          <div className="p-6 h-full overflow-y-auto custom-scrollbar">
            <div className="mb-8">
              <h3 className="text-[10px] font-bold text-outline uppercase tracking-widest mb-4">
                TRỰC TUYẾN — {onlinePeers.length}
              </h3>
              <div className="space-y-4">
                {onlinePeers.map((peer) => (
                  <div key={peer} className="flex items-center gap-3 group cursor-pointer">
                    <div className="relative">
                      <div className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-xs font-bold text-outline group-hover:text-primary transition-colors">
                        {peer === 'LinterBot' ? 'BOT' : peer[0]}
                      </div>
                      <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-primary rounded-full border-2 border-surface-container-low"></div>
                    </div>
                    <span className="text-sm font-medium text-on-surface-variant group-hover:text-primary transition-colors">
                      {peer}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mb-8 opacity-40">
              <h3 className="text-[10px] font-bold text-outline uppercase tracking-widest mb-4">
                NGOẠI TUYẾN — {offlinePeers.length}
              </h3>
              <div className="space-y-4">
                {offlinePeers.map((peer) => (
                  <div key={peer} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-xs font-bold text-outline">
                      {peer[0]}
                    </div>
                    <span className="text-sm font-medium text-outline">{peer}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>
  )
}
