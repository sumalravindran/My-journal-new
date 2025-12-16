import React, { useState, useEffect, useRef, useCallback } from 'react';
import { JournalMode, JournalEntry, CalendarEvent, ChatMessage, Task, FinanceTransaction } from './types';
import Sidebar from './components/Sidebar';
import CalendarWidget from './components/CalendarWidget';
import ChatInterface from './components/ChatInterface';
import TasksView from './components/TasksView';
import FinanceView from './components/FinanceView';
import { RefreshCw, BookOpen, Search, Upload, FileText, CheckCircle, AlertCircle, Loader2, Download, Save, Key, Image as ImageIcon, Receipt, Share2, CheckSquare, Calendar, DollarSign, Cloud, Edit2, Trash2, X } from 'lucide-react';
import { 
    getEntries, saveEntry, deleteEntry, simulateCloudSync, 
    getCalendarEvents, addCalendarEvents, 
    getTasks, saveTasks, 
    getTransactions, addTransactions,
    getAllData, restoreData,
    getChatHistory, saveChatHistory,
    getLastBackupTime, updateLastBackupTime
} from './services/storageService';
import { generateEntryFromChat, processUploadedFile, hasValidApiKey } from './services/geminiService';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('chat');
  
  // Data State
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  
  // Chat State
  const [personalMessages, setPersonalMessages] = useState<ChatMessage[]>([]);
  
  // Auto-Sync State
  const [isSyncing, setIsSyncing] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  
  // Tracking for incremental processing
  const personalProcessedCountRef = useRef(0);
  const autoSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  
  // Import State
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // API Key State
  const [apiKey, setApiKey] = useState('');
  const [keySaved, setKeySaved] = useState(false);
  const [hasConfiguredKey, setHasConfiguredKey] = useState(false);

  // Backup Reminder State
  const [showBackupReminder, setShowBackupReminder] = useState(false);

  // Editing State
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [editForm, setEditForm] = useState({ title: '', content: '' });

  useEffect(() => {
    loadData();
    const personalChat = getChatHistory(JournalMode.PERSONAL);
    setPersonalMessages(personalChat);
    personalProcessedCountRef.current = personalChat.length;

    const storedKey = localStorage.getItem('gemini_api_key');
    if (storedKey) setApiKey(storedKey);
    
    // Check key validity for UI banner
    setHasConfiguredKey(hasValidApiKey());

    // Check Backup Status
    const lastBackup = getLastBackupTime();
    const now = Date.now();
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    
    if (now - lastBackup > oneWeek) {
        setShowBackupReminder(true);
    }
  }, []);

  const loadData = () => {
    setEntries(getEntries().sort((a, b) => b.lastModified - a.lastModified));
    setCalendarEvents(getCalendarEvents());
    setTasks(getTasks());
    setTransactions(getTransactions());
  };

  const handleSaveApiKey = () => {
    if(apiKey.trim()) {
        localStorage.setItem('gemini_api_key', apiKey.trim());
        setKeySaved(true);
        setHasConfiguredKey(true);
        setTimeout(() => setKeySaved(false), 2000);
    } else {
        localStorage.removeItem('gemini_api_key');
        setHasConfiguredKey(false);
    }
  };

  // --- Editing Logic ---
  const openEditModal = (entry: JournalEntry) => {
      setEditingEntry(entry);
      setEditForm({ title: entry.title, content: entry.content });
  };

  const handleSaveEdit = () => {
      if (!editingEntry) return;
      const updatedEntry = {
          ...editingEntry,
          title: editForm.title,
          content: editForm.content,
          lastModified: Date.now()
      };
      saveEntry(updatedEntry);
      setEditingEntry(null);
      loadData();
  };

  // --- Auto-Sync Logic ---
  const handleAutoSync = useCallback(async () => {
      const messages = personalMessages;
      const processedCountRef = personalProcessedCountRef;
      
      const newMessagesCount = messages.length - processedCountRef.current;
      
      if (newMessagesCount <= 0) return; 

      setIsAutoSaving(true);
      try {
          const context = messages.slice(0, processedCountRef.current);
          const newInput = messages.slice(processedCountRef.current);

          // CRITICAL FIX: Update cursor immediately to prevent race conditions/duplicates
          processedCountRef.current = messages.length;

          // Extract Media from new messages to attach to the entry
          const collectedMedia: { type: 'image'; content: string; mimeType: string }[] = [];
          newInput.forEach(msg => {
              if (msg.attachment && msg.attachment.type === 'image') {
                  collectedMedia.push({
                      type: 'image',
                      content: msg.attachment.content,
                      mimeType: msg.attachment.mimeType || 'image/jpeg'
                  });
              }
          });

          const generatedData = await generateEntryFromChat(newInput, context);
          
          // Generate an ID for linking
          const entryId = Date.now().toString();

          // Helper: Get raw user text (excluding attachment tags) to use as fallback
          const rawUserText = newInput
            .filter(m => m.role === 'user')
            .map(m => m.text.replace(/\[Attachment:.*?\]/gi, '').trim())
            .filter(t => t.length > 0)
            .join('\n');
          
          // Determine if we should create a Journal Entry
          const shouldCreateEntry = generatedData.hasContent === true || collectedMedia.length > 0;

          // 1. Process Calendar Events
          let newEvents: CalendarEvent[] = [];
          if (generatedData.calendarEvents?.length > 0) {
                newEvents = generatedData.calendarEvents.map((evt: any, i: number) => ({
                    ...evt,
                    id: `${entryId}-evt-${i}`,
                    linkedEntryId: shouldCreateEntry ? entryId : undefined
                }));
                addCalendarEvents(newEvents);
          }

          // 2. Process Tasks
          let newTasks: Task[] = [];
          if (generatedData.tasks?.length > 0) {
                newTasks = generatedData.tasks.map((t: any, i: number) => ({
                    ...t,
                    id: `${entryId}-task-${i}`,
                    completed: false,
                    linkedEntryId: shouldCreateEntry ? entryId : undefined,
                    dueDate: t.dueDate || new Date().toISOString()
                }));
                saveTasks(newTasks);
          }

          // 3. Process Transactions
          let newTxs: FinanceTransaction[] = [];
          if (generatedData.transactions?.length > 0) {
                newTxs = generatedData.transactions.map((tx: any, i: number) => ({
                    ...tx,
                    id: `${entryId}-tx-${i}`,
                    linkedEntryId: shouldCreateEntry ? entryId : undefined,
                    date: tx.date || new Date().toISOString()
                }));
                addTransactions(newTxs);
          }

          // 4. Save Entry (CONDITIONAL)
          if (shouldCreateEntry) {
                let finalTitle = generatedData.title;
                let finalContent = generatedData.content;

                // Fallback Title: Use user's typed text if AI failed to return a title
                if (!finalTitle || finalTitle.trim() === "") {
                    if (rawUserText) {
                         const firstLine = rawUserText.split('\n')[0];
                         finalTitle = firstLine.length > 50 ? firstLine.substring(0, 50) + "..." : firstLine;
                    } else if (collectedMedia.length > 0) {
                         finalTitle = "Photo Memory";
                    } else {
                         finalTitle = `Log: ${new Date().toLocaleTimeString()}`;
                    }
                }

                // Fallback Content: Use user's typed text if AI failed to return content
                if (!finalContent || finalContent.trim() === "") {
                    if (rawUserText) {
                        finalContent = rawUserText;
                    }
                    // If no text but has media, leave content empty (don't force "Media Entry")
                }

                if (finalContent || collectedMedia.length > 0) {
                    const newEntry: JournalEntry = {
                        id: entryId,
                        title: finalTitle,
                        content: finalContent || "",
                        date: new Date().toISOString(),
                        mode: JournalMode.PERSONAL,
                        tags: generatedData.tags || [],
                        media: collectedMedia,
                        tasks: newTasks,
                        calendarEvents: newEvents,
                        transactions: newTxs,
                        lastModified: Date.now()
                    };
                    saveEntry(newEntry);
                }
          }
          
          // Refresh if any data was processed
          if (shouldCreateEntry || newEvents.length > 0 || newTasks.length > 0 || newTxs.length > 0) {
              loadData(); 
          }
          
      } catch (error) {
          console.error("Auto-sync failed", error);
      } finally {
          setIsAutoSaving(false);
      }
  }, [personalMessages]);

  useEffect(() => {
      const messages = personalMessages;
      const processedCountRef = personalProcessedCountRef;
      
      if (messages.length > processedCountRef.current) {
          if (autoSyncTimeoutRef.current) clearTimeout(autoSyncTimeoutRef.current);
          autoSyncTimeoutRef.current = setTimeout(() => {
              handleAutoSync();
          }, 2000); 
      }
  }, [personalMessages, handleAutoSync]);

  useEffect(() => {
      if (activeTab !== 'chat') {
           if (autoSyncTimeoutRef.current) {
               clearTimeout(autoSyncTimeoutRef.current);
               handleAutoSync(); 
           }
      }
  }, [activeTab, handleAutoSync]);

  const handleSync = async () => {
    setIsSyncing(true);
    await simulateCloudSync();
    setIsSyncing(false);
  };

  const handleExportData = () => {
    const data = getAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gemini_journal_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // Update Backup Time
    updateLastBackupTime();
    setShowBackupReminder(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        let text = event.target?.result as string;
        setIsImporting(true);
        setImportStatus('idle');

        try {
            let cleanText = text.trim();
            cleanText = cleanText.replace(/^```json\s*/i, '').replace(/^```\s*/, '');
            cleanText = cleanText.replace(/\s*```$/, '');

            let parsedData = null;
            let directImportSuccess = false;

            try {
                parsedData = JSON.parse(cleanText);
            } catch (jsonError) {
                parsedData = null;
            }

            if (parsedData) {
                if (parsedData.entries || parsedData.tasks || parsedData.finance || parsedData.calendar) {
                    restoreData(parsedData);
                    loadData();
                    directImportSuccess = true;
                }
                else if (Array.isArray(parsedData)) {
                    const newEntries = parsedData.map((item: any) => ({
                        id: item.id || (Date.now().toString() + Math.random()),
                        title: item.title || "Imported Entry",
                        content: item.content || (typeof item === 'string' ? item : JSON.stringify(item)),
                        date: item.date || new Date().toISOString(),
                        mode: item.mode || JournalMode.PERSONAL,
                        tags: [...(item.tags || []), 'imported'],
                        media: item.media || [],
                        tasks: item.tasks || [],
                        calendarEvents: item.calendarEvents || [],
                        transactions: item.transactions || [],
                        lastModified: Date.now()
                    }));
                    newEntries.forEach((e: JournalEntry) => saveEntry(e));
                    loadData();
                    directImportSuccess = true;
                }
            }

            if (directImportSuccess) {
                setImportStatus('success');
                setTimeout(() => setImportStatus('idle'), 4000);
                setIsImporting(false);
                return;
            }

            let data: any = {};
            try {
                data = await processUploadedFile(text);
            } catch (aiError) {
                console.error("AI Processing failed", aiError);
            }
            
            let addedCount = 0;
            
            if (data.entries?.length) {
                const newEntries = data.entries.map((item: any) => ({
                    id: Date.now().toString() + Math.random(),
                    title: item.title || "Imported Entry",
                    content: item.content || "",
                    date: item.date || new Date().toISOString(),
                    mode: JournalMode.PERSONAL,
                    tags: [...(item.tags || []), 'imported'],
                    lastModified: Date.now()
                }));
                newEntries.forEach((e: JournalEntry) => saveEntry(e));
                addedCount += newEntries.length;
            }

            if (data.transactions?.length) {
                    const newTxs = data.transactions.map((item: any) => ({
                    id: Date.now().toString() + Math.random(),
                    description: item.description || "Imported Tx",
                    amount: item.amount || 0,
                    type: item.type || 'expense',
                    category: item.category || 'Uncategorized',
                    date: item.date || new Date().toISOString()
                }));
                addTransactions(newTxs);
                addedCount += newTxs.length;
            }

            if (data.unstructured_summary && !addedCount) {
                const summaryEntry: JournalEntry = {
                    id: Date.now().toString(),
                    title: "Imported Context File",
                    content: data.unstructured_summary,
                    date: new Date().toISOString(),
                    mode: JournalMode.PERSONAL,
                    tags: ['imported', 'context'],
                    lastModified: Date.now()
                };
                saveEntry(summaryEntry);
                addedCount++;
            }

            if (addedCount === 0 && text.trim().length > 0) {
                 const rawEntry: JournalEntry = {
                    id: Date.now().toString(),
                    title: "Imported File (Raw)",
                    content: text.substring(0, 100000), 
                    date: new Date().toISOString(),
                    mode: JournalMode.PERSONAL,
                    tags: ['imported', 'raw'],
                    lastModified: Date.now()
                };
                saveEntry(rawEntry);
                addedCount++;
            }

            if (addedCount > 0) {
                loadData();
                setImportStatus('success');
            } else {
                setImportStatus('error');
            }
            setTimeout(() => setImportStatus('idle'), 4000);
        } catch (error) {
            console.error("Import Critical Error", error);
            setImportStatus('error');
            setTimeout(() => setImportStatus('idle'), 4000);
        } finally {
            setIsImporting(false);
        }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const updateCurrentChatMessages = (msgs: ChatMessage[]) => {
      setPersonalMessages(msgs);
      saveChatHistory(JournalMode.PERSONAL, msgs);
  };

  const filteredEntries = entries.filter(e => 
    e.mode === JournalMode.PERSONAL && 
    (e.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
     e.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
     e.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase())))
  );

  const groupedEntries: { [key: string]: JournalEntry[] } = {};
  filteredEntries.forEach(entry => {
      const dateKey = new Date(entry.date).toDateString();
      if (!groupedEntries[dateKey]) groupedEntries[dateKey] = [];
      groupedEntries[dateKey].push(entry);
  });
  const sortedDateKeys = Object.keys(groupedEntries).sort((a,b) => new Date(b).getTime() - new Date(a).getTime());


  return (
    <div className="flex flex-col md:flex-row h-[100dvh] bg-slate-950 text-slate-200 overflow-hidden relative">
      
      {/* Weekly Backup Reminder Modal */}
      {showBackupReminder && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl relative">
                  <div className="flex items-center gap-3 mb-4">
                      <div className="p-3 bg-blue-500/20 rounded-full text-blue-500">
                          <Cloud size={24} />
                      </div>
                      <h3 className="text-lg font-bold text-white">Weekly Backup</h3>
                  </div>
                  <p className="text-slate-400 mb-6 leading-relaxed text-sm">
                      It's been a while since your last backup. Keep your data safe by downloading a copy to save in Google Drive.
                  </p>
                  <div className="flex gap-3">
                      <button 
                          onClick={() => setShowBackupReminder(false)}
                          className="flex-1 py-3 px-4 rounded-xl bg-slate-800 text-slate-400 font-medium hover:bg-slate-700 transition-colors"
                      >
                          Later
                      </button>
                      <button 
                          onClick={handleExportData}
                          className="flex-1 py-3 px-4 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 transition-colors shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2"
                      >
                          <Download size={18} />
                          Backup Now
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Edit Entry Modal */}
      {editingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className="bg-slate-900 w-full max-w-lg rounded-2xl border border-slate-700 shadow-2xl flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
                    <h3 className="font-bold text-white">Edit Entry</h3>
                    <button onClick={() => setEditingEntry(null)} className="text-slate-400 hover:text-white p-1 hover:bg-slate-800 rounded-lg transition-colors">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-4 flex-1 overflow-y-auto space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Title</label>
                        <input 
                            value={editForm.title}
                            onChange={e => setEditForm({...editForm, title: e.target.value})}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors font-medium"
                            placeholder="Entry Title"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Content</label>
                        <textarea 
                            value={editForm.content}
                            onChange={e => setEditForm({...editForm, content: e.target.value})}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 min-h-[200px] resize-none leading-relaxed transition-colors"
                            placeholder="Journal content..."
                        />
                    </div>
                </div>
                <div className="p-4 border-t border-slate-800 flex justify-end gap-3 bg-slate-950/50">
                    <button 
                        onClick={() => setEditingEntry(null)}
                        className="px-4 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 font-medium transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleSaveEdit}
                        className="px-5 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-500 flex items-center gap-2 shadow-lg shadow-blue-900/20 transition-all active:scale-95"
                    >
                        <Save size={16} /> Save Changes
                    </button>
                </div>
            </div>
        </div>
      )}

      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        onSync={handleSync}
        isSyncing={isSyncing}
      />
      
      <main className="flex-1 flex flex-col h-full overflow-hidden relative pt-16 md:pt-0 pb-20 md:pb-0">
        
        {activeTab === 'chat' && (
            <ChatInterface 
                messages={personalMessages}
                onUpdateMessages={updateCurrentChatMessages}
                isConsolidating={isAutoSaving}
                entries={entries}
                tasks={tasks} // Pass tasks
                calendarEvents={calendarEvents} // Pass calendar
                hasApiKey={hasConfiguredKey}
                onOpenSettings={() => setActiveTab('settings')}
            />
        )}

        {activeTab === 'tasks' && (
            <div className="flex-1 p-4 md:p-6 overflow-hidden">
                <TasksView tasks={tasks} onTasksChange={loadData} />
            </div>
        )}

        {activeTab === 'finance' && (
            <div className="flex-1 p-4 md:p-6 overflow-hidden">
                <FinanceView transactions={transactions} />
            </div>
        )}

        {/* REEL STYLE JOURNAL VIEW */}
        {activeTab === 'journal' && (
             <div className="flex flex-col h-full bg-slate-950">
                {/* Search Header */}
                <div className="h-16 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md flex items-center justify-between px-4 z-20 shrink-0 sticky top-0">
                    <div className="relative w-full max-w-2xl mx-auto">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
                        <input 
                            type="text" 
                            placeholder="Search memories..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-full pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                        />
                    </div>
                </div>

                {/* Timeline Content */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <div className="max-w-2xl mx-auto space-y-8 pb-20">
                        {sortedDateKeys.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-20 text-slate-600 opacity-50">
                                <BookOpen size={48} className="mb-4" />
                                <p>No entries yet. Start chatting!</p>
                            </div>
                        )}

                        {sortedDateKeys.map(dateKey => (
                            <div key={dateKey} className="relative">
                                {/* Date Sticky Header */}
                                <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur py-2 mb-4 border-b border-slate-800/50 flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                    <h3 className="font-bold text-slate-200 text-sm md:text-base">{dateKey}</h3>
                                    {dateKey === new Date().toDateString() && (
                                        <span className="text-[10px] bg-blue-600/20 text-blue-400 px-2 py-0.5 rounded-full font-medium">Today</span>
                                    )}
                                </div>

                                {/* Cards Grid for this Date */}
                                <div className="space-y-6">
                                    {groupedEntries[dateKey].map(entry => {
                                        const hasBill = entry.tags.some(t => t.toLowerCase().includes('bill') || t.toLowerCase().includes('receipt'));
                                        
                                        return (
                                            <div key={entry.id} className="bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-sm relative group">
                                                
                                                {/* Header: Title & Actions */}
                                                <div className="p-4 pb-2">
                                                    <div className="flex justify-between items-start gap-4">
                                                        <h4 className="font-semibold text-slate-100 text-base leading-snug">{entry.title}</h4>
                                                        
                                                        <div className="flex items-center gap-1 bg-slate-950/50 rounded-lg p-1 border border-slate-800/50">
                                                            <button 
                                                                onClick={() => openEditModal(entry)}
                                                                className="text-slate-500 hover:text-blue-400 hover:bg-slate-800 transition-colors p-1.5 rounded-md"
                                                                title="Edit Entry"
                                                            >
                                                                <Edit2 size={16} /> 
                                                            </button>
                                                            <div className="w-px h-4 bg-slate-800"></div>
                                                            <button 
                                                                onClick={() => {
                                                                    if(confirm('Are you sure you want to delete this memory? This cannot be undone.')) {
                                                                        deleteEntry(entry.id);
                                                                        loadData();
                                                                    }
                                                                }}
                                                                className="text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors p-1.5 rounded-md"
                                                                title="Delete Entry"
                                                            >
                                                                <Trash2 size={16} /> 
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Visual Media Reel (Horizontal Scroll if multiple) */}
                                                {entry.media && entry.media.length > 0 && (
                                                    <div className="mt-2 mb-2 overflow-x-auto flex gap-2 px-4 pb-2 snap-x">
                                                        {entry.media.map((m, idx) => (
                                                            <div key={idx} className="snap-center shrink-0 relative rounded-lg overflow-hidden border border-slate-800 bg-black max-w-[200px] max-h-[250px] flex items-center justify-center">
                                                                <img 
                                                                    src={`data:${m.mimeType};base64,${m.content}`} 
                                                                    alt="memory" 
                                                                    className="max-w-full max-h-[250px] object-contain"
                                                                    loading="lazy"
                                                                />
                                                                {/* Overlay for Bills */}
                                                                {hasBill && (
                                                                    <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md p-1.5 rounded-full border border-white/10">
                                                                        <Receipt size={12} className="text-green-400" />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Text Content - Separate Lines */}
                                                <div className="px-4 pb-4 space-y-4">
                                                    {/* Main Summary Content */}
                                                    {entry.content && (
                                                        <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                                                            {entry.content.length > 300 ? (
                                                                <>
                                                                    {entry.content.substring(0, 300)}...
                                                                    <span className="text-blue-400 text-xs ml-1 cursor-pointer hover:underline">[Read more]</span>
                                                                </>
                                                            ) : entry.content}
                                                        </p>
                                                    )}

                                                    {/* TASKS Section (Separate Lines) */}
                                                    {entry.tasks && entry.tasks.length > 0 && (
                                                        <div className="pt-2 border-t border-slate-800/50">
                                                            <div className="text-[10px] text-slate-500 uppercase font-semibold mb-2 flex items-center gap-1">
                                                                <CheckSquare size={10} /> Tasks Added
                                                            </div>
                                                            <div className="space-y-2">
                                                                {entry.tasks.map((task, i) => (
                                                                    <div key={i} className="flex items-start gap-2 text-sm text-slate-300">
                                                                        <div className="mt-1.5 w-1 h-1 rounded-full bg-blue-500 shrink-0"></div>
                                                                        <span>{task.title}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* EVENTS Section (Separate Lines) */}
                                                    {entry.calendarEvents && entry.calendarEvents.length > 0 && (
                                                        <div className="pt-2 border-t border-slate-800/50">
                                                             <div className="text-[10px] text-slate-500 uppercase font-semibold mb-2 flex items-center gap-1">
                                                                <Calendar size={10} /> Events Scheduled
                                                            </div>
                                                            <div className="space-y-2">
                                                                {entry.calendarEvents.map((evt, i) => (
                                                                    <div key={i} className="flex items-start gap-2 text-sm text-slate-300">
                                                                         <div className="mt-1.5 w-1 h-1 rounded-full bg-purple-500 shrink-0"></div>
                                                                         <div>
                                                                             <span className="font-medium text-slate-200">{evt.title}</span>
                                                                             <span className="text-slate-500 text-xs ml-2">
                                                                                 {new Date(evt.startTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                                                             </span>
                                                                         </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* FINANCE Section (Separate Lines) */}
                                                    {entry.transactions && entry.transactions.length > 0 && (
                                                        <div className="pt-2 border-t border-slate-800/50">
                                                             <div className="text-[10px] text-slate-500 uppercase font-semibold mb-2 flex items-center gap-1">
                                                                <DollarSign size={10} /> Transactions
                                                            </div>
                                                            <div className="space-y-2">
                                                                {entry.transactions.map((tx, i) => (
                                                                    <div key={i} className="flex items-center justify-between text-sm text-slate-300">
                                                                        <div className="flex items-center gap-2">
                                                                            <div className={`mt-0.5 w-1 h-1 rounded-full shrink-0 ${tx.type === 'income' ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                                                                            <span>{tx.description}</span>
                                                                        </div>
                                                                        <span className={tx.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}>
                                                                            {tx.amount}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="mt-3 pt-2 border-t border-slate-800/30 text-[10px] text-slate-600 flex items-center gap-1">
                                                        <span>{new Date(entry.date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                                        <span>•</span>
                                                        <span>Personal Log</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
             </div>
        )}

         {activeTab === 'settings' && (
            <div className="flex-1 overflow-y-auto p-4 md:p-6">
                <div className="max-w-2xl mx-auto py-6 md:py-10">
                     <h2 className="text-2xl font-bold mb-6">Settings</h2>
                     
                     {/* API Configuration */}
                     <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden mb-8">
                        <div className="p-4 bg-slate-950/50 border-b border-slate-800">
                            <h3 className="font-semibold text-slate-200">AI Configuration</h3>
                        </div>
                        <div className="p-6">
                             <div className="flex items-start gap-4">
                                <div className="p-3 bg-blue-500/10 rounded-lg text-blue-500 shrink-0">
                                    <Key size={24} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-medium text-slate-200 mb-1">Gemini API Key</h4>
                                    <p className="text-sm text-slate-500 mb-4 leading-relaxed">
                                        Paste your Gemini API key here to enable AI features on mobile. This key is saved locally on your device.
                                    </p>
                                    <div className="flex flex-col sm:flex-row gap-3">
                                        <input 
                                            type="password" 
                                            placeholder="AIzaSy..." 
                                            value={apiKey}
                                            onChange={(e) => setApiKey(e.target.value)}
                                            className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 w-full"
                                        />
                                        <button 
                                            onClick={handleSaveApiKey}
                                            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 text-sm font-medium transition-colors flex items-center justify-center gap-2 shrink-0 w-full sm:w-auto"
                                        >
                                            {keySaved ? <CheckCircle size={16} /> : <Save size={16} />}
                                            {keySaved ? 'Saved' : 'Save'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                     </div>
                     
                     {/* Data Management Section */}
                     <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden mb-8">
                        <div className="p-4 bg-slate-950/50 border-b border-slate-800">
                            <h3 className="font-semibold text-slate-200">Data Management</h3>
                        </div>
                        
                        {/* Export/Backup Feature */}
                        <div className="p-6 border-b border-slate-800">
                            <div className="flex items-start gap-4">
                                <div className="p-3 bg-purple-500/10 rounded-lg text-purple-500 shrink-0">
                                    <Cloud size={24} />
                                </div>
                                <div className="flex-1">
                                    <h4 className="font-medium text-slate-200 mb-1">Backup Data to Drive</h4>
                                    <p className="text-sm text-slate-500 mb-4 leading-relaxed">
                                        Save your entire journal history to a JSON file. Upload this file to your Google Drive to keep it safe.
                                    </p>
                                    <button 
                                        onClick={handleExportData}
                                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-all text-sm font-medium group"
                                    >
                                        <Download size={16} className="text-purple-400 group-hover:text-purple-300" />
                                        <span>Backup to Device / Drive (.json)</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Import Feature */}
                        <div className="p-6 border-b border-slate-800">
                            <div className="flex items-start gap-4">
                                <div className="p-3 bg-blue-500/10 rounded-lg text-blue-500 shrink-0">
                                    <Upload size={24} />
                                </div>
                                <div className="flex-1">
                                    <h4 className="font-medium text-slate-200 mb-1">Import / Restore</h4>
                                    <p className="text-sm text-slate-500 mb-4 leading-relaxed">
                                        Upload a backup file (<code>.json</code>) to restore data, or a text file (<code>.txt</code>) for Gemini to analyze.
                                    </p>
                                    
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                                        <label className={`flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg cursor-pointer transition-all ${isImporting ? 'opacity-50 pointer-events-none' : ''}`}>
                                            <FileText size={16} className="text-slate-400" />
                                            <span className="text-sm font-medium">Select File</span>
                                            <input 
                                                type="file" 
                                                accept=".txt,.json"
                                                className="hidden"
                                                onChange={handleFileUpload}
                                                disabled={isImporting}
                                            />
                                        </label>
                                        
                                        {isImporting && (
                                            <div className="flex items-center gap-2 text-blue-400 text-sm">
                                                <Loader2 size={16} className="animate-spin" />
                                                <span>Processing...</span>
                                            </div>
                                        )}
                                        
                                        {!isImporting && importStatus === 'success' && (
                                            <div className="flex items-center gap-2 text-green-500 text-sm animate-in fade-in slide-in-from-left-4">
                                                <CheckCircle size={16} />
                                                <span>Success!</span>
                                            </div>
                                        )}
                                        
                                        {!isImporting && importStatus === 'error' && (
                                            <div className="flex items-center gap-2 text-red-400 text-sm animate-in fade-in slide-in-from-left-4">
                                                <AlertCircle size={16} />
                                                <span>Failed. Try again.</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                     </div>

                     {/* NEW FOOTER FOR MOBILE UPDATES */}
                     <div className="pb-8 flex flex-col items-center justify-center gap-3 opacity-60 hover:opacity-100 transition-opacity">
                        <div className="flex items-center gap-2">
                           <div className="h-px w-12 bg-slate-800"></div>
                           <span className="text-xs text-slate-500 font-medium">App Version 1.3</span>
                           <div className="h-px w-12 bg-slate-800"></div>
                        </div>
                        <button 
                            onClick={() => {
                                // Attempt to clear cache and reload
                                if ('serviceWorker' in navigator) {
                                    navigator.serviceWorker.getRegistrations().then(function(registrations) {
                                        for(let registration of registrations) {
                                            registration.unregister();
                                        }
                                    });
                                }
                                window.location.reload();
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-800 rounded-full text-xs font-bold text-blue-400 hover:bg-slate-700 transition-colors"
                        >
                            <RefreshCw size={12} className={isSyncing ? "animate-spin" : ""} />
                            Check for Updates / Reload
                        </button>
                     </div>
                </div>
            </div>
         )}
      </main>
    </div>
  );
};

export default App;