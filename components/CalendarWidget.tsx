import React, { useState } from 'react';
import { CalendarEvent, Task } from '../types';
import { ChevronLeft, ChevronRight, Clock, Plus, X, Calendar, Save, Repeat } from 'lucide-react';
import { addCalendarEvents, saveTasks } from '../services/storageService';

interface CalendarWidgetProps {
  events: CalendarEvent[];
  onEventsChange?: () => void;
}

type ViewMode = 'day' | 'week' | 'month';
type RepeatMode = 'none' | 'daily' | 'weekly' | 'monthly';

const CalendarWidget: React.FC<CalendarWidgetProps> = ({ events, onEventsChange }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');

  // --- Modal State ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newEvent, setNewEvent] = useState({
      title: '',
      description: '',
      date: new Date().toISOString().split('T')[0],
      startTime: '09:00',
      endTime: '10:00',
      repeat: 'none' as RepeatMode
  });

  // Helpers
  const startOfWeek = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day; // adjust when day is sunday
    return new Date(d.setDate(diff));
  };

  const addDays = (date: Date, days: number) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };

  const addMonths = (date: Date, months: number) => {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
  };

  const isValidDate = (d: Date) => {
      return d instanceof Date && !isNaN(d.getTime());
  };

  const handlePrev = () => {
    if (viewMode === 'month') setCurrentDate(addMonths(currentDate, -1));
    else if (viewMode === 'week') setCurrentDate(addDays(currentDate, -7));
    else setCurrentDate(addDays(currentDate, -1));
  };

  const handleNext = () => {
    if (viewMode === 'month') setCurrentDate(addMonths(currentDate, 1));
    else if (viewMode === 'week') setCurrentDate(addDays(currentDate, 7));
    else setCurrentDate(addDays(currentDate, 1));
  };

  const handleToday = () => setCurrentDate(new Date());

  // --- Add Event Logic ---
  const handleSaveEvent = () => {
      if (!newEvent.title || !newEvent.date || !newEvent.startTime || !newEvent.endTime) {
          alert("Please fill in all required fields.");
          return;
      }

      const eventsToCreate: CalendarEvent[] = [];
      const baseDate = new Date(newEvent.date);
      
      // Determine number of recurrences (limit to reasonable amount for local storage)
      let count = 1;
      if (newEvent.repeat === 'daily') count = 30; // 1 month
      else if (newEvent.repeat === 'weekly') count = 12; // 3 months
      else if (newEvent.repeat === 'monthly') count = 6; // 6 months

      for (let i = 0; i < count; i++) {
          const currentInstanceDate = new Date(baseDate);
          
          if (newEvent.repeat === 'daily') currentInstanceDate.setDate(baseDate.getDate() + i);
          if (newEvent.repeat === 'weekly') currentInstanceDate.setDate(baseDate.getDate() + (i * 7));
          if (newEvent.repeat === 'monthly') currentInstanceDate.setMonth(baseDate.getMonth() + i);

          const startISO = `${currentInstanceDate.toISOString().split('T')[0]}T${newEvent.startTime}:00`;
          const endISO = `${currentInstanceDate.toISOString().split('T')[0]}T${newEvent.endTime}:00`;

          eventsToCreate.push({
              id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
              title: newEvent.title,
              description: newEvent.description,
              startTime: startISO,
              endTime: endISO
          });
      }

      // 1. Save to Calendar
      addCalendarEvents(eventsToCreate);

      // 2. Mirror to Tasks (Requested Feature)
      const tasksToCreate: Task[] = eventsToCreate.map(evt => ({
          id: `task-mirror-${evt.id}`,
          title: evt.title, // Mirror title directly
          completed: false,
          dueDate: evt.startTime, // Use event start time as due date
          linkedEntryId: evt.id // Optionally link back to the event ID
      }));
      saveTasks(tasksToCreate);

      setIsModalOpen(false);
      
      // Reset Form
      setNewEvent({
          title: '',
          description: '',
          date: new Date().toISOString().split('T')[0],
          startTime: '09:00',
          endTime: '10:00',
          repeat: 'none'
      });

      // Trigger refresh in parent
      if (onEventsChange) onEventsChange();
  };

  const getEventsForDay = (date: Date) => {
    return events.filter(e => {
        const eDate = new Date(e.startTime);
        // Safety check for invalid dates to prevent crashes
        if (!isValidDate(eDate)) return false;

        return eDate.getDate() === date.getDate() && 
               eDate.getMonth() === date.getMonth() && 
               eDate.getFullYear() === date.getFullYear();
    });
  };

  // --- Views ---

  const renderMonthView = () => {
    const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const startDate = startOfWeek(monthStart);
    const endDate = addDays(startOfWeek(monthEnd), 6); // Simple approximation to fill grid

    const rows = [];
    let days = [];
    let day = startDate;
    let formattedDate = "";

    // Generate 5 or 6 weeks depending on the month
    while (day <= endDate) {
        for (let i = 0; i < 7; i++) {
            formattedDate = day.getDate().toString();
            const cloneDay = day;
            const dayEvents = getEventsForDay(day);
            const isCurrentMonth = day.getMonth() === monthStart.getMonth();
            const isToday = day.toDateString() === new Date().toDateString();

            days.push(
                <div key={day.toString()} className={`min-h-[80px] md:min-h-[100px] border-r border-b border-slate-800 p-1 md:p-2 relative group hover:bg-slate-800/30 transition-colors ${!isCurrentMonth ? 'bg-slate-900/30 opacity-50' : 'bg-slate-900'}`}>
                    <div className="flex justify-center">
                        <span className={`text-[10px] md:text-xs w-5 h-5 md:w-6 md:h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>
                            {formattedDate}
                        </span>
                    </div>
                    <div className="mt-1 space-y-1">
                        {dayEvents.slice(0, 3).map(evt => (
                            <div key={evt.id} className="text-[9px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-200 border border-blue-500/30 truncate">
                                {evt.title}
                            </div>
                        ))}
                        {dayEvents.length > 3 && <div className="text-[9px] text-center text-slate-500">+{dayEvents.length - 3} more</div>}
                    </div>
                </div>
            );
            day = addDays(day, 1);
        }
        rows.push(<div className="grid grid-cols-7" key={day.toString()}>{days}</div>);
        days = [];
    }
    return <div className="border-t border-l border-slate-800">{rows}</div>;
  };

  const renderWeekView = () => {
    const startDate = startOfWeek(currentDate);
    const weekDays = [];
    for(let i=0; i<7; i++) weekDays.push(addDays(startDate, i));
    const hours = Array.from({length: 24}, (_, i) => i);

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="grid grid-cols-8 border-b border-slate-800 min-w-[600px] md:min-w-0">
                <div className="p-4 border-r border-slate-800 sticky left-0 bg-slate-950 z-10"></div>
                {weekDays.map((day, i) => (
                    <div key={i} className={`p-2 text-center border-r border-slate-800 ${day.toDateString() === new Date().toDateString() ? 'bg-blue-900/20' : ''}`}>
                        <div className="text-xs text-slate-500 uppercase">{day.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                        <div className={`text-base md:text-lg font-semibold ${day.toDateString() === new Date().toDateString() ? 'text-blue-400' : 'text-slate-200'}`}>
                            {day.getDate()}
                        </div>
                    </div>
                ))}
            </div>
            <div className="flex-1 overflow-auto">
                <div className="grid grid-cols-8 relative min-w-[600px] md:min-w-0">
                    {/* Time Column */}
                    <div className="border-r border-slate-800 sticky left-0 bg-slate-950 z-10">
                        {hours.map(h => (
                            <div key={h} className="h-20 border-b border-slate-800/50 text-right pr-2 pt-1 text-xs text-slate-500 relative -top-3">
                                {h === 0 ? '12A' : h < 12 ? `${h}A` : h === 12 ? '12P' : `${h-12}P`}
                            </div>
                        ))}
                    </div>
                    {/* Days Columns */}
                    {weekDays.map((day, i) => {
                        const dayEvents = getEventsForDay(day);
                        return (
                            <div key={i} className="border-r border-slate-800 relative">
                                {hours.map(h => (
                                    <div key={h} className="h-20 border-b border-slate-800/50"></div>
                                ))}
                                {dayEvents.map(evt => {
                                    const start = new Date(evt.startTime);
                                    if (!isValidDate(start)) return null; // Safety check

                                    const top = (start.getHours() * 60 + start.getMinutes()) * (80 / 60); // 80px per hour
                                    return (
                                        <div 
                                            key={evt.id} 
                                            className="absolute left-1 right-1 rounded px-1 py-1 text-[10px] bg-blue-600 text-white shadow-md border border-blue-400 overflow-hidden"
                                            style={{ top: `${top}px`, height: '70px' }} 
                                        >
                                            <div className="font-semibold truncate">{evt.title}</div>
                                            <div className="opacity-75">{start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                                        </div>
                                    )
                                })}
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    );
  };

  const renderDayView = () => {
    const hours = Array.from({length: 24}, (_, i) => i);
    const dayEvents = getEventsForDay(currentDate);

    return (
         <div className="flex flex-col h-full overflow-hidden">
             <div className="p-4 border-b border-slate-800 text-center sticky top-0 bg-slate-950 z-10">
                 <h3 className="text-lg md:text-xl font-bold text-white">{currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric'})}</h3>
             </div>
             <div className="flex-1 overflow-y-auto">
                 <div className="relative">
                    {hours.map(h => (
                        <div key={h} className="h-24 border-b border-slate-800 flex">
                            <div className="w-14 md:w-20 text-right pr-2 md:pr-4 pt-2 text-xs text-slate-500 border-r border-slate-800 shrink-0">
                                 {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h-12} PM`}
                            </div>
                            <div className="flex-1 relative">
                                {/* Event Plotting */}
                                {dayEvents.filter(e => {
                                    const d = new Date(e.startTime);
                                    return isValidDate(d) && d.getHours() === h;
                                }).map(evt => (
                                     <div key={evt.id} className="absolute top-2 left-2 right-2 bg-blue-600/80 rounded p-2 text-sm text-white border border-blue-500 shadow-lg">
                                        <div className="font-bold truncate">{evt.title}</div>
                                        <div className="text-blue-100 flex items-center gap-2 text-xs">
                                            <Clock size={10}/>
                                            {isValidDate(new Date(evt.startTime)) ? new Date(evt.startTime).toLocaleTimeString([],{hour:'2-digit', minute:'2-digit'}) : '--:--'} - {isValidDate(new Date(evt.endTime)) ? new Date(evt.endTime).toLocaleTimeString([],{hour:'2-digit', minute:'2-digit'}) : '--:--'}
                                        </div>
                                        {evt.description && <div className="mt-1 text-xs opacity-80 truncate">{evt.description}</div>}
                                     </div>
                                ))}
                            </div>
                        </div>
                    ))}
                 </div>
             </div>
         </div>
    );
  };

  return (
    <div className="bg-slate-900 h-full flex flex-col border border-slate-800 rounded-2xl overflow-hidden shadow-2xl relative">
        
        {/* ADD EVENT MODAL */}
        {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
                <div className="bg-slate-900 w-full max-w-md rounded-2xl border border-slate-700 shadow-2xl overflow-hidden">
                    <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
                        <h3 className="font-bold text-white flex items-center gap-2">
                            <Plus size={18} className="text-blue-500" />
                            New Appointment
                        </h3>
                        <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white p-1 hover:bg-slate-800 rounded-lg transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                    
                    <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Title</label>
                            <input 
                                value={newEvent.title}
                                onChange={e => setNewEvent({...newEvent, title: e.target.value})}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
                                placeholder="Meeting with..."
                                autoFocus
                            />
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide flex items-center gap-1">
                                    <Calendar size={12} /> Date
                                </label>
                                <input 
                                    type="date"
                                    value={newEvent.date}
                                    onChange={e => setNewEvent({...newEvent, date: e.target.value})}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide flex items-center gap-1">
                                    <Clock size={12} /> Start
                                </label>
                                <input 
                                    type="time"
                                    value={newEvent.startTime}
                                    onChange={e => setNewEvent({...newEvent, startTime: e.target.value})}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide flex items-center gap-1">
                                    <Clock size={12} /> End
                                </label>
                                <input 
                                    type="time"
                                    value={newEvent.endTime}
                                    onChange={e => setNewEvent({...newEvent, endTime: e.target.value})}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide flex items-center gap-1">
                                <Repeat size={12} /> Repeat
                            </label>
                            <div className="grid grid-cols-4 gap-2">
                                {(['none', 'daily', 'weekly', 'monthly'] as RepeatMode[]).map(mode => (
                                    <button
                                        key={mode}
                                        onClick={() => setNewEvent({...newEvent, repeat: mode})}
                                        className={`px-2 py-2 rounded-lg text-xs font-medium capitalize transition-all border ${
                                            newEvent.repeat === mode 
                                            ? 'bg-blue-600 border-blue-500 text-white' 
                                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600'
                                        }`}
                                    >
                                        {mode}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Description</label>
                            <textarea 
                                value={newEvent.description}
                                onChange={e => setNewEvent({...newEvent, description: e.target.value})}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 min-h-[80px] resize-none"
                                placeholder="Notes..."
                            />
                        </div>
                    </div>

                    <div className="p-4 border-t border-slate-800 flex justify-end gap-3 bg-slate-950/50">
                        <button 
                            onClick={() => setIsModalOpen(false)}
                            className="px-4 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleSaveEvent}
                            className="px-6 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-500 flex items-center gap-2 shadow-lg shadow-blue-900/20"
                        >
                            <Save size={16} /> Save
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Floating Action Button for Add Event */}
        <button 
            onClick={() => setIsModalOpen(true)}
            className="absolute bottom-6 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-500 text-white rounded-full shadow-2xl flex items-center justify-center z-40 transition-transform hover:scale-105 active:scale-95 group"
        >
            <Plus size={28} className="group-hover:rotate-90 transition-transform duration-300" />
        </button>

        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-950">
            <div className="flex items-center gap-2 md:gap-4 w-full md:w-auto justify-between md:justify-start">
                <h2 className="text-lg md:text-2xl font-bold text-slate-100 min-w-[150px]">
                    {currentDate.toLocaleDateString('default', { month: 'long', year: 'numeric' })}
                </h2>
                <div className="flex items-center bg-slate-800 rounded-lg p-1 shrink-0">
                    <button onClick={handlePrev} className="p-1 hover:bg-slate-700 rounded text-slate-300"><ChevronLeft size={20}/></button>
                    <button onClick={handleToday} className="px-2 md:px-3 py-1 hover:bg-slate-700 rounded text-xs md:text-sm font-medium text-slate-300">Today</button>
                    <button onClick={handleNext} className="p-1 hover:bg-slate-700 rounded text-slate-300"><ChevronRight size={20}/></button>
                </div>
            </div>
            
            <div className="flex bg-slate-800 rounded-lg p-1 w-full md:w-auto overflow-x-auto">
                {(['day', 'week', 'month'] as ViewMode[]).map(m => (
                    <button 
                        key={m}
                        onClick={() => setViewMode(m)}
                        className={`flex-1 md:flex-none px-4 py-1.5 rounded-md text-xs md:text-sm font-medium capitalize transition-all whitespace-nowrap ${viewMode === m ? 'bg-slate-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                    >
                        {m}
                    </button>
                ))}
            </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden bg-slate-900 relative">
            {viewMode === 'month' && renderMonthView()}
            {viewMode === 'week' && renderWeekView()}
            {viewMode === 'day' && renderDayView()}
        </div>
    </div>
  );
};

export default CalendarWidget;