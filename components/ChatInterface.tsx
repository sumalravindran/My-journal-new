import React, { useState, useRef, useEffect } from 'react';
import { Send, Cpu, Bot, CheckCircle, RefreshCw, Sparkles, Mic, MicOff, Paperclip, X, FileText, Image as ImageIcon, AlertTriangle, Settings } from 'lucide-react';
import { ChatMessage, JournalEntry, Task, CalendarEvent } from '../types';
import { sendMessageToGemini } from '../services/geminiService';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onUpdateMessages: (msgs: ChatMessage[]) => void;
  isConsolidating: boolean; 
  entries: JournalEntry[];
  tasks: Task[];
  calendarEvents: CalendarEvent[];
  hasApiKey: boolean;
  onOpenSettings: () => void;
}

interface Attachment {
    type: 'image' | 'text';
    content: string; // Base64 or Text content
    name: string;
    mimeType?: string;
}

// Helper to compress images for "smaller memory size"
const compressImage = (base64Str: string, maxWidth = 800, quality = 0.7): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = `data:image/jpeg;base64,${base64Str}`;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                height = (height * maxWidth) / width;
                width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            // Compress to JPEG
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve(dataUrl.split(',')[1]); // Return only base64 data
        };
        img.onerror = () => resolve(base64Str); // Fallback
    });
};

