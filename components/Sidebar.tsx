import React, { useState, useEffect } from 'react';
import { JournalMode } from '../types';
import { BookOpen, Briefcase, Calendar, Settings, Cloud, User, Anchor, MessageSquare, CheckSquare, DollarSign, Key, Save, Upload, Download, AlertCircle, CheckCircle, Loader2, FileText } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onSync: () => void;
  isSyncing: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, onSync, isSyncing }) => {
  const [apiKey, setApiKey] = useState('');
  
  useEffect(() => {
      const storedKey = localStorage.getItem('gemini_api_key');
      if (storedKey) setApiKey(storedKey);
  }, []);

  // Helper for Nav Items
  const NavButton = ({ tab, icon: Icon, label, mobileHideLabel }: any) => (
    <button 
        onClick={() => setActiveTab(tab)}
        className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors w-full md:w-full justify-center md:justify-start ${
            activeTab === tab 
            ? 'bg-slate-800 text-white' 
            : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
        }`}
    >
        <Icon size={20} />
        <span className={`${mobileHideLabel ? 'hidden md:block' : 'hidden lg:block'}`}>{label}</span>
    </button>
  );

  return (
    <>
      {/* --- DESKTOP SIDEBAR (Hidden on Mobile) --- */}
      <div className="hidden md:flex flex-col h-full w-20 lg:w-64 transition-colors duration-300 border-r bg-slate-900 border-slate-700">
        {/* Header */}
        <div className="p-6 flex items-center justify-center lg:justify-start gap-3">
          <div className="p-2 rounded-xl bg-purple-600">
            <BookOpen className="text-white w-6 h-6" />
          </div>
          <h1 className="hidden lg:block text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
              My Journal
          </h1>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
            <NavButton tab="chat" icon={MessageSquare} label="Daily Chat" mobileHideLabel />
            <NavButton tab="journal" icon={BookOpen} label="Entries" mobileHideLabel />
            <NavButton tab="calendar" icon={Calendar} label="Calendar" mobileHideLabel />
            <NavButton tab="tasks" icon={CheckSquare} label="Tasks" mobileHideLabel />
            <NavButton tab="finance" icon={DollarSign} label="Finance" mobileHideLabel />
        </nav>

        {/* Footer Settings */}
        <div className="px-4 pb-4">
             <NavButton tab="settings" icon={Settings} label="Settings" mobileHideLabel />
        </div>

        {/* Cloud Status */}
        <div className="p-4 border-t border-slate-800">
            <button 
                onClick={onSync}
                disabled={isSyncing}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-all group justify-center lg:justify-start"
            >
                <div className={`p-2 rounded-full ${isSyncing ? 'animate-pulse bg-yellow-500/20 text-yellow-500' : 'bg-green-500/20 text-green-500'}`}>
                    <Cloud size={18} className={isSyncing ? 'animate-spin' : ''} />
                </div>
                <div className="hidden lg:flex flex-col items-start">
                    <span className="text-xs font-medium text-slate-300">Google Drive</span>
                    <span className="text-xs text-slate-500">{isSyncing ? 'Syncing...' : 'Synced'}</span>
                </div>
            </button>
        </div>
      </div>

      {/* --- MOBILE TOP BAR (Hidden on Desktop) --- */}
      <div className="md:hidden fixed top-0 left-0 w-full h-14 bg-slate-950/90 backdrop-blur-md border-b border-slate-800 z-50 flex items-center justify-between px-4 transition-all duration-300">
           <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-lg bg-purple-600">
                    <BookOpen className="text-white w-4 h-4" />
                </div>
                <span className="font-bold text-slate-100 text-base">My Journal</span>
           </div>
      </div>

      {/* --- MOBILE BOTTOM NAV (Hidden on Desktop) --- */}
      <div className="md:hidden fixed bottom-0 left-0 w-full bg-slate-950 border-t border-slate-800 z-50 pb-[env(safe-area-inset-bottom)]">
          <div className="flex justify-around items-center p-1">
              <button onClick={() => setActiveTab('chat')} className={`p-2 rounded-xl flex-1 flex justify-center ${activeTab === 'chat' ? 'text-blue-400 bg-slate-900' : 'text-slate-500'}`}><MessageSquare size={20} /></button>
              <button onClick={() => setActiveTab('journal')} className={`p-2 rounded-xl flex-1 flex justify-center ${activeTab === 'journal' ? 'text-blue-400 bg-slate-900' : 'text-slate-500'}`}><BookOpen size={20} /></button>
              <button onClick={() => setActiveTab('calendar')} className={`p-2 rounded-xl flex-1 flex justify-center ${activeTab === 'calendar' ? 'text-blue-400 bg-slate-900' : 'text-slate-500'}`}><Calendar size={20} /></button>
              <button onClick={() => setActiveTab('tasks')} className={`p-2 rounded-xl flex-1 flex justify-center ${activeTab === 'tasks' ? 'text-blue-400 bg-slate-900' : 'text-slate-500'}`}><CheckSquare size={20} /></button>
              <button onClick={() => setActiveTab('finance')} className={`p-2 rounded-xl flex-1 flex justify-center ${activeTab === 'finance' ? 'text-blue-400 bg-slate-900' : 'text-slate-500'}`}><DollarSign size={20} /></button>
              <button onClick={() => setActiveTab('settings')} className={`p-2 rounded-xl flex-1 flex justify-center ${activeTab === 'settings' ? 'text-blue-400 bg-slate-900' : 'text-slate-500'}`}><Settings size={20} /></button>
          </div>
      </div>
    </>
  );
};

export default Sidebar;