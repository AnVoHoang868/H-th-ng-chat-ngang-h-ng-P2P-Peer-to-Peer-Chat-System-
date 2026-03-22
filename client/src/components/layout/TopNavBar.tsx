import { Link, useLocation } from 'react-router-dom'

export default function TopNavBar() {
  const location = useLocation()
  const navItems = [
    { label: 'Trang chủ', path: '/home' },
    { label: 'Máy chủ', path: '/chat' },
    { label: 'Khám phá', path: '/messages' },
  ]

  return (
    <header className="w-full h-14 shrink-0 z-40 bg-slate-950 flex items-center justify-between px-6 font-inter text-sm font-medium border-b border-outline-variant/10">
      <div className="flex items-center gap-8">
        <Link to="/home" className="flex items-center gap-2">
          <span className="material-symbols-outlined text-indigo-400 text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>hub</span>
          <span className="text-lg font-black text-indigo-400 tracking-tighter uppercase">P2P Chat</span>
        </Link>
        <nav className="hidden md:flex items-center gap-6">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={
                location.pathname === item.path
                  ? 'text-indigo-400 border-b-2 border-indigo-400 pb-1'
                  : 'text-slate-400 hover:text-slate-200 transition-colors'
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <button className="text-slate-400 hover:text-indigo-300 transition-colors">
            <span className="material-symbols-outlined">notifications</span>
          </button>
          <button className="text-slate-400 hover:text-indigo-300 transition-colors">
            <span className="material-symbols-outlined">settings</span>
          </button>
          <button className="text-slate-400 hover:text-indigo-300 transition-colors">
            <span className="material-symbols-outlined">help</span>
          </button>
          <div className="w-8 h-8 rounded-full overflow-hidden bg-surface-container-highest flex items-center justify-center">
            <span className="material-symbols-outlined text-outline text-lg">person</span>
          </div>
        </div>
      </div>
    </header>
  )
}
