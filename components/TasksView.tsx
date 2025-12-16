import React, { useState } from 'react';
import { Task } from '../types';
import { Check, Plus, Trash2, Calendar as CalIcon, ChevronDown, ChevronRight } from 'lucide-react';
import { saveTasks, updateTaskStatus, deleteTask } from '../services/storageService';

interface TasksViewProps {
  tasks: Task[];
  onTasksChange: () => void;
}

const TasksView: React.FC<TasksViewProps> = ({ tasks, onTasksChange }) => {
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);

  const handleAddTask = () => {
      if (!newTaskTitle.trim()) return;
      const newTask: Task = {
          id: Date.now().toString(),
          title: newTaskTitle,
          completed: false,
          dueDate: new Date().toISOString()
      };
      saveTasks([newTask]);
      setNewTaskTitle('');
      onTasksChange();
  };

  const toggleTask = (id: string, currentStatus: boolean) => {
      updateTaskStatus(id, !currentStatus);
      onTasksChange();
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (confirm("Delete this task?")) {
          deleteTask(id);
          onTasksChange();
      }
  }

  const activeTasks = tasks.filter(t => !t.completed).sort((a,b) => Number(b.id) - Number(a.id));
  const completedTasks = tasks.filter(t => t.completed).sort((a,b) => Number(b.id) - Number(a.id));

  return (
    <div className="h-full flex flex-col bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-xl max-w-4xl mx-auto">
        <div className="p-6 border-b border-slate-800 bg-slate-950 flex justify-between items-center">
            <div>
                <h2 className="text-2xl font-bold text-white mb-1">My Tasks</h2>
                <p className="text-sm text-slate-400">Captured from your daily chats</p>
            </div>
            <div className="bg-blue-600/20 text-blue-400 text-xs font-bold px-3 py-1 rounded-full">
                {activeTasks.length} Pending
            </div>
        </div>

        {/* Add Task Input */}
        <div className="p-4 bg-slate-900 border-b border-slate-800 sticky top-0 z-10">
            <div className="flex items-center gap-3 bg-slate-800 rounded-lg px-4 py-3 shadow-inner border border-slate-700 focus-within:border-blue-500 transition-colors">
                <Plus className="text-blue-500 shrink-0" />
                <input 
                    type="text" 
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault(); // Stop event bubbling/duplication
                            handleAddTask();
                        }
                    }}
                    placeholder="Add a new task..." 
                    className="flex-1 bg-transparent focus:outline-none text-slate-200 placeholder-slate-500"
                />
                {newTaskTitle && (
                    <button onClick={handleAddTask} className="text-xs font-bold text-blue-500 uppercase tracking-wide">
                        Add
                    </button>
                )}
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
            
            {/* Active Tasks List */}
            <div className="space-y-1 mb-6">
                {activeTasks.length === 0 && (
                    <div className="p-8 text-center text-slate-500 italic text-sm">
                        No active tasks. Enjoy your day!
                    </div>
                )}
                {activeTasks.map(task => (
                    <div key={task.id} className="group flex items-start gap-3 p-3 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer relative">
                        <button 
                            onClick={() => toggleTask(task.id, task.completed)}
                            className="mt-0.5 w-5 h-5 rounded-full border-2 border-slate-500 hover:border-blue-500 flex items-center justify-center transition-colors shrink-0"
                        >
                        </button>
                        <div className="flex-1 min-w-0 pr-8">
                            <p className="text-slate-200 text-sm leading-relaxed break-words">{task.title}</p>
                            {task.dueDate && (
                                <p className="text-[10px] text-blue-400 flex items-center gap-1 mt-1">
                                    <CalIcon size={10} /> {new Date(task.dueDate).toLocaleDateString()}
                                </p>
                            )}
                        </div>
                        <button 
                            onClick={(e) => handleDelete(task.id, e)}
                            className="absolute right-2 top-3 p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded opacity-0 group-hover:opacity-100 transition-all"
                            title="Delete Task"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                ))}
            </div>

            {/* Completed Tasks Accordion */}
            {completedTasks.length > 0 && (
                <div className="border-t border-slate-800 pt-2">
                    <button 
                        onClick={() => setShowCompleted(!showCompleted)}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-500 hover:text-slate-300 font-medium hover:bg-slate-800/50 rounded-lg transition-colors"
                    >
                        {showCompleted ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        Completed ({completedTasks.length})
                    </button>

                    {showCompleted && (
                        <div className="space-y-1 mt-2 pl-2">
                            {completedTasks.map(task => (
                                <div key={task.id} className="group flex items-start gap-3 p-3 rounded-lg opacity-60 hover:opacity-100 transition-all relative">
                                    <button 
                                        onClick={() => toggleTask(task.id, task.completed)}
                                        className="mt-0.5 w-5 h-5 rounded-full bg-blue-600/20 border-2 border-blue-600 flex items-center justify-center text-blue-500 shrink-0"
                                    >
                                        <Check size={12} />
                                    </button>
                                    <div className="flex-1 min-w-0 pr-8">
                                        <p className="text-slate-400 line-through decoration-slate-600 text-sm break-words">{task.title}</p>
                                    </div>
                                    <button 
                                        onClick={(e) => handleDelete(task.id, e)}
                                        className="absolute right-2 top-3 p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded opacity-0 group-hover:opacity-100 transition-all"
                                        title="Delete Task"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    </div>
  );
};

export default TasksView;