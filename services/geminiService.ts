import { GoogleGenAI, Type } from "@google/genai";
import { JournalEntry, CalendarEvent, ChatMessage, FinanceTransaction, Task } from "../types";

// Primary Model: Gemini 3.0 Pro for best reasoning
const MODEL_NAME = "gemini-3-pro-preview"; 
// Fallback Model: Gemini 2.5 Flash for stability/speed if Pro fails
const FALLBACK_MODEL = "gemini-2.5-flash";

// Helper to check for key presence
export const getApiKey = (): string | undefined => {
  // 1. Check Local Storage (User entered in Settings)
  if (typeof localStorage !== 'undefined') {
    const localKey = localStorage.getItem('gemini_api_key');
    if (localKey) return localKey;
  }

  // 2. Check Vite Environment Variables (Common for React+Vite)
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      // @ts-ignore
      if (import.meta.env.VITE_API_KEY) return import.meta.env.VITE_API_KEY;
    }
  } catch (e) {}

  // 3. Check Standard Process Env
  try {
    if (typeof process !== 'undefined' && process.env) {
       if (process.env.API_KEY) return process.env.API_KEY;
       if (process.env.REACT_APP_API_KEY) return process.env.REACT_APP_API_KEY;
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
  
  // A. Pending Tasks (Limit to top 20 to save context)
  const pendingTasks = tasks
    .filter(t => !t.completed)
    .slice(0, 20)
    .map(t => `- [ ] ${t.title} ${t.dueDate ? `(Due: ${t.dueDate.split('T')[0]})` : ''}`)
    .join('\n');

  // B. Upcoming Events (Next 7 days)
  const now = new Date();
  const nextWeek = new Date();
  nextWeek.setDate(now.getDate() + 7);
  
  const upcomingEvents = calendarEvents
    .filter(e => {
        const eDate = new Date(e.startTime);
        return eDate >= now && eDate <= nextWeek;
    })
    .map(e => `- [${new Date(e.startTime).toLocaleString([], {weekday:'short', hour:'2-digit', minute:'2-digit'})}] ${e.title}`)
    .join('\n');

  // C. Recent Journal Logs (Last 5 relevant entries)
  const relevantEntries = entries
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5); 

  const recentLogs = relevantEntries.map(e => 
    `[LOG ${new Date(e.date).toLocaleDateString()}]: ${e.title} - ${e.content.substring(0, 200)}...`
  ).join('\n');

  // --- 2. Build System Instruction ---
  const systemInstruction = `You are a warm, supportive personal journal companion.
  You have access to Google Search.
  
  === LIVE DASHBOARD (CURRENT STATE) ===
  Current Time: ${new Date().toString()}
  
  PENDING TASKS (Unfinished):
  ${pendingTasks || "(No pending tasks)"}
  
  UPCOMING CALENDAR (Next 7 Days):
  ${upcomingEvents || "(No upcoming events)"}
  
  RECENT LOG SUMMARIES:
  ${recentLogs || "(No recent logs)"}
  
  === INSTRUCTIONS ===
  1. If the user asks "What is pending?" or "What do I have to do?", use the PENDING TASKS list above.
  2. If the user asks about schedule, use the UPCOMING CALENDAR.
  3. If the user refers to past events, check the RECENT LOG SUMMARIES.
  4. If the user asks general questions, current events, or news, USE GOOGLE SEARCH to provide up-to-date answers.
  5. Keep responses empathetic, personal, and encouraging.
  `;

  const previousHistory = history.slice(0, -1).map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
  }));

  // Define generation helper to allow retries
  const generateResponse = async (useSearch: boolean, model: string = MODEL_NAME) => {
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
  };

  try {
      // Attempt 1: Try with Search Grounding
      const result = await generateResponse(true, MODEL_NAME);

      if (!result.text) {
          console.warn("Gemini returned empty text", result);
          return "I received your message, but I couldn't generate a response. (Empty response from AI)";
      }

      let finalText = result.text;

      // Extract Grounding (Search Results)
      const groundingChunks = result.candidates?.[0]?.groundingMetadata?.groundingChunks;
      
      // Filter logic: Only show sources if explicitly asked
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
      // Fallback 1: If 403 Permission Denied (common if Grounding is not enabled on the key), retry without tools
      if (error.status === 403 || error.toString().includes('403') || error.toString().includes('PERMISSION_DENIED')) {
          console.warn("Search Grounding 403 Forbidden. Retrying without search...");
          try {
              const retryResult = await generateResponse(false, MODEL_NAME);
              return retryResult.text || "I'm having trouble connecting to the tools, but I heard you.";
          } catch (retryError) {
              // If model 3.0 still fails, try fallback
              try {
                  const fallbackResult = await generateResponse(false, FALLBACK_MODEL);
                  return fallbackResult.text || "I'm having trouble thinking, but I'm here.";
              } catch(finalError) {
                  console.error("Retry failed", finalError);
                  throw finalError;
              }
          }
      }
      
      // Fallback 2: If 500 Internal Error (Model Overload), retry with Fallback Model
      if (error.status === 500 || error.toString().includes('500') || error.toString().includes('Internal error')) {
           console.warn(`Model ${MODEL_NAME} 500 Error. Retrying with ${FALLBACK_MODEL}`);
           try {
               const fallbackResult = await generateResponse(false, FALLBACK_MODEL);
               return fallbackResult.text || "I experienced a hiccup, but I'm back.";
           } catch(finalError) {
               console.error("Fallback failed", finalError);
               throw finalError;
           }
      }
      
      console.error("Chat Error", error);
      throw error; // Re-throw to be handled by UI
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
    const contextEntries = entries.slice(0, 20).map(e => 
        `Date: ${new Date(e.date).toDateString()}\nTitle: ${e.title}\nContent: ${e.content}\nTags: ${e.tags.join(', ')}`
    ).join('\n---\n');
  
    const systemInstruction = `You are a helpful Journal Assistant. 
    You have access to the user's past journal entries.
    Use this context to answer questions about their past, summarize their thoughts, or provide insights.
    
    JOURNAL CONTEXT:
    ${contextEntries}`;
  
    const lastMessage = history[history.length - 1];
    const previousMessages = history.slice(0, -1).map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
    }));
  
    const runChat = async (model: string) => {
        const chat = ai.chats.create({
            model: model,
            config: { systemInstruction },
            history: previousMessages
        });
        return await chat.sendMessage({ message: lastMessage.text });
    };

    try {
        const result = await runChat(MODEL_NAME);
        return result.text || "";
    } catch (error: any) {
        // Fallback to Flash if Pro fails
        if (error.status === 500 || error.toString().includes('500') || error.toString().includes('Internal error')) {
            try {
                const result = await runChat(FALLBACK_MODEL);
                return result.text || "";
            } catch (e) {
                console.error("Journal Chat Fallback Error", e);
                return "I'm having trouble analyzing your journal right now.";
            }
        }
        console.error("Journal Chat Error", error);
        return "I'm having trouble analyzing your journal right now.";
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
    
    // Convert transactions to CSV-like context with Indian Rupee symbol
    const contextData = transactions.map(t => 
        `${t.date.split('T')[0]}, ${t.type}, ${t.category}, ₹${t.amount}, "${t.description}"`
    ).join('\n');
  
    const systemInstruction = `You are a Financial Data Assistant.
    You have access to the user's transaction ledger (Date, Type, Category, Amount, Description).
    The currency is Indian Rupees (INR/₹).
    Use this data to answer questions about spending habits, totals, specific expenses, or income.
    If asked for totals, calculate them accurately from the data provided below.
    
    LEDGER DATA:
    ${contextData || "No transactions recorded yet."}`;
  
    const lastMessage = history[history.length - 1];
    const previousMessages = history.slice(0, -1).map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
    }));
  
    const runChat = async (model: string) => {
        const chat = ai.chats.create({
            model: model,
            config: { systemInstruction },
            history: previousMessages
        });
        return await chat.sendMessage({ message: lastMessage.text });
    };
  
    try {
        const result = await runChat(MODEL_NAME);
        return result.text || "";
    } catch (error: any) {
        if (error.status === 500 || error.toString().includes('500') || error.toString().includes('Internal error')) {
             try {
                const result = await runChat(FALLBACK_MODEL);
                return result.text || "";
            } catch (e) {
                return "I'm having trouble analyzing your financial data right now.";
            }
        }
        console.error("Finance Chat Error", error);
        return "I'm having trouble analyzing your financial data right now.";
    }
};

