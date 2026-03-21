import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function JoinNetworkPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [bootstrapIp, setBootstrapIp] = useState('127.0.0.1')
  const [port, setPort] = useState('8080')
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected'>('idle')

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('connecting')
    setTimeout(() => {
      setStatus('connected')
      setTimeout(() => navigate('/chat'), 800)
    }, 1500)
  }

  return (
    <div className="bg-surface text-on-surface font-inter antialiased overflow-hidden h-screen flex items-center justify-center selection:bg-primary-container selection:text-white">
      {/* Background Decoration */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[5%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px]"></div>
        <div className="absolute -bottom-[10%] -right-[5%] w-[35%] h-[35%] bg-primary-container/10 rounded-full blur-[120px]"></div>
      </div>

      {/* Main Content */}
      <main className="relative z-10 w-full max-w-lg px-6">
        {/* Logo */}
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="mb-3 bg-surface-container-high p-3 rounded-xl shadow-2xl">
            <span className="material-symbols-outlined text-3xl text-primary">hub</span>
          </div>
          <h1 className="text-2xl font-black tracking-tighter text-on-surface mb-1">P2P Chat</h1>
          <p className="text-[10px] uppercase tracking-[0.2em] text-outline">Giao thức phi tập trung v1.0</p>
        </div>

        {/* Registration Card */}
        <div className="glass-panel p-6 rounded-xl shadow-2xl border border-outline-variant/10">
          <div className="space-y-5">
            <div className="text-center">
              <h2 className="text-xl font-bold text-on-surface">Tham gia mạng</h2>
              <p className="text-sm text-on-surface-variant mt-1">Cấu hình nút của bạn để bắt đầu trò chuyện.</p>
            </div>

            <form className="space-y-4" onSubmit={handleConnect}>
              {/* Username */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-primary uppercase tracking-wider ml-1" htmlFor="username">
                  Tên người dùng
                </label>
                <div className="group relative flex items-center">
                  <span className="material-symbols-outlined absolute left-4 text-outline group-focus-within:text-primary transition-colors text-xl">person</span>
                  <input
                    className="w-full pl-12 pr-4 py-2.5 bg-surface-container-high rounded-lg ghost-border focus:ring-0 text-on-surface placeholder:text-outline/50 transition-all outline-none"
                    id="username"
                    placeholder="VD: Satoshi"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
              </div>

              {/* Bootstrap Server IP */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-primary uppercase tracking-wider ml-1" htmlFor="bootstrap_ip">
                  Địa chỉ IP Bootstrap Server
                </label>
                <div className="group relative flex items-center">
                  <span className="material-symbols-outlined absolute left-4 text-outline group-focus-within:text-primary transition-colors text-xl">dns</span>
                  <input
                    className="w-full pl-12 pr-4 py-3.5 bg-surface-container-high rounded-lg ghost-border focus:ring-0 text-on-surface placeholder:text-outline/50 transition-all outline-none"
                    id="bootstrap_ip"
                    placeholder="127.0.0.1"
                    type="text"
                    value={bootstrapIp}
                    onChange={(e) => setBootstrapIp(e.target.value)}
                  />
                </div>
              </div>

              {/* Port */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-primary uppercase tracking-wider ml-1" htmlFor="port">
                  Số cổng (Port)
                </label>
                <div className="group relative flex items-center">
                  <span className="material-symbols-outlined absolute left-4 text-outline group-focus-within:text-primary transition-colors text-xl">settings_input_component</span>
                  <input
                    className="w-full pl-12 pr-4 py-3.5 bg-surface-container-high rounded-lg ghost-border focus:ring-0 text-on-surface placeholder:text-outline/50 transition-all outline-none"
                    id="port"
                    placeholder="8080"
                    type="number"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                  />
                </div>
              </div>

              {/* Submit */}
              <button
                className="w-full primary-gradient text-on-primary-container font-bold py-3 rounded-lg shadow-lg hover:shadow-primary-container/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2 group"
                type="submit"
                disabled={status === 'connecting'}
              >
                <span>{status === 'connecting' ? 'Đang kết nối...' : 'Kết nối vào mạng'}</span>
                <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span>
              </button>
            </form>

            {/* Status Area */}
            <div className="pt-3 mt-3 border-t border-outline-variant/10">
              <div className="flex items-center gap-3 px-3 py-2 bg-surface-container-low rounded-lg">
                <div className="relative flex items-center justify-center">
                  <div className={`absolute w-2.5 h-2.5 rounded-full blur-[4px] animate-pulse ${
                    status === 'connected' ? 'bg-green-400' : 'bg-primary'
                  }`}></div>
                  <div className={`w-2 h-2 rounded-full relative z-10 ${
                    status === 'connected' ? 'bg-green-400' : 'bg-primary'
                  }`}></div>
                </div>
                <span className="text-sm text-on-surface-variant font-medium">
                  {status === 'idle' && 'Sẵn sàng kết nối...'}
                  {status === 'connecting' && 'Đang tìm kiếm peers...'}
                  {status === 'connected' && 'Kết nối thành công!'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 flex justify-center gap-6">
          <a className="text-xs text-outline hover:text-primary transition-colors" href="#">Chính sách</a>
          <a className="text-xs text-outline hover:text-primary transition-colors" href="#">Tài liệu</a>
          <a className="text-xs text-outline hover:text-primary transition-colors" href="#">v1.0.0</a>
        </div>
      </main>
    </div>
  )
}
