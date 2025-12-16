import { GoogleGenAI, Type } from "@google/genai";
import { JournalEntry, CalendarEvent, ChatMessage, FinanceTransaction, Task } from "../types";

// Primary Model: Gemini 3 Pro Preview for complex reasoning and accurate extraction
const MODEL_NAME = "gemini-3-pro-preview"; 
// Fallback: Gemini Flash Lite
const FALLBACK_MODEL = "gemini-flash-lite-latest";

// Helper for delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Run with Exponential Backoff Retry
async function runWithRetry<T>(operation: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      // Check for Rate Limit (429) or Server Overload (503/500)
      const isRateLimit = error.status === 429 || error.message?.includes('429') || error.message?.includes('quota');
      const isServerIssue = error.status === 503 || error.status === 500 || error.message?.includes('503') || error.message?.includes('500') || error.message?.includes('Internal error');
      const isNotFound = error.status === 404 || error.message?.includes('404') || error.message?.includes('not found');

      if (isNotFound) {
         // If model not found, don't retry, just throw immediately so we can switch to fallback if applicable
         throw error;
      }

      if ((isRateLimit || isServerIssue) && i < retries - 1) {
        // Exponential backoff: 2s, 5s, 10s (Increased wait time)
        const waitTime = (isRateLimit ? 3000 : 2000) * Math.pow(2, i);
        console.warn(`Gemini API Error (${error.status || 'Quota'}). Retrying in ${waitTime}ms... (Attempt ${i + 1}/${retries})`);
        await delay(waitTime);
        continue;
      }
      throw error;
    }
  }
  throw new Error("Max retries exceeded");
}

// Helper to check for key presence
export const getApiKey = (): string | undefined => {
  // 1. Check Local Storage (User entered in Settings)
  if (typeof localStorage !== 'undefined') {
    const localKey = localStorage.getItem('gemini_api_key');
    if (localKey) return localKey;
  }

  // 2. Check Vite Environment Variables (Crucial for Vercel)
  try {
    // @ts-ignore
    if (import.meta.env && import.meta.env.VITE_API_KEY) {
        // @ts-ignore
        return import.meta.env.VITE_API_KEY;
    }
  } catch (e) {}

  // 3. Fallback check for process.env
  try {
    if (typeof process !== 'undefined' && process.env) {
       if (process.env.API_KEY) return process.env.API_KEY;
    }
  } catch (e) {}

  return undefined;
};

export const hasValidApiKey = (): boolean => {
    return !!getApiKey();
};

