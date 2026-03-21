import { Link, useLocation } from 'react-router-dom'

export default function BottomNavBar() {
  const location = useLocation()

  const items = [
    { label: 'Trang chủ', icon: 'home', path: '/home' },
    { label: 'Trò chuyện', icon: 'chat_bubble', path: '/chat' },
    { label: 'Khám phá', icon: 'explore', path: '/messages' },
    { label: 'Hồ sơ', icon: 'person', path: '#' },
  ]

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-slate-950 flex items-center justify-around px-4 z-50 border-t border-outline-variant/10">
      {items.map((item) => (
        <Link
          key={item.path}
          to={item.path}
          className={`flex flex-col items-center gap-1 ${
            location.pathname === item.path ? 'text-indigo-400' : 'text-slate-400'
          }`}
        >
          <span
            className="material-symbols-outlined"
            style={
              location.pathname === item.path
                ? { fontVariationSettings: "'FILL' 1" }
                : undefined
            }
          >
            {item.icon}
          </span>
          <span className="text-[10px] font-medium">{item.label}</span>
        </Link>
      ))}
    </nav>
  )
}
