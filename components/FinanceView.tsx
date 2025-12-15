import React, { useState, useRef, useEffect } from 'react';
import { FinanceTransaction } from '../types';
import { DollarSign, Send, Bot, Wallet, Sparkles, Search, ArrowUpRight, ArrowDownLeft, Filter, Mic, MicOff } from 'lucide-react';
import { chatWithFinance } from '../services/geminiService';

interface FinanceViewProps {
  transactions: FinanceTransaction[];
}

const FinanceView: React.FC<FinanceViewProps> = ({ transactions }) => {
  // Chat State
  const [messages, setMessages] = useState<{id: string, role: string, text: string}[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  
  const [searchTerm, setSearchTerm] = useState('');

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

  const filteredTransactions = transactions
    .filter(t => 
        t.description.toLowerCase().includes(searchTerm.toLowerCase()) || 
        t.category.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="h-full flex flex-col gap-4 p-2 lg:p-4">
        
        {/* TOP: Transaction Ledger (Expanded) */}
        <div className="flex-1 bg-slate-900 rounded-2xl border border-slate-800 flex flex-col overflow-hidden shadow-sm min-h-0">
            {/* Toolbar */}
            <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-950/50">
                <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Wallet className="text-blue-500" size={20} />
                        Financial Ledger
                    </h2>
                </div>
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
                    <input 
                        type="text" 
                        placeholder="Search transactions..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-blue-500 transition-all"
                    />
                </div>
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-slate-800 bg-slate-900/80 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <div className="col-span-6 sm:col-span-5">Description</div>
                <div className="col-span-3 sm:col-span-3">Date</div>
                <div className="col-span-3 sm:col-span-2 text-right">Amount</div>
                <div className="hidden sm:block sm:col-span-2 text-right">Category</div>
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
                            <div className="col-span-6 sm:col-span-5 flex items-center gap-2 overflow-hidden">
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