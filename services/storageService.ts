import { JournalEntry, JournalMode, CalendarEvent, Task, FinanceTransaction, ChatMessage } from '../types';

const STORAGE_KEY = 'gemini_journal_data_v1';
const CALENDAR_KEY = 'gemini_journal_calendar_v1';
const TASKS_KEY = 'gemini_journal_tasks_v1';
const FINANCE_KEY = 'gemini_journal_finance_v1';
const CHAT_PERSONAL_KEY = 'gemini_journal_chat_personal_v1';
const CHAT_PROF_KEY = 'gemini_journal_chat_prof_v1';
const BACKUP_TIMESTAMP_KEY = 'gemini_journal_last_backup';

// --- Entries ---
export const getEntries = (): JournalEntry[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Failed to load entries", error);
    return [];
  }
};

export const saveEntry = (entry: JournalEntry): void => {
  const entries = getEntries();
  const existingIndex = entries.findIndex(e => e.id === entry.id);
  
  if (existingIndex >= 0) {
    entries[existingIndex] = entry;
  } else {
    entries.push(entry);
  }
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
};

export const deleteEntry = (id: string): void => {
  const entries = getEntries().filter(e => e.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
};

// --- Calendar ---
export const getCalendarEvents = (): CalendarEvent[] => {
    try {
        const data = localStorage.getItem(CALENDAR_KEY);
        return data ? JSON.parse(data) : [];
    } catch (error) {
        return [];
    }
}

export const addCalendarEvents = (events: CalendarEvent[]): void => {
    const current = getCalendarEvents();
    const newEvents = [...current, ...events.filter(e => !current.find(c => c.id === e.id))];
    localStorage.setItem(CALENDAR_KEY, JSON.stringify(newEvents));
}

// --- Tasks ---
export const getTasks = (): Task[] => {
    try {
        const data = localStorage.getItem(TASKS_KEY);
        return data ? JSON.parse(data) : [];
    } catch (error) {
        return [];
    }
}

export const saveTasks = (tasks: Task[]): void => {
    const current = getTasks();
    // Update existing or add new
    const updated = [...current];
    tasks.forEach(t => {
        const idx = updated.findIndex(existing => existing.id === t.id);
        if (idx >= 0) updated[idx] = t;
        else updated.push(t);
    });
    localStorage.setItem(TASKS_KEY, JSON.stringify(updated));
}

export const updateTaskStatus = (id: string, completed: boolean): void => {
    const tasks = getTasks().map(t => t.id === id ? { ...t, completed } : t);
    localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
}

export const deleteTask = (id: string): void => {
    const tasks = getTasks().filter(t => t.id !== id);
    localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
}

// --- Finance ---
export const getTransactions = (): FinanceTransaction[] => {
    try {
        const data = localStorage.getItem(FINANCE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (error) {
        return [];
    }
}

export const addTransactions = (txs: FinanceTransaction[]): void => {
    const current = getTransactions();
    const newTxs = [...current, ...txs];
    localStorage.setItem(FINANCE_KEY, JSON.stringify(newTxs));
}

// --- Chat History ---
export const getChatHistory = (mode: JournalMode): ChatMessage[] => {
    try {
        const key = mode === JournalMode.PERSONAL ? CHAT_PERSONAL_KEY : CHAT_PROF_KEY;
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    } catch (error) {
        return [];
    }
}

export const saveChatHistory = (mode: JournalMode, messages: ChatMessage[]): void => {
    const key = mode === JournalMode.PERSONAL ? CHAT_PERSONAL_KEY : CHAT_PROF_KEY;
    localStorage.setItem(key, JSON.stringify(messages));
}

// --- Backup & Restore ---
export const getLastBackupTime = (): number => {
    const data = localStorage.getItem(BACKUP_TIMESTAMP_KEY);
    return data ? parseInt(data, 10) : 0;
};

export const updateLastBackupTime = (): void => {
    localStorage.setItem(BACKUP_TIMESTAMP_KEY, Date.now().toString());
};

export const getAllData = () => {
    return {
        entries: getEntries(),
        calendar: getCalendarEvents(),
        tasks: getTasks(),
        finance: getTransactions(),
        chatPersonal: getChatHistory(JournalMode.PERSONAL),
        chatProf: getChatHistory(JournalMode.PROFESSIONAL),
        lastBackup: getLastBackupTime(),
        timestamp: Date.now()
    };
};

export const restoreData = (data: any) => {
    if (data.entries && Array.isArray(data.entries)) localStorage.setItem(STORAGE_KEY, JSON.stringify(data.entries));
    if (data.calendar && Array.isArray(data.calendar)) localStorage.setItem(CALENDAR_KEY, JSON.stringify(data.calendar));
    if (data.tasks && Array.isArray(data.tasks)) localStorage.setItem(TASKS_KEY, JSON.stringify(data.tasks));
    if (data.finance && Array.isArray(data.finance)) localStorage.setItem(FINANCE_KEY, JSON.stringify(data.finance));
    if (data.chatPersonal && Array.isArray(data.chatPersonal)) localStorage.setItem(CHAT_PERSONAL_KEY, JSON.stringify(data.chatPersonal));
    if (data.chatProf && Array.isArray(data.chatProf)) localStorage.setItem(CHAT_PROF_KEY, JSON.stringify(data.chatProf));
    if (data.lastBackup) localStorage.setItem(BACKUP_TIMESTAMP_KEY, data.lastBackup.toString());
};

// Simulates a Google Drive Sync
export const simulateCloudSync = async (): Promise<boolean> => {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(true);
        }, 1500);
    });
};