// 1. Interactive Chat Function
export const sendMessageToGemini = async (
    history: ChatMessage[], 
    newMessage: string, 
    entries: JournalEntry[] = [],
    tasks: Task[] = [],
    calendarEvents: CalendarEvent[] = [],
    attachment?: { type: 'image' | 'text', content: string, mimeType?: string }
): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("MISSING_API_KEY");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  // --- 1. Abstract: Live Data Context ---
  
  // A. Pending Tasks (Limit to top 15)
  const pendingTasks = tasks
    .filter(t => !t.completed)
    .slice(0, 15)
    .map(t => `- [ ] ${t.title} ${t.dueDate ? `(Due: ${t.dueDate.split('T')[0]})` : ''}`)
    .join('\n');

  // B. Upcoming Events (Next 5 days)
  const now = new Date();
  const nextWeek = new Date();
  nextWeek.setDate(now.getDate() + 5);
  
  const upcomingEvents = calendarEvents
    .filter(e => {
        const eDate = new Date(e.startTime);
        return eDate >= now && eDate <= nextWeek;
    })
    .map(e => `- [${new Date(e.startTime).toLocaleString([], {weekday:'short', hour:'2-digit', minute:'2-digit'})}] ${e.title}`)
    .join('\n');

  // C. Recent Journal Logs (Last 3 relevant entries)
  const relevantEntries = entries
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 3); 

  const recentLogs = relevantEntries.map(e => 
    `[LOG ${new Date(e.date).toLocaleDateString()}]: ${e.title} - ${e.content.substring(0, 150)}...`
  ).join('\n');

  // --- 2. Build System Instruction ---
  const systemInstruction = `You are a warm, supportive personal journal companion.
  You have access to Google Search.
  
  === LIVE DASHBOARD (CURRENT STATE) ===
  Current Time: ${new Date().toString()}
  
  PENDING TASKS:
  ${pendingTasks || "(None)"}
  
  UPCOMING EVENTS:
  ${upcomingEvents || "(None)"}
  
  RECENT LOGS:
  ${recentLogs || "(None)"}
  
  === INSTRUCTIONS ===
  1. Answer questions about schedule or tasks using the dashboard.
  2. For general queries, use Google Search.
  3. Keep responses empathetic and concise.
  `;

  // OPTIMIZATION: Only send the last 15 messages to conserve tokens (TPM Limit)
  // This prevents the context from growing indefinitely and hitting quota.
  const limitedHistory = history.slice(-15);
  
  const previousHistory = limitedHistory.slice(0, -1).map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
  }));

  // Define generation helper
  const generateResponse = async (useSearch: boolean, model: string) => {
    return runWithRetry(async () => {
        const config: any = { systemInstruction };
        if (useSearch) {
            config.tools = [{ googleSearch: {} }];
        }

        const chat = ai.chats.create({
            model: model,
            config,
            history: previousHistory
        });

        if (attachment) {
            if (attachment.type === 'image' && attachment.mimeType) {
                // Send Image + Text
                return await chat.sendMessage({ 
                    message: [
                        { text: newMessage },
                        { 
                            inlineData: { 
                                mimeType: attachment.mimeType, 
                                data: attachment.content // base64 string
                            } 
                        }
                    ]
                });
            } else {
                // Text file content - append to message
                const combinedMessage = `${newMessage}\n\n[ATTACHED FILE CONTENT]:\n${attachment.content}`;
                return await chat.sendMessage({ message: combinedMessage });
            }
        } else {
            // Standard text message
            return await chat.sendMessage({ message: newMessage });
        }
    });
  };

  try {
      // Attempt 1: Try with Search Grounding
      const result = await generateResponse(true, MODEL_NAME);

      if (!result.text) {
          return "I received your message, but I couldn't generate a response. (Empty response from AI)";
      }

      let finalText = result.text;

      // Extract Grounding (Search Results)
      const groundingChunks = result.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const showSources = /source|reference|link|citation|where did you|where from/i.test(newMessage);

      if (groundingChunks && showSources) {
          const sources = groundingChunks
            .map((c: any) => c.web ? `[${c.web.title}](${c.web.uri})` : null)
            .filter((s: any) => s !== null);
          
          if (sources.length > 0) {
              finalText += "\n\n**Sources:**\n" + sources.map((s: string) => `- ${s}`).join('\n');
          }
      }

      return finalText;
  } catch (error: any) {
      // Handle Quota/Permission errors by falling back to lighter model/no search
      const isQuota = error.status === 429 || error.message?.includes('429') || error.message?.includes('quota');
      const isForbidden = error.status === 403 || error.message?.includes('403');
      const isNotFound = error.status === 404 || error.message?.includes('404') || error.message?.includes('not found');
      
      if (isForbidden || isQuota || isNotFound) {
          console.warn(`Primary model failed (${isQuota ? 'Quota' : isNotFound ? 'Not Found' : 'Forbidden'}). Switching to fallback...`);
          try {
              // Try Fallback Model (Flash Lite) without search to save resources
              const fallbackResult = await generateResponse(false, FALLBACK_MODEL);
              return fallbackResult.text || "I'm having trouble thinking, but I'm here.";
          } catch(finalError) {
              throw finalError;
          }
      }
      
      // General Retry Fallback
      try {
           console.warn(`Model ${MODEL_NAME} failed. Switching to ${FALLBACK_MODEL}`);
           const fallbackResult = await generateResponse(false, FALLBACK_MODEL);
           return fallbackResult.text || "I experienced a hiccup, but I'm back.";
      } catch(finalError) {
           console.error("All Chat Fallbacks failed", finalError);
           throw finalError;
      }
  }
};

