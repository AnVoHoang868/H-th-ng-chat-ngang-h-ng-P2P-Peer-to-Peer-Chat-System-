import { Outlet } from 'react-router-dom'
import TopNavBar from './TopNavBar'
import SideNavBar from './SideNavBar'
import BottomNavBar from './BottomNavBar'

interface AppLayoutProps {
  showSidebar?: boolean
}

export default function AppLayout({ showSidebar = true }: AppLayoutProps) {
  return (
    <div className="bg-surface text-on-surface h-screen overflow-hidden flex flex-col">
      <TopNavBar />
      <div className="flex flex-1 overflow-hidden">
        {showSidebar && <SideNavBar />}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Outlet />
        </main>
      </div>
      <BottomNavBar />
    </div>
  )
}
