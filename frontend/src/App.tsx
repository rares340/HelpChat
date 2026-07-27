import { useState } from 'react';
import { ChatPage } from './pages/Chat';
import { AdminPage } from './pages/Admin';

export function App() {
  const [page, setPage] = useState<'chat' | 'admin'>('chat');

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">◆</span> INDECO — Asistent documente
        </div>
        <nav>
          <button className={page === 'chat' ? 'tab active' : 'tab'} onClick={() => setPage('chat')}>
            Chat
          </button>
          <button className={page === 'admin' ? 'tab active' : 'tab'} onClick={() => setPage('admin')}>
            Administrare
          </button>
        </nav>
      </header>
      {page === 'chat' ? <ChatPage /> : <AdminPage />}
    </div>
  );
}