// 4. Multi-Modal Extraction Function (Supports Incremental Processing)
export const generateEntryFromChat = async (
    newMessages: ChatMessage[], 
    contextMessages: ChatMessage[]
): Promise<any> => {
    const apiKey = getApiKey();
    if (!apiKey) return {}; // Fail silently for auto-sync if key is missing
  
    const ai = new GoogleGenAI({ apiKey });
    
    const contextTranscript = contextMessages.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n');
    const newTranscript = newMessages.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n');

    // Get robust local time string for the AI
    const now = new Date();
    const localTimeString = now.toString(); // e.g. "Fri Oct 27 2023 10:30:00 GMT+0530 (India Standard Time)"

    const prompt = `
      You are an intelligent Journal Clerk.
      
      *** ENVIRONMENT CONTEXT (USE THIS FOR TIME/DATE) ***
      - Full System Time: ${localTimeString}
      - Weekday: ${now.toLocaleDateString('en-US', { weekday: 'long' })}
      - Date: ${now.toLocaleDateString()}
      
      *** TASK ***
      Analyze the "NEW INPUT" below. 
      Identify ANY personal event, activity, travel, purchase, or visit.
      
      *** CAPTURE RULES ***
      1. **ALWAYS RECORD** actions described in past tense (e.g., "I visited...", "I went...", "I saw...", "I bought...", "I had visited...").
      2. **SHORT INPUTS ARE VALID**: Even a short sentence like "I visited the temple" MUST be recorded.
      3. **REPHRASE**: Convert short inputs into a polite, complete narrative sentence.
         - Input: "visited temple"
         - Content: "I visited the temple today for a peaceful evening."
      
      *** IMPORTANT: FILTERING RULES ***
      - Set "hasContent" to **FALSE** if the input is purely:
        a) A command to schedule an event (e.g., "Meeting tomorrow at 9", "Schedule dentist").
        b) A command to add a task (e.g., "Buy milk", "Remind me to call John").
        c) "Hi", "Hello", or a generic question.
        d) **REDUNDANT**: If the NEW INPUT just provides minor detail to the PRIOR CONTEXT (e.g., Context: "I went to the beach", New: "It was sunny"), do NOT create a new entry.
      - Set "hasContent" to **TRUE** ONLY if the input contains a distinct personal log, memory, reflection, or description of something that happened.
      
      If you find such content:
      1. **Set hasContent to TRUE**.
      2. **Create a Title** (e.g. "Temple Visit").
      3. **Create Content** (The rephrased narrative).
      
      CURRENCY: Indian Rupees (INR/₹). Defaults to INR if symbol is missing.
      MODE: Personal Diary.

      PRIOR CONTEXT:
      ${contextTranscript}

      NEW INPUT (Process this):
      ${newTranscript}
    `;

    const generate = async (model: string) => {
        return await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                    hasContent: { type: Type.BOOLEAN, description: "Set to TRUE only for personal narratives/logs. FALSE for pure commands/tasks." },
                    title: { type: Type.STRING, description: "A short, engaging title." },
                    content: { type: Type.STRING, description: "The rephrased journal note." },
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
    };
  
    try {
        const response = await generate(MODEL_NAME);
        let text = response.text || "{}";
        text = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
        return JSON.parse(text);
    } catch (error: any) {
        // Fallback for logic extraction
        if (error.status === 500 || error.toString().includes('500') || error.toString().includes('Internal error')) {
            try {
                console.warn("Entry Generation Fallback to Flash");
                const response = await generate(FALLBACK_MODEL);
                let text = response.text || "{}";
                text = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
                return JSON.parse(text);
            } catch(e) {
                console.error("Consolidation Fallback Error", e);
                return {};
            }
        }
        console.error("Consolidation Error", error);
        return {};
    }
  };

