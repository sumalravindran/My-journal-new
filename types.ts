export enum JournalMode {
  PERSONAL = 'PERSONAL',
  PROFESSIONAL = 'PROFESSIONAL'
}

export interface JournalEntry {
  id: string;
  title: string;
  content: string;
  date: string; // ISO String
  mode: JournalMode;
  tags: string[];
  calendarEvents?: CalendarEvent[];
  tasks?: Task[];
  transactions?: FinanceTransaction[];
  media?: { type: 'image'; content: string; mimeType: string }[]; // New field for photos/bills
  lastModified: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string; // ISO String
  endTime: string; // ISO String
  description?: string;
  linkedEntryId?: string;
}

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  dueDate?: string; // ISO String
  linkedEntryId?: string;
}

export interface FinanceTransaction {
  id: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  description: string;
  date: string; // ISO String
  linkedEntryId?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  attachment?: { type: 'image' | 'text'; content: string; mimeType?: string; name?: string }; // New field to persist chat attachments
}

export enum AIActionType {
  SUMMARIZE = 'SUMMARIZE',
  FIX_GRAMMAR = 'FIX_GRAMMAR',
  EXTRACT_EVENTS = 'EXTRACT_EVENTS',
  GENERATE_TAGS = 'GENERATE_TAGS',
  ADVICE = 'ADVICE'
}