// 2. Chat with Journal Context (RAG-lite)
export const chatWithJournal = async (
    history: {role: string, text: string}[], 
    entries: JournalEntry[]
): Promise<string> => {
    const apiKey = getApiKey();
    if (!apiKey) return "API Key Missing. Please go to Settings and enter your Gemini API Key.";
  
    const ai = new GoogleGenAI({ apiKey });
    
    // Create context from recent entries
    const contextEntries = entries.slice(0, 15).map(e => 
        `Date: ${new Date(e.date).toDateString()}\nTitle: ${e.title}\nContent: ${e.content}\nTags: ${e.tags.join(', ')}`
    ).join('\n---\n');
  
    const systemInstruction = `You are a helpful Journal Assistant. 
    You have access to the user's past journal entries.
    Use this context to answer questions about their past, summarize their thoughts, or provide insights.
    
    JOURNAL CONTEXT:
    ${contextEntries}`;
  
    const limitedHistory = history.slice(-10); // Strict limit for RAG chat
    const lastMessage = limitedHistory[limitedHistory.length - 1];
    const previousMessages = limitedHistory.slice(0, -1).map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
    }));
  
    const runChat = async (model: string) => {
        return runWithRetry(async () => {
            const chat = ai.chats.create({
                model: model,
                config: { systemInstruction },
                history: previousMessages
            });
            return await chat.sendMessage({ message: lastMessage.text });
        });
    };

    try {
        const result = await runChat(MODEL_NAME);
        return result.text || "";
    } catch (error: any) {
        try {
            const result = await runChat(FALLBACK_MODEL);
            return result.text || "";
        } catch (e) {
            console.error("Journal Chat Fallback Error", e);
            return "I'm having trouble analyzing your journal right now due to connection limits.";
        }
    }
};

// 3. Finance Chat Function
export const chatWithFinance = async (
    history: {role: string, text: string}[], 
    transactions: FinanceTransaction[]
): Promise<string> => {
    const apiKey = getApiKey();
    if (!apiKey) return "API Key Missing. Please go to Settings and enter your Gemini API Key.";
  
    const ai = new GoogleGenAI({ apiKey });
    
    const contextData = transactions.slice(0, 50).map(t => 
        `${t.date.split('T')[0]}, ${t.type}, ${t.category}, ₹${t.amount}, "${t.description}"`
    ).join('\n');
  
    const systemInstruction = `You are a Financial Data Assistant.
    You have access to the user's transaction ledger (Date, Type, Category, Amount, Description).
    The currency is Indian Rupees (INR/₹).
    Use this data to answer questions about spending habits, totals, specific expenses, or income.
    If asked for totals, calculate them accurately from the data provided below.
    
    LEDGER DATA:
    ${contextData || "No transactions recorded yet."}`;
  
    const limitedHistory = history.slice(-10);
    const lastMessage = limitedHistory[limitedHistory.length - 1];
    const previousMessages = limitedHistory.slice(0, -1).map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
    }));
  
    const runChat = async (model: string) => {
        return runWithRetry(async () => {
            const chat = ai.chats.create({
                model: model,
                config: { systemInstruction },
                history: previousMessages
            });
            return await chat.sendMessage({ message: lastMessage.text });
        });
    };
  
    try {
        const result = await runChat(MODEL_NAME);
        return result.text || "";
    } catch (error: any) {
         try {
            const result = await runChat(FALLBACK_MODEL);
            return result.text || "";
        } catch (e) {
            return "I'm having trouble analyzing your financial data right now.";
        }
    }
};

// 4. Multi-Modal Extraction Function (Supports Incremental Processing)
export const generateEntryFromChat = async (
    newMessages: ChatMessage[], 
    contextMessages: ChatMessage[]
): Promise<any> => {
    const apiKey = getApiKey();
    if (!apiKey) return {}; 
  
    const ai = new GoogleGenAI({ apiKey });
    
    // Limit context context for auto-generation
    const contextTranscript = contextMessages.slice(-10).map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n');
    const newTranscript = newMessages.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n');
    const now = new Date();

    const prompt = `
      You are an intelligent Journal Clerk.
      
      *** ENVIRONMENT CONTEXT ***
      - Weekday: ${now.toLocaleDateString('en-US', { weekday: 'long' })}
      - Date: ${now.toLocaleDateString()}
      
      *** TASK ***
      Analyze the "NEW INPUT". Identify personal events, purchases, or tasks.
      
      *** RULES ***
      1. Record past tense actions.
      2. Rephrase into a complete narrative.
      3. Set "hasContent" to TRUE only if input contains personal log/memory.
      4. For Calendar Events, ensure "startTime" and "endTime" are valid ISO-8601 strings (e.g. 2024-01-01T10:00:00).
      5. ***CRITICAL FOR TRANSACTIONS***: Extract the EXACT numerical amount for 'amount'. Do not include currency symbols or text. If user says "50 rupees", amount is 50. If "5k", amount is 5000.
      
      PRIOR CONTEXT:
      ${contextTranscript}

      NEW INPUT:
      ${newTranscript}
    `;

    const generate = async (model: string) => {
        return runWithRetry(async () => {
            return await ai.models.generateContent({
                model: model,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                        hasContent: { type: Type.BOOLEAN },
                        title: { type: Type.STRING },
                        content: { type: Type.STRING },
                        tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                        calendarEvents: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    title: { type: Type.STRING },
                                    startTime: { type: Type.STRING },
                                    endTime: { type: Type.STRING },
                                    description: { type: Type.STRING }
                                },
                                required: ["title", "startTime", "endTime"]
                            }
                        },
                        tasks: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    title: { type: Type.STRING },
                                    dueDate: { type: Type.STRING }
                                },
                                required: ["title"]
                            }
                        },
                        transactions: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    description: { type: Type.STRING },
                                    amount: { type: Type.NUMBER },
                                    type: { type: Type.STRING, enum: ["income", "expense"] },
                                    category: { type: Type.STRING },
                                    date: { type: Type.STRING }
                                },
                                required: ["amount", "type", "description"]
                            }
                        }
                        }
                    }
                }
            });
        });
    };
  
    try {
        const response = await generate(MODEL_NAME);
        let text = response.text || "{}";
        text = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
        return JSON.parse(text);
    } catch (error: any) {
        // Retry with Flash Lite on failure
        try {
            console.warn("Entry Generation Fallback to Flash Lite");
            const response = await generate(FALLBACK_MODEL);
            let text = response.text || "{}";
            text = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
            return JSON.parse(text);
        } catch(e) {
            console.error("Consolidation Error (All retries failed)", e);
            return {};
        }
    }
  };

