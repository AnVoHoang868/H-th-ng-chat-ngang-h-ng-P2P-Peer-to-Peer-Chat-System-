import { Link } from 'react-router-dom'
import TopNavBar from '../components/layout/TopNavBar'
import BottomNavBar from '../components/layout/BottomNavBar'

export default function HomePage() {
  const features = [
    {
      title: 'Không máy chủ trung tâm',
      desc: 'Loại bỏ trung gian. Dữ liệu của bạn di chuyển trực tiếp giữa các thiết bị qua đường dẫn được mã hóa, đảm bảo không có điểm lỗi duy nhất.',
      icon: 'dns',
      span: 'md:col-span-2',
      large: true,
    },
    {
      title: 'Truyền tin đáng tin cậy',
      desc: 'Giao thức gossip nâng cao đảm bảo tin nhắn của bạn đến đích ngay cả qua điều kiện mạng không ổn định.',
      icon: 'verified',
    },
    {
      title: 'Trò chuyện nhóm',
      desc: 'Giao tiếp đa bên an toàn sử dụng quản lý danh tính phi tập trung. Không cần số điện thoại.',
      icon: 'groups',
    },
  ]

  return (
    <div className="bg-surface text-on-surface min-h-screen flex flex-col">
      <TopNavBar />
      <main className="flex-1 overflow-y-auto bg-surface-container-lowest">
          {/* Hero Section */}
          <div className="relative px-6 py-16 md:py-24 lg:px-12 flex flex-col items-center text-center max-w-6xl mx-auto">
            <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,rgba(88,101,242,0.08),transparent_70%)]"></div>
            <span className="inline-block px-4 py-1.5 rounded-full bg-primary-container/20 text-primary text-[10px] font-bold tracking-[0.2em] uppercase mb-6 border border-primary/20">
              Trạng thái mạng: Hoạt động
            </span>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tighter text-on-surface mb-6 leading-[0.95] max-w-4xl">
              P2P Connect: Giao tiếp trực tiếp,{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-br from-primary to-surface-tint">
                Không giới hạn
              </span>
            </h1>
            <p className="text-lg md:text-xl text-on-surface-variant font-medium max-w-2xl mb-10 leading-relaxed">
              Hệ thống chat ngang hàng cho truyền tin bảo mật và phi tập trung. 
              Quyền sở hữu thuộc về người dùng, không phải nền tảng.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                to="/"
                className="px-8 py-4 rounded-xl bg-gradient-to-br from-primary to-primary-container text-on-primary font-bold text-base shadow-xl shadow-primary-container/20 hover:scale-[1.02] active:scale-95 transition-all"
              >
                Tham gia mạng
              </Link>
              <button className="px-8 py-4 rounded-xl bg-surface-container-high text-on-surface font-semibold text-base border border-outline-variant/20 hover:bg-surface-container-highest transition-all">
                Đọc tài liệu
              </button>
            </div>
          </div>

          {/* Features Bento Grid */}
          <div className="px-6 py-24 max-w-6xl mx-auto">
            <div className="mb-12">
              <h2 className="text-xs uppercase tracking-[0.3em] text-primary font-bold mb-4">Kiến trúc lõi</h2>
              <h3 className="text-3xl font-bold text-on-surface tracking-tight">Tại sao chọn P2P?</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {features.map((f) => (
                <div
                  key={f.title}
                  className={`group relative bg-surface-container-low rounded-3xl p-8 overflow-hidden transition-all hover:bg-surface-container-high ${f.span || ''}`}
                >
                  <div className={f.large ? 'absolute top-0 right-0 p-8' : 'mb-6'}>
                    {f.large ? (
                      <span className="material-symbols-outlined text-primary text-5xl opacity-20 group-hover:scale-110 transition-transform">{f.icon}</span>
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                        <span className="material-symbols-outlined text-primary">{f.icon}</span>
                      </div>
                    )}
                  </div>
                  <div className={f.large ? 'relative z-10 h-full flex flex-col justify-end' : ''}>
                    <h4 className={`font-bold text-on-surface mb-3 ${f.large ? 'text-2xl' : 'text-xl'}`}>{f.title}</h4>
                    <p className={`text-on-surface-variant leading-relaxed ${f.large ? 'max-w-md' : 'text-sm'}`}>{f.desc}</p>
                  </div>
                </div>
              ))}

              {/* End-to-End Feature */}
              <div className="md:col-span-2 group relative bg-gradient-to-br from-primary-container/20 to-surface-container-low rounded-3xl p-8 border border-primary/10 overflow-hidden transition-all hover:border-primary/30">
                <div className="flex flex-col md:flex-row items-center gap-8">
                  <div className="flex-1">
                    <h4 className="text-2xl font-bold text-on-surface mb-3">Bảo mật đầu cuối</h4>
                    <p className="text-on-surface-variant leading-relaxed">
                      Mỗi nút trong mạng đóng vai trò là một trạm chuyển tiếp, tạo nên lớp giao tiếp toàn cầu mở rộng cùng người dùng.
                    </p>
                  </div>
                  <div className="w-32 h-32 flex-shrink-0 bg-primary/10 rounded-full flex items-center justify-center border border-primary/20">
                    <span className="material-symbols-outlined text-primary text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>security</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <footer className="px-6 py-12 border-t border-outline-variant/10 bg-surface">
            <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
              <div className="flex flex-col items-center md:items-start gap-2">
                <span className="text-xl font-black text-indigo-400 tracking-tighter">P2P Connect</span>
                <p className="text-on-surface-variant text-xs font-medium">© 2024 P2P Decentralized Systems. All rights reserved.</p>
              </div>
              <div className="flex gap-8 text-on-surface-variant text-sm font-medium">
                <a className="hover:text-primary transition-colors" href="#">Privacy</a>
                <a className="hover:text-primary transition-colors" href="#">Terms</a>
                <a className="hover:text-primary transition-colors" href="#">GitHub</a>
                <a className="hover:text-primary transition-colors" href="#">Status</a>
              </div>
            </div>
          </footer>
      </main>
      <BottomNavBar />
    </div>
  )
}
