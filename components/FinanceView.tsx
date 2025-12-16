import React, { useState, useRef, useEffect } from 'react';
import { FinanceTransaction } from '../types';
import { DollarSign, Send, Bot, Wallet, Sparkles, Search, ArrowUpRight, ArrowDownLeft, Filter, Mic, MicOff, Plus, X, Edit2, Trash2, CheckCircle } from 'lucide-react';
import { chatWithFinance } from '../services/geminiService';
import { saveTransaction, deleteTransaction } from '../services/storageService';

interface FinanceViewProps {
  transactions: FinanceTransaction[];
  onTransactionsChange: () => void;
}

const FinanceView: React.FC<FinanceViewProps> = ({ transactions, onTransactionsChange }) => {
  // Chat State
  const [messages, setMessages] = useState<{id: string, role: string, text: string}[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  
  const [searchTerm, setSearchTerm] = useState('');

  // --- Modal State ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Partial<FinanceTransaction>>({
      type: 'expense',
      date: new Date().toISOString().split('T')[0]
  });

  // Auto-scroll chat
  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // --- Speech Recognition Setup ---
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = 'en-US';

        recognitionRef.current.onresult = (event: any) => {
            const transcript = Array.from(event.results)
                .map((result: any) => result[0])
                .map((result: any) => result.transcript)
                .join('');
            
            if (event.results[0].isFinal) {
                 setInput(prev => (prev ? prev + ' ' + transcript : transcript));
                 setIsListening(false);
            }
        };

        recognitionRef.current.onerror = (event: any) => {
            console.error('Speech recognition error', event.error);
            setIsListening(false);
        };

        recognitionRef.current.onend = () => {
            setIsListening(false);
        };
    }
  }, []);

  const toggleListening = () => {
      if (!recognitionRef.current) {
          alert("Speech recognition is not supported in this browser.");
          return;
      }

      if (isListening) {
          recognitionRef.current.stop();
          setIsListening(false);
      } else {
          recognitionRef.current.start();
          setIsListening(true);
      }
  };

  const handleSend = async (text?: string) => {
    const userText = text || input;
    if (!userText.trim() || isTyping) return;
    
    setInput('');

    const newHistory = [...messages, { id: Date.now().toString(), role: 'user', text: userText }];
    setMessages(newHistory);
    setIsTyping(true);

    try {
        const apiHistory = newHistory.map(m => ({ role: m.role, text: m.text }));
        const response = await chatWithFinance(apiHistory, transactions);
        
        setMessages(prev => [...prev, {
            id: (Date.now() + 1).toString(),
            role: 'model',
            text: response
        }]);
    } catch (error) {
        setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'model',
            text: "Connection error. Please try again."
        }]);
    } finally {
        setIsTyping(false);
    }
  };

  // --- CRUD Operations ---
  const handleOpenAdd = () => {
      setEditingTx({
          id: undefined,
          type: 'expense',
          description: '',
          amount: 0,
          category: 'General',
          date: new Date().toISOString().split('T')[0]
      });
      setIsModalOpen(true);
  };

  const handleOpenEdit = (tx: FinanceTransaction) => {
      setEditingTx({
          ...tx,
          date: tx.date.split('T')[0] // Ensure date input format
      });
      setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
      if(window.confirm("Are you sure you want to delete this transaction?")) {
          deleteTransaction(id);
          onTransactionsChange();
      }
  };

  const handleSaveTx = () => {
      if (!editingTx.description || !editingTx.amount || !editingTx.date) {
          alert("Please fill in description and amount.");
          return;
      }

      const txToSave: FinanceTransaction = {
          id: editingTx.id || Date.now().toString(),
          description: editingTx.description,
          amount: Number(editingTx.amount),
          type: editingTx.type || 'expense',
          category: editingTx.category || 'General',
          date: editingTx.date // ISO date string from input
      };

      saveTransaction(txToSave);
      onTransactionsChange();
      setIsModalOpen(false);
  };

  const filteredTransactions = transactions
    .filter(t => 
        t.description.toLowerCase().includes(searchTerm.toLowerCase()) || 
        t.category.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="h-full flex flex-col gap-4 p-2 lg:p-4 relative">
        
        {/* MANUAL ENTRY MODAL */}
        {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
                <div className="bg-slate-900 w-full max-w-sm rounded-2xl border border-slate-700 shadow-2xl overflow-hidden">
                    <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
                        <h3 className="font-bold text-white">
                            {editingTx.id ? 'Edit Transaction' : 'New Transaction'}
                        </h3>
                        <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                            <X size={20} />
                        </button>
                    </div>
                    <div className="p-6 space-y-4">
                        {/* Type Toggle */}
                        <div className="flex bg-slate-800 rounded-lg p-1">
                            <button 
                                onClick={() => setEditingTx({...editingTx, type: 'expense'})}
                                className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${editingTx.type === 'expense' ? 'bg-rose-500/20 text-rose-400' : 'text-slate-400'}`}
                            >
                                Expense
                            </button>
                            <button 
                                onClick={() => setEditingTx({...editingTx, type: 'income'})}
                                className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${editingTx.type === 'income' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400'}`}
                            >
                                Income
                            </button>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">DESCRIPTION</label>
                            <input 
                                value={editingTx.description}
                                onChange={e => setEditingTx({...editingTx, description: e.target.value})}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
                                placeholder="e.g. Grocery, Salary"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                             <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">AMOUNT</label>
                                <input 
                                    type="number"
                                    value={editingTx.amount}
                                    onChange={e => setEditingTx({...editingTx, amount: Number(e.target.value)})}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
                                />
                             </div>
                             <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">DATE</label>
                                <input 
                                    type="date"
                                    value={editingTx.date}
                                    onChange={e => setEditingTx({...editingTx, date: e.target.value})}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
                                />
                             </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">CATEGORY</label>
                            <input 
                                value={editingTx.category}
                                onChange={e => setEditingTx({...editingTx, category: e.target.value})}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
                                placeholder="General"
                            />
                        </div>
                    </div>
                    <div className="p-4 border-t border-slate-800 flex justify-end gap-3 bg-slate-950/50">
                        <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white text-sm">Cancel</button>
                        <button onClick={handleSaveTx} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg">
                            Save
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* TOP: Transaction Ledger (Expanded) */}
        <div className="flex-1 bg-slate-900 rounded-2xl border border-slate-800 flex flex-col overflow-hidden shadow-sm min-h-0 relative">
            {/* Toolbar */}
            <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-950/50">
                <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Wallet className="text-blue-500" size={20} />
                        Financial Ledger
                    </h2>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
                        <input 
                            type="text" 
                            placeholder="Search transactions..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-blue-500 transition-all"
                        />
                    </div>
                    <button 
                        onClick={handleOpenAdd}
                        className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-lg shadow-lg flex items-center justify-center shrink-0"
                        title="Add Transaction"
                    >
                        <Plus size={20} />
                    </button>
                </div>
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-slate-800 bg-slate-900/80 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <div className="col-span-6 sm:col-span-4">Description</div>
                <div className="col-span-3 sm:col-span-3">Date</div>
                <div className="col-span-3 sm:col-span-2 text-right">Amount</div>
                <div className="hidden sm:block sm:col-span-2 text-right">Category</div>
                <div className="hidden sm:block sm:col-span-1 text-right">Actions</div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {filteredTransactions.length === 0 ? (
                     <div className="flex flex-col items-center justify-center h-full text-slate-600">
                        <Filter size={32} className="mb-2 opacity-50" />
                        <p>No transactions found</p>
                    </div>
                ) : (
                    filteredTransactions.map(tx => (
                        <div key={tx.id} className="grid grid-cols-12 gap-2 px-4 py-4 border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors items-center group text-sm">
                            <div className="col-span-6 sm:col-span-4 flex items-center gap-2 overflow-hidden">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                                    tx.type === 'income' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
                                }`}>
                                    {tx.type === 'income' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                                </div>
                                <div className="min-w-0">
                                    <span className="font-medium text-slate-200 block truncate">{tx.description}</span>
                                    {/* Mobile Category shown below desc */}
                                    <span className="sm:hidden text-[10px] text-slate-500">{tx.category}</span>
                                </div>
                            </div>
                            <div className="col-span-3 sm:col-span-3 text-xs text-slate-400 flex items-center">
                                {new Date(tx.date).toLocaleDateString()}
                            </div>
                            <div className={`col-span-3 sm:col-span-2 text-right font-mono font-medium ${
                                tx.type === 'income' ? 'text-emerald-400' : 'text-rose-400'
                            }`}>
                                {Math.abs(tx.amount).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                            </div>
                            <div className="hidden sm:block sm:col-span-2 text-right">
                                <span className="text-[10px] px-2 py-1 rounded-md bg-slate-800 text-slate-400 border border-slate-700 truncate inline-block max-w-full">
                                    {tx.category}
                                </span>
                            </div>
                            <div className="hidden sm:flex col-span-1 justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => handleOpenEdit(tx)} className="p-1.5 hover:bg-blue-600/20 text-blue-400 rounded-md">
                                    <Edit2 size={14} />
                                </button>
                                <button onClick={() => handleDelete(tx.id)} className="p-1.5 hover:bg-red-600/20 text-red-400 rounded-md">
                                    <Trash2 size={14} />
                                </button>
                            </div>
                            {/* Mobile Actions Context Menu (Simplified for now - click edit via long press or similar could be added, but relying on desktop row hover for now) */}
                             <div className="sm:hidden col-span-12 flex justify-end gap-3 mt-2 pt-2 border-t border-slate-800/30 opacity-60">
                                <button onClick={() => handleOpenEdit(tx)} className="text-xs text-blue-400 flex items-center gap-1">
                                    <Edit2 size={10} /> Edit
                                </button>
                                <button onClick={() => handleDelete(tx.id)} className="text-xs text-red-400 flex items-center gap-1">
                                    <Trash2 size={10} /> Delete
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
             <div className="p-3 border-t border-slate-800 bg-slate-950 text-center text-xs text-slate-500">
                {filteredTransactions.length} records
            </div>
        </div>

        {/* BOTTOM: Gemini Analysis Bar */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-xl overflow-hidden flex flex-col shrink-0 max-h-[50vh]">
            {/* Header / Title */}
            <div className="bg-slate-950/50 px-4 py-2 border-b border-slate-800 flex items-center gap-2">
                <Sparkles size={14} className="text-purple-400" />
                <span className="text-xs font-medium text-slate-400">Gemini Financial Analyst</span>
            </div>

            {/* Chat History (Collapsible or Scrollable Area) */}
            {messages.length > 0 && (
                <div className="overflow-y-auto p-4 space-y-3 bg-slate-950/30 custom-scrollbar border-b border-slate-800 min-h-[100px]" ref={scrollRef}>
                    {messages.map(msg => (
                        <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] px-4 py-2 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                                msg.role === 'user' 
                                ? 'bg-purple-600 text-white rounded-br-none' 
                                : 'bg-slate-800 text-slate-200 rounded-bl-none border border-slate-700'
                            }`}>
                                {msg.text.split('\n').map((line, i) => <p key={i} className="mb-1 last:mb-0">{line}</p>)}
                            </div>
                        </div>
                    ))}
                    {isTyping && (
                         <div className="flex justify-start">
                             <div className="bg-slate-800 px-3 py-2 rounded-xl rounded-bl-none border border-slate-700 flex gap-1">
                                 <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce"></div>
                                 <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce delay-75"></div>
                                 <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce delay-150"></div>
                             </div>
                         </div>
                    )}
                </div>
            )}

            {/* Input Bar */}
            <div className="p-3 bg-slate-900">
                <div className="relative flex gap-2 items-center">
                    <input 
                        type="text" 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder={isListening ? "Listening..." : "Ask Gemini to analyze your spending..."}
                        className={`flex-1 bg-slate-950 border border-slate-700 rounded-xl pl-4 pr-12 py-3 text-sm text-slate-200 focus:outline-none focus:border-purple-500 transition-colors shadow-inner ${isListening ? 'border-red-500/50 bg-red-500/10' : ''}`}
                    />
                    
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {input.trim() ? (
                            <button 
                                onClick={() => handleSend()}
                                disabled={isTyping}
                                className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-500 disabled:opacity-50 transition-all"
                            >
                                <Send size={16} />
                            </button>
                        ) : (
                            <button 
                                onClick={toggleListening}
                                className={`p-2 rounded-lg transition-all ${
                                    isListening 
                                    ? 'bg-red-500 text-white animate-pulse' 
                                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                                }`}
                            >
                                {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};

export default FinanceView;