// 5. File Import Processing
export const processUploadedFile = async (text: string): Promise<any> => {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error("API Key not found");
  
    const ai = new GoogleGenAI({ apiKey });
    const safeText = text.slice(0, 30000); // Reduced limit for safer quota

    const prompt = `
      You are a Data Migration Specialist.
      Analyze the text (which may be a JSON export, a document, or notes) and extract structured data into four categories:
      1. 'entries': Personal memories, journal logs, and notes.
      2. 'tasks': Action items and to-do lists.
      3. 'calendarEvents': Appointments, meetings, and schedules with specific times.
      4. 'transactions': Financial expenses and income.

      For Calendar Events: Ensure dates are in ISO-8601 format. If year is missing, assume current year.
      For Transactions: Extract exact numerical amount.

      If data is unstructured or unclear, put a summary in 'unstructured_summary'.
      
      Text Content:
      ${safeText}
    `;

    const generate = async (model: string) => {
        return runWithRetry(async () => {
            return await ai.models.generateContent({
                model: model,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            entries: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        title: { type: Type.STRING },
                                        content: { type: Type.STRING },
                                        date: { type: Type.STRING },
                                        tags: { type: Type.ARRAY, items: { type: Type.STRING } }
                                    }
                                }
                            },
                            transactions: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        description: { type: Type.STRING },
                                        amount: { type: Type.NUMBER },
                                        type: { type: Type.STRING, enum: ["income", "expense"] },
                                        category: { type: Type.STRING },
                                        date: { type: Type.STRING }
                                    }
                                }
                            },
                            tasks: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        title: { type: Type.STRING },
                                        dueDate: { type: Type.STRING }
                                    },
                                    required: ["title"]
                                }
                            },
                            calendarEvents: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        title: { type: Type.STRING },
                                        startTime: { type: Type.STRING },
                                        endTime: { type: Type.STRING },
                                        description: { type: Type.STRING }
                                    },
                                    required: ["title", "startTime", "endTime"]
                                }
                            },
                            unstructured_summary: { type: Type.STRING }
                        }
                    }
                }
            });
        });
    }

    try {
        const response = await generate(MODEL_NAME);
        let text = response.text || "{}";
        text = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
        return JSON.parse(text);
    } catch (error: any) {
        try {
            console.warn(`Import: Primary model failed, retrying with ${FALLBACK_MODEL}`);
            const response = await generate(FALLBACK_MODEL);
            let text = response.text || "{}";
            text = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
            return JSON.parse(text);
        } catch (retryError) {
             console.error("Import parsing error (Fallback failed)", retryError);
             throw retryError;
        }
    }
}

export const analyzeEntry = async (text: string) => {
    return { summary: text.slice(0, 50), sentiment: "Neutral" };
};

export const extractCalendarEvents = async (entry: JournalEntry): Promise<CalendarEvent[]> => {
    return [];
};