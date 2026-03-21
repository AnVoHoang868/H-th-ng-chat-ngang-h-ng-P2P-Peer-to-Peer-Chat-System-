import { Link, useLocation } from 'react-router-dom'

interface SideNavBarProps {
  activeChannel?: string
}

export default function SideNavBar({ activeChannel = 'Phát triển' }: SideNavBarProps) {
  const location = useLocation()

  const channels = [
    { name: 'Phát triển', icon: 'chat_bubble' },
    { name: 'Toàn cầu', icon: 'public' },
    { name: 'Chung', icon: 'tag' },
  ]

  return (
    <aside className="hidden md:flex h-full w-64 border-none bg-slate-900/80 backdrop-blur-xl shadow-2xl shadow-indigo-950/20 flex-col font-inter text-sm tracking-tight overflow-hidden shrink-0">
      {/* Brand Header */}
      <div className="p-4 flex items-center gap-3 bg-slate-950/50">
        <div className="w-10 h-10 rounded-xl bg-primary-container flex items-center justify-center">
          <span className="material-symbols-outlined text-on-primary-container">hub</span>
        </div>
        <div>
          <h2 className="text-indigo-200 font-bold tracking-widest uppercase text-xs">KẾT NỐI P2P</h2>
          <p className="text-[10px] text-primary flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-primary rounded-full"></span> Trực tuyến
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 space-y-1 overflow-y-auto custom-scrollbar px-2">
        <div className="px-3 mb-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">MỤC YÊU THÍCH</span>
        </div>
        <a className="flex items-center gap-3 px-4 py-2 text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 transition-colors rounded-lg cursor-pointer" href="#">
          <span className="material-symbols-outlined text-lg">grade</span>
          <span>Đã đánh dấu sao</span>
        </a>

        <div className="px-3 mt-6 mb-2 flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">KÊNH</span>
          <span className="material-symbols-outlined text-xs text-slate-500 cursor-pointer hover:text-indigo-400">add</span>
        </div>

        {channels.map((ch) => (
          <Link
            key={ch.name}
            to="/chat"
            className={
              activeChannel === ch.name
                ? 'flex items-center gap-3 px-4 py-2 bg-slate-800 text-indigo-200 rounded-lg relative before:absolute before:left-0 before:w-1 before:h-6 before:bg-indigo-400 before:rounded-r-full transition-all duration-200'
                : 'flex items-center gap-3 px-4 py-2 text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 transition-colors rounded-lg'
            }
          >
            <span className="material-symbols-outlined text-lg">{ch.icon}</span>
            <span>{ch.name}</span>
          </Link>
        ))}

        <div className="px-3 mt-6 mb-2 flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">TIN NHẮN TRỰC TIẾP</span>
          <span className="material-symbols-outlined text-xs text-slate-500 cursor-pointer">settings</span>
        </div>
        <Link
          to="/messages"
          className={
            location.pathname === '/messages'
              ? 'flex items-center gap-3 px-4 py-2 bg-slate-800 text-indigo-200 rounded-lg relative before:absolute before:left-0 before:w-1 before:h-6 before:bg-indigo-400 before:rounded-r-full'
              : 'flex items-center gap-3 px-4 py-2 text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 transition-colors rounded-lg'
          }
        >
          <span className="material-symbols-outlined text-lg">group</span>
          <span>Tin nhắn trực tiếp</span>
        </Link>
        <Link
          to="/messages"
          className="flex items-center gap-3 px-4 py-2 text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 transition-colors rounded-lg"
        >
          <span className="material-symbols-outlined text-lg">alternate_email</span>
          <span>Tin nhắn cá nhân</span>
        </Link>
      </nav>

      {/* Bottom Profile */}
      <div className="p-4 bg-slate-950/50 flex items-center gap-3 mt-auto">
        <div className="relative">
          <div className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-xs font-bold text-outline">U</div>
          <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-primary rounded-full border-2 border-slate-900 shadow-[0_0_8px_rgba(190,194,255,0.6)]"></div>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-200">Alex</p>
          <p className="text-[10px] text-slate-500">#4412</p>
        </div>
      </div>
    </aside>
  )
}