const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, onUpdateMessages, isConsolidating, entries, tasks, calendarEvents, hasApiKey, onOpenSettings }) => {
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  // Use simple smooth scrolling for updates
  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping, attachment]);

  // --- Speech Recognition Setup ---
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = 'en-US'; // Default to English

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

  // --- File Handling ---
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();

      if (file.type.startsWith('image/')) {
          reader.onload = async (event) => {
              const base64String = event.target?.result as string;
              const rawBase64 = base64String.split(',')[1];
              
              // Compress immediately upon selection to save memory
              const compressedBase64 = await compressImage(rawBase64);
              
              setAttachment({ type: 'image', content: compressedBase64, name: file.name, mimeType: 'image/jpeg' });
          };
          reader.readAsDataURL(file);
      } else if (file.type === 'text/plain' || file.name.endsWith('.md') || file.name.endsWith('.csv') || file.name.endsWith('.json')) {
          reader.onload = (event) => {
              const textContent = event.target?.result as string;
              setAttachment({ type: 'text', content: textContent, name: file.name });
          };
          reader.readAsText(file);
      } else {
          alert("Unsupported file type. Please upload images or text files.");
      }
      e.target.value = '';
  };

  const removeAttachment = () => {
      setAttachment(null);
  };

  const handleSend = async () => {
    if ((!input.trim() && !attachment) || isTyping) return;

    const userText = input;
    const currentAttachment = attachment;
    
    setInput('');
    setAttachment(null);
    if(textareaRef.current) textareaRef.current.style.height = 'auto'; // Reset height
    
    const newUserMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        text: currentAttachment ? `${userText}\n[Attachment: ${currentAttachment.name}]` : userText,
        timestamp: Date.now(),
        // Save attachment in history so it can be synced to journal
        attachment: currentAttachment ? {
            type: currentAttachment.type,
            content: currentAttachment.content,
            mimeType: currentAttachment.mimeType,
            name: currentAttachment.name
        } : undefined
    };
    
    const newHistory = [...messages, newUserMsg];
    onUpdateMessages(newHistory);
    
    setIsTyping(true);

    try {
        // Pass tasks and calendarEvents to the service
        const responseText = await sendMessageToGemini(newHistory, userText, entries, tasks, calendarEvents, currentAttachment || undefined);
        const aiMsg: ChatMessage = {
            id: (Date.now() + 1).toString(),
            role: 'model',
            text: responseText,
            timestamp: Date.now()
        };
        onUpdateMessages([...newHistory, aiMsg]);
    } catch (error: any) {
        console.error(error);
        let errorMsg = "I'm having trouble connecting right now.";
        
        if (error.message === 'MISSING_API_KEY') {
            errorMsg = "⚠️ API Key Missing. Please go to the Settings tab (⚙️) and enter your Gemini API Key to enable AI features.";
        }
        
        const aiMsg: ChatMessage = {
            id: (Date.now() + 1).toString(),
            role: 'model',
            text: errorMsg,
            timestamp: Date.now()
        };
        onUpdateMessages([...newHistory, aiMsg]);
    } finally {
        setIsTyping(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 relative">
        {/* API Key Warning Banner */}
        {!hasApiKey && (
             <div className="bg-orange-500/10 border-b border-orange-500/30 p-2 text-center flex items-center justify-center gap-3 shrink-0 backdrop-blur-sm z-20">
                 <span className="text-orange-300 text-xs font-medium">⚠️ Setup Required: Gemini API Key missing</span>
                 <button 
                    onClick={onOpenSettings}
                    className="flex items-center gap-1 bg-orange-600/20 hover:bg-orange-600/40 text-orange-300 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors border border-orange-500/30"
                 >
                     <Settings size={10} />
                     Setup Now
                 </button>
             </div>
        )}

        {/* Header */}
        <div className="p-3 md:p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 backdrop-blur-sm z-10 shrink-0">
            <div className="flex items-center gap-3">
                 <div className="w-8 h-8 rounded-full flex items-center justify-center bg-purple-600/20 text-purple-500">
                    <Sparkles size={18} />
                 </div>
                 <div>
                    <h2 className="text-base md:text-xl font-bold text-slate-100">
                        Personal AI
                    </h2>
                    <p className="text-[10px] md:text-xs text-slate-400">
                        Journal Companion with Search
                    </p>
                </div>
            </div>
            
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800">
                {isConsolidating ? (
                    <>
                        <RefreshCw size={12} className="text-blue-500 animate-spin" />
                        <span className="text-[10px] text-blue-400 font-medium">Syncing...</span>
                    </>
                ) : (
                    <>
                        <CheckCircle size={12} className="text-emerald-500" />
                        <span className="text-[10px] text-emerald-500 font-medium">Saved</span>
                    </>
                )}
            </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth" ref={scrollRef}>
            {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-slate-600 opacity-50">
                    <Bot size={48} className="mb-4" />
                    <p className="text-center text-sm">Start a conversation or search the web.<br/>I know your tasks and schedule.</p>
                </div>
            )}
            
            {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] lg:max-w-[70%] p-3 md:p-4 rounded-2xl shadow-sm ${
                        msg.role === 'user'
                            ? 'bg-purple-600 text-white rounded-br-none'
                            : (msg.text.includes('⚠️') 
                                ? 'bg-red-900/30 text-red-200 border border-red-500/50 rounded-bl-none' 
                                : 'bg-slate-800 text-slate-200 rounded-bl-none border border-slate-700')
                    }`}>
                        {/* Render Attached Image in Chat History */}
                        {msg.attachment && msg.attachment.type === 'image' && (
                            <div className="mb-2 rounded-lg overflow-hidden border border-white/10">
                                <img 
                                    src={`data:${msg.attachment.mimeType || 'image/jpeg'};base64,${msg.attachment.content}`} 
                                    alt="attachment" 
                                    className="w-full h-auto max-h-60 object-cover"
                                />
                            </div>
                        )}
                        
                        <div className="whitespace-pre-wrap leading-relaxed text-sm">
                            {msg.text.includes('⚠️') && <AlertTriangle className="inline w-3 h-3 mr-1 mb-0.5"/>}
                            {/* Render text with simple markdown-like link support if needed, but for now simple text */}
                            {msg.text.split('\n').map((line, i) => (
                                <p key={i} className="mb-1 last:mb-0 min-h-[1em]">{line}</p>
                            ))}
                        </div>
                        <span className="text-[10px] opacity-50 mt-1 block text-right">
                            {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                    </div>
                </div>
            ))}
            
            {isTyping && (
                 <div className="flex justify-start">
                    <div className="bg-slate-800 p-3 rounded-2xl rounded-bl-none border border-slate-700 flex gap-2 items-center">
                        <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce"></div>
                        <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce delay-75"></div>
                        <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce delay-150"></div>
                    </div>
                </div>
            )}
        </div>

        {/* Attachment Preview (Sticky) */}
        {attachment && (
            <div className="px-4 pb-2 bg-slate-950 shrink-0">
                <div className="flex items-center gap-3 bg-slate-900 p-2 rounded-lg w-full md:w-fit pr-4 border border-slate-800">
                    <div className="w-10 h-10 bg-slate-800 rounded-md flex items-center justify-center shrink-0 overflow-hidden">
                        {attachment.type === 'image' ? (
                            <img src={`data:${attachment.mimeType};base64,${attachment.content}`} alt="preview" className="w-full h-full object-cover" />
                        ) : (
                            <FileText size={20} className="text-slate-300" />
                        )}
                    </div>
                    <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-xs text-slate-200 font-medium truncate">{attachment.name}</span>
                        <span className="text-[10px] text-slate-500 uppercase">{attachment.type}</span>
                    </div>
                    <button onClick={removeAttachment} className="p-1.5 bg-slate-800 rounded-full text-slate-400 hover:text-white">
                        <X size={14} />
                    </button>
                </div>
            </div>
        )}

        {/* Android-style Input Bar */}
        <div className="p-2 pb-safe bg-slate-950 border-t border-slate-800 shrink-0 w-full z-20">
            <div className="flex items-end gap-2 max-w-4xl mx-auto">
                {/* Tools Container */}
                <div className="flex items-center gap-1 pb-2">
                     <input 
                        type="file" 
                        ref={fileInputRef}
                        className="hidden" 
                        onChange={handleFileSelect}
                        accept="image/*,.txt,.md,.csv,.json"
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="p-2.5 rounded-full bg-slate-900 text-slate-400 hover:text-white transition-colors"
                    >
                        <Paperclip size={20} />
                    </button>
                </div>

                {/* Input Field */}
                <div className="flex-1 bg-slate-900 rounded-2xl border border-slate-800 flex items-center px-4 py-2 min-h-[48px]">
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Search web or chat..."
                        className="w-full bg-transparent border-none focus:ring-0 text-slate-200 placeholder-slate-500 resize-none text-sm max-h-[120px] overflow-y-auto"
                        rows={1}
                        onKeyDown={(e) => {
                             if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                    />
                </div>

                {/* Send/Mic Button */}
                <button
                    onClick={input.trim() || attachment ? () => handleSend() : toggleListening}
                    disabled={isTyping}
                    className={`p-3 rounded-full shrink-0 transition-all shadow-lg flex items-center justify-center w-12 h-12 ${
                        input.trim() || attachment
                            ? 'bg-purple-600 hover:bg-purple-500 text-white'
                            : (isListening 
                                ? 'bg-red-500 text-white animate-pulse' 
                                : 'bg-slate-800 text-slate-400')
                    }`}
                >
                    {input.trim() || attachment ? (
                        <Send size={20} className="ml-0.5" /> 
                    ) : (
                        isListening ? <MicOff size={22} /> : <Mic size={22} />
                    )}
                </button>
            </div>
        </div>
    </div>
  );
};

export default ChatInterface;