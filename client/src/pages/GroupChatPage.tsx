import { useState, useEffect, useRef } from 'react'
import socketService from '../services/socketService'
import groupService, { GroupInfo, GroupMessage } from '../services/groupService'
import { PeerInfo } from '@shared/types'

export default function GroupChatPage() {
  const [groups, setGroups] = useState<GroupInfo[]>([])
  const [activeGroup, setActiveGroup] = useState<GroupInfo | null>(null)
  const [messagesByGroup, setMessagesByGroup] = useState<Record<string, GroupMessage[]>>({})
  const [inputValue, setInputValue] = useState('')
  const [peers, setPeers] = useState<PeerInfo[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Scroll xuống khi có tin nhắn mới
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messagesByGroup, activeGroup])

  useEffect(() => {
    // Khởi tạo groupService
    groupService.init()

    // Load danh sách groups hiện tại
    setGroups(groupService.groups)
    setPeers(socketService.peers)

    // Lắng nghe cập nhật danh sách groups
    const unsubGroups = groupService.onGroupListUpdate((updatedGroups) => {
      setGroups(updatedGroups)
      // Cập nhật activeGroup nếu nó vẫn tồn tại
      setActiveGroup(prev => {
        if (!prev) return null
        return updatedGroups.find(g => g.groupId === prev.groupId) || null
      })
    })

    // Lắng nghe tin nhắn nhóm
    const unsubMessages = groupService.onGroupMessage((msg: GroupMessage) => {
      setMessagesByGroup(prev => {
        const existing = prev[msg.groupId] || []
        return {
          ...prev,
          [msg.groupId]: [...existing, msg]
        }
      })
    })

    // Lắng nghe cập nhật peers
    const unsubPeers = socketService.onPeerListUpdate((updatedPeers) => {
      setPeers(updatedPeers)
    })

    return () => {
      unsubGroups()
      unsubMessages()
      unsubPeers()
    }
  }, [])

  // Gửi tin nhắn nhóm
  const handleSend = () => {
    if (!inputValue.trim() || !activeGroup) return

    groupService.sendGroupMessage(activeGroup.groupId, inputValue)

    // Thêm tin nhắn của mình vào UI
    const myMsg: GroupMessage = {
      id: Date.now().toString(),
      groupId: activeGroup.groupId,
      senderId: socketService.selfId,
      senderName: socketService.username,
      content: inputValue,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      isMe: true,
    }

    setMessagesByGroup(prev => {
      const existing = prev[activeGroup.groupId] || []
      return {
        ...prev,
        [activeGroup.groupId]: [...existing, myMsg]
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

  // Tạo nhóm mới
  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || selectedMembers.length === 0) return

    const result = await groupService.createGroup(newGroupName.trim(), selectedMembers)
    if (result.success) {
      setShowCreateModal(false)
      setNewGroupName('')
      setSelectedMembers([])
    }
  }

  // Rời nhóm
  const handleLeaveGroup = async () => {
    if (!activeGroup) return
    await groupService.leaveGroup(activeGroup.groupId)
    setActiveGroup(null)
  }

  // Toggle chọn member
  const toggleMember = (peerId: string) => {
    setSelectedMembers(prev =>
      prev.includes(peerId)
        ? prev.filter(id => id !== peerId)
        : [...prev, peerId]
    )
  }

  // Mời thêm thành viên vào nhóm đã có
  const handleInviteMembers = async () => {
    if (!activeGroup || selectedMembers.length === 0) return
    for (const peerId of selectedMembers) {
      await groupService.inviteMember(activeGroup.groupId, peerId)
    }
    setShowInviteModal(false)
    setSelectedMembers([])
  }

  // Lấy tên peer từ ID
  const getPeerName = (peerId: string): string => {
    if (peerId === socketService.selfId) return socketService.username
    const peer = peers.find(p => p.id === peerId)
    return peer?.username || peerId.slice(0, 8)
  }

  const currentMessages = activeGroup ? (messagesByGroup[activeGroup.groupId] || []) : []

  return (
    <div className="flex flex-1 overflow-hidden">

      {/* Left Panel — Danh sách nhóm */}
      <aside className="hidden md:flex w-72 bg-surface-container-low flex-col shrink-0 border-r border-outline-variant/10">
        <div className="p-4 flex items-center justify-between border-b border-outline-variant/10">
          <h2 className="font-bold text-sm text-on-surface tracking-tight">Nhóm chat</h2>
          <button
            onClick={() => setShowCreateModal(true)}
            className="p-2 rounded-lg bg-primary-container/20 text-primary hover:bg-primary-container/40 transition-colors"
            title="Tạo nhóm mới"
          >
            <span className="material-symbols-outlined text-lg">group_add</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
          {groups.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-outline opacity-50">
              <span className="material-symbols-outlined text-3xl mb-2">groups</span>
              <p className="text-xs text-center">Chưa có nhóm nào.<br/>Hãy tạo nhóm mới!</p>
            </div>
          )}
          {groups.map((group) => (
            <div
              key={group.groupId}
              onClick={() => setActiveGroup(group)}
              className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
                activeGroup?.groupId === group.groupId
                  ? 'bg-primary-container/20 border border-primary/20'
                  : 'hover:bg-surface-container-high'
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-primary text-lg">groups</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={`text-sm font-semibold truncate ${
                  activeGroup?.groupId === group.groupId ? 'text-primary' : 'text-on-surface'
                }`}>
                  {group.groupName}
                </h3>
                <p className="text-[10px] text-outline truncate">
                  {group.memberIds.length} thành viên
                </p>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 bg-surface flex flex-col relative overflow-hidden">
        {/* Header */}
        <div className="h-12 flex items-center justify-between px-6 bg-surface-container-low shadow-sm z-10 shrink-0">
          <div className="flex items-center gap-2">
            {activeGroup ? (
              <>
                <span className="material-symbols-outlined text-primary text-lg">groups</span>
                <h1 className="font-bold text-sm tracking-tight">{activeGroup.groupName}</h1>
                <span className="mx-2 w-[1px] h-4 bg-outline-variant/30"></span>
                <p className="text-xs text-on-surface-variant font-normal">
                  {activeGroup.memberIds.length} thành viên
                </p>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-outline">groups</span>
                <h1 className="font-bold text-sm tracking-tight">Nhóm chat</h1>
                <span className="mx-2 w-[1px] h-4 bg-outline-variant/30"></span>
                <p className="text-xs text-on-surface-variant font-normal">
                  Chọn một nhóm bên trái để bắt đầu chat.
                </p>
              </>
            )}
          </div>
          {activeGroup && (
            <button
              onClick={handleLeaveGroup}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-400/10 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">logout</span>
              Rời nhóm
            </button>
          )}
        </div>

        {/* Messages */}
        <section className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          {!activeGroup && (
            <div className="h-full flex flex-col items-center justify-center text-outline opacity-50">
              <span className="material-symbols-outlined text-6xl mb-4">forum</span>
              <p>Chọn một nhóm từ danh sách bên trái hoặc tạo nhóm mới.</p>
            </div>
          )}

          {activeGroup && currentMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-outline opacity-50">
              <span className="material-symbols-outlined text-4xl mb-2">chat_bubble</span>
              <p>Hãy gửi tin nhắn đầu tiên trong nhóm {activeGroup.groupName}!</p>
            </div>
          )}

          {activeGroup && currentMessages.map((msg) => (
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
          <div className={`bg-surface-container-high rounded-xl p-2 transition-all shadow-xl ${!activeGroup ? 'opacity-50 cursor-not-allowed' : 'focus-within:ring-1 focus-within:ring-primary-container/50'}`}>
            <div className="flex items-end gap-2 px-2">
              <textarea
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2 max-h-48 custom-scrollbar resize-none text-on-surface placeholder:text-outline outline-none disabled:cursor-not-allowed"
                placeholder={activeGroup ? `Nhắn tin trong ${activeGroup.groupName}...` : 'Chọn nhóm để nhắn tin...'}
                rows={1}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={!activeGroup}
              ></textarea>
              <div className="flex items-center gap-1 pb-1">
                <button
                  className="bg-primary-container text-on-primary-container p-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                  onClick={handleSend}
                  disabled={!activeGroup || !inputValue.trim()}
                >
                  <span className="material-symbols-outlined">send</span>
                </button>
              </div>
            </div>
          </div>
        </footer>
      </main>

      {/* Right Sidebar — Thành viên nhóm */}
      {activeGroup && (
        <aside className="hidden lg:flex w-64 bg-surface-container-low flex-col font-inter shrink-0 border-l border-outline-variant/10">
          <div className="p-4 flex items-center justify-between border-b border-outline-variant/10">
            <div>
              <h3 className="text-sm font-bold text-on-surface">Thành viên</h3>
              <p className="text-xs text-outline">{activeGroup.memberIds.length} người</p>
            </div>
            <button
              onClick={() => { setShowInviteModal(true); setSelectedMembers([]) }}
              className="p-2 rounded-lg bg-primary-container/20 text-primary hover:bg-primary-container/40 transition-colors"
              title="Mời thêm thành viên"
            >
              <span className="material-symbols-outlined text-lg">person_add</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
            {activeGroup.memberIds.map((memberId) => (
              <div
                key={memberId}
                className="flex items-center gap-3 p-2 rounded-lg"
              >
                <div className="relative">
                  <div className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-xs font-bold text-outline uppercase">
                    {getPeerName(memberId)[0]}
                  </div>
                  <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-surface-container-low"></div>
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="text-sm font-medium text-on-surface-variant truncate">
                    {getPeerName(memberId)}
                    {memberId === socketService.selfId && (
                      <span className="text-[10px] text-primary ml-1">(Bạn)</span>
                    )}
                  </span>
                  <span className="text-[10px] text-outline truncate">
                    {memberId.slice(0, 12)}...
                  </span>
                </div>
              </div>
            ))}
          </div>
        </aside>
      )}

      {/* Modal tạo nhóm */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface-container-low rounded-2xl shadow-2xl border border-outline-variant/10 w-full max-w-md mx-4 overflow-hidden">
            <div className="p-6 pb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-on-surface">Tạo nhóm mới</h2>
              <button onClick={() => { setShowCreateModal(false); setSelectedMembers([]); setNewGroupName('') }} className="p-1 rounded-lg hover:bg-surface-container-high transition-colors">
                <span className="material-symbols-outlined text-outline">close</span>
              </button>
            </div>
            <div className="px-6 mb-4">
              <label className="text-xs font-semibold text-primary uppercase tracking-wider mb-2 block">Tên nhóm</label>
              <input
                className="w-full px-4 py-2.5 bg-surface-container-high rounded-lg text-on-surface placeholder:text-outline/50 outline-none focus:ring-1 focus:ring-primary-container/50 transition-all text-sm"
                placeholder="VD: Nhóm dự án..."
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
              />
            </div>
            <div className="px-6 mb-4">
              <label className="text-xs font-semibold text-primary uppercase tracking-wider mb-2 block">
                Chọn thành viên ({selectedMembers.length} đã chọn)
              </label>
              <MemberPickerList peers={peers} selected={selectedMembers} onToggle={toggleMember} />
            </div>
            <div className="px-6 pb-6 flex gap-3 justify-end">
              <button onClick={() => { setShowCreateModal(false); setSelectedMembers([]); setNewGroupName('') }} className="px-4 py-2 rounded-lg text-sm font-medium text-on-surface-variant hover:bg-surface-container-high transition-colors">Hủy</button>
              <button onClick={handleCreateGroup} disabled={!newGroupName.trim() || selectedMembers.length === 0} className="px-6 py-2 rounded-lg text-sm font-bold bg-primary-container text-on-primary-container hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed">Tạo nhóm</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal mời thêm thành viên */}
      {showInviteModal && activeGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface-container-low rounded-2xl shadow-2xl border border-outline-variant/10 w-full max-w-md mx-4 overflow-hidden">
            <div className="p-6 pb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-on-surface">Mời thành viên</h2>
                <p className="text-xs text-outline">{activeGroup.groupName}</p>
              </div>
              <button onClick={() => { setShowInviteModal(false); setSelectedMembers([]) }} className="p-1 rounded-lg hover:bg-surface-container-high transition-colors">
                <span className="material-symbols-outlined text-outline">close</span>
              </button>
            </div>
            <div className="px-6 mb-4">
              <label className="text-xs font-semibold text-primary uppercase tracking-wider mb-2 block">
                Chọn peer để mời ({selectedMembers.length} đã chọn)
              </label>
              <MemberPickerList
                peers={peers.filter(p => !activeGroup.memberIds.includes(p.id))}
                selected={selectedMembers}
                onToggle={toggleMember}
                emptyMsg="Tất cả peer đang online đã ở trong nhóm."
              />
            </div>
            <div className="px-6 pb-6 flex gap-3 justify-end">
              <button onClick={() => { setShowInviteModal(false); setSelectedMembers([]) }} className="px-4 py-2 rounded-lg text-sm font-medium text-on-surface-variant hover:bg-surface-container-high transition-colors">Hủy</button>
              <button onClick={handleInviteMembers} disabled={selectedMembers.length === 0} className="px-6 py-2 rounded-lg text-sm font-bold bg-primary-container text-on-primary-container hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed">
                Mời vào nhóm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Component chọn thành viên dùng chung
function MemberPickerList({
  peers, selected, onToggle, emptyMsg = 'Không có peer online nào.'
}: {
  peers: PeerInfo[]
  selected: string[]
  onToggle: (id: string) => void
  emptyMsg?: string
}) {
  const online = peers.filter(p => p.status === 'ONLINE')
  return (
    <div className="max-h-48 overflow-y-auto custom-scrollbar bg-surface-container-high rounded-lg p-2 space-y-1">
      {online.length === 0 && <p className="text-xs text-outline italic p-2">{emptyMsg}</p>}
      {online.map((peer) => (
        <div
          key={peer.id}
          onClick={() => onToggle(peer.id)}
          className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all ${
            selected.includes(peer.id)
              ? 'bg-primary-container/20 border border-primary/20'
              : 'hover:bg-surface-container-highest'
          }`}
        >
          <div className={`w-5 h-5 rounded flex items-center justify-center text-xs shrink-0 ${
            selected.includes(peer.id) ? 'bg-primary text-on-primary' : 'border border-outline-variant'
          }`}>
            {selected.includes(peer.id) && <span className="material-symbols-outlined text-sm">check</span>}
          </div>
          <div className="w-7 h-7 rounded-full bg-surface-container-highest flex items-center justify-center text-xs font-bold text-outline uppercase">
            {peer.username[0]}
          </div>
          <span className="text-sm text-on-surface truncate">{peer.username}</span>
        </div>
      ))}
    </div>
  )
}
