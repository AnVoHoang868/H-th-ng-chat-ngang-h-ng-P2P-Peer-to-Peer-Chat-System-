

interface Conversation {
  id: string
  name: string
  lastMessage: string
  time: string
  status: 'connected' | 'syncing' | 'offline'
  peerId: string
}

const conversations: Conversation[] = [
  {
    id: '1',
    name: 'Vitalik_E',
    lastMessage: 'Hey, did you check the latest block updates on the mainnet?',
    time: '2 phút trước',
    status: 'connected',
    peerId: '0x492...88a2',
  },
  {
    id: '2',
    name: 'Alice_Vault',
    lastMessage: 'The multi-sig transaction is pending your approval.',
    time: '1 giờ trước',
    status: 'syncing',
    peerId: '0x12b...f991',
  },
  {
    id: '3',
    name: 'Deep_State',
    lastMessage: 'Attached the whitepaper for the new P2P protocol.',
    time: 'Hôm qua',
    status: 'offline',
    peerId: '0xbb2...9012',
  },
  {
    id: '4',
    name: 'Node_Runner_88',
    lastMessage: 'Your node is perfectly synced. 100% uptime achieved this week.',
    time: '2 ngày trước',
    status: 'connected',
    peerId: '0x992...22f1',
  },
]

const statusConfig = {
  connected: { label: 'CONNECTED', bg: 'bg-primary/10', text: 'text-primary', dot: 'bg-primary shadow-[0_0_8px_rgba(190,194,255,0.4)]' },
  syncing: { label: 'SYNCING', bg: 'bg-amber-400/10', text: 'text-amber-400', dot: 'bg-amber-400 animate-pulse' },
  offline: { label: 'OFFLINE', bg: 'bg-slate-800', text: 'text-slate-500', dot: 'bg-slate-600' },
}

export default function DirectMessagesPage() {
  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-10 space-y-8 max-w-5xl mx-auto w-full">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="space-y-1">
                <h2 className="text-3xl font-black tracking-tight text-white font-headline">Tin nhắn</h2>
                <p className="text-on-surface-variant text-sm font-medium">
                  Quản lý các kết nối mã hóa ngang hàng.
                </p>
              </div>
              <button className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-br from-primary-fixed-dim to-primary-container text-on-primary-fixed font-bold rounded-xl shadow-lg shadow-indigo-900/20 active:scale-95 transition-all">
                <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>add_comment</span>
                <span>Tin nhắn mới</span>
              </button>
            </div>

            {/* Search */}
            <div className="bg-surface-container-low p-4 rounded-xl flex items-center gap-4">
              <div className="flex-1 relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">fingerprint</span>
                <input
                  className="w-full bg-surface-container-lowest border-none rounded-lg pl-12 pr-4 py-3 text-sm focus:ring-1 focus:ring-primary/40 transition-shadow text-on-surface placeholder:text-outline/50 outline-none"
                  placeholder="Nhập Peer ID (VD: 0x...) để bắt đầu trò chuyện"
                  type="text"
                />
              </div>
              <button className="bg-surface-container-highest px-4 py-3 rounded-lg text-on-surface hover:bg-slate-700 transition-colors">
                <span className="material-symbols-outlined">filter_list</span>
              </button>
            </div>

            {/* Conversation List */}
            <div className="space-y-3">
              {conversations.map((conv) => {
                const sc = statusConfig[conv.status]
                return (
                  <div
                    key={conv.id}
                    className={`group flex items-center gap-4 p-4 bg-surface-container-low hover:bg-surface-container-high rounded-xl cursor-pointer transition-all ${
                      conv.status === 'offline' ? 'grayscale-[0.5]' : ''
                    }`}
                  >
                    <div className="relative shrink-0">
                      <div className="w-14 h-14 rounded-xl bg-surface-container-highest flex items-center justify-center text-xl font-bold text-outline">
                        {conv.name[0]}
                      </div>
                      <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-4 border-surface-container-low ${sc.dot}`}></div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <h3 className={`font-bold truncate ${conv.status === 'offline' ? 'text-slate-300' : 'text-on-surface'}`}>
                          {conv.name}
                        </h3>
                        <span className="text-[10px] text-slate-500 font-label tracking-wider uppercase">{conv.time}</span>
                      </div>
                      <p className={`text-sm truncate pr-8 ${conv.status === 'syncing' ? 'text-slate-500 italic' : 'text-slate-400'}`}>
                        {conv.lastMessage}
                      </p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase ${sc.bg} ${sc.text}`}>
                          {sc.label}
                        </span>
                        <span className="text-[10px] text-slate-600 font-mono">{conv.peerId}</span>
                      </div>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="material-symbols-outlined text-slate-500 hover:text-white">more_vert</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Connect CTA */}
            <div className="bg-indigo-950/20 rounded-2xl p-8 flex flex-col items-center text-center space-y-4 border border-indigo-500/10">
              <div className="w-16 h-16 bg-surface-container-high rounded-full flex items-center justify-center">
                <span className="material-symbols-outlined text-indigo-400 text-3xl">share</span>
              </div>
              <div className="max-w-xs">
                <h4 className="text-lg font-bold text-indigo-200">Kết nối với người khác</h4>
                <p className="text-sm text-slate-400">
                  Chia sẻ liên kết ID của bạn để bắt đầu cuộc trò chuyện mã hóa với các peer trên toàn cầu.
                </p>
              </div>
              <button className="bg-surface-container-high hover:bg-surface-container-highest px-6 py-2 rounded-xl text-indigo-400 text-sm font-bold transition-all border border-indigo-500/20">
                Sao chép Peer ID
              </button>
            </div>
    </div>
  )
}