// 5. File Import Processing
export const processUploadedFile = async (text: string): Promise<any> => {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error("API Key not found");
  
    const ai = new GoogleGenAI({ apiKey });
    
    // Safety truncate to fit context window comfortably
    const safeText = text.slice(0, 50000); 

    const prompt = `
      You are a Data Migration Specialist.
      The user has uploaded a raw text file containing their history, logs, or a context summary.
      
      TASK:
      Analyze the text and extract structured data.
      If the text contains distinct events with dates, break them into 'entries'.
      If the text is a general summary or unstructured context, put the ENTIRE text into 'unstructured_summary'.
      
      Text Content:
      ${safeText}
    `;

    const generate = async (model: string) => {
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
                        unstructured_summary: {
                            type: Type.STRING,
                            description: "Use this if no distinct entries are found, but there is content to save."
                        }
                    }
                }
            }
        });
    }

    try {
        // Try Primary Model (3.0 Pro)
        const response = await generate(MODEL_NAME);
        let text = response.text || "{}";
        text = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
        return JSON.parse(text);
    } catch (error: any) {
        // Fallback logic for 500 errors
        if (error.status === 500 || error.toString().includes('500') || error.toString().includes('Internal error')) {
            console.warn(`Import: Primary model ${MODEL_NAME} failed (500), retrying with ${FALLBACK_MODEL}`);
            try {
                const response = await generate(FALLBACK_MODEL);
                let text = response.text || "{}";
                text = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
                return JSON.parse(text);
            } catch (retryError) {
                 console.error("Import parsing error (Fallback failed)", retryError);
                 throw retryError;
            }
        }
        console.error("Import parsing error", error);
        return {};
    }
}

export const analyzeEntry = async (text: string) => {
    return { summary: text.slice(0, 50), sentiment: "Neutral" };
};

export const extractCalendarEvents = async (entry: JournalEntry): Promise<CalendarEvent[]> => {
    return [];
};