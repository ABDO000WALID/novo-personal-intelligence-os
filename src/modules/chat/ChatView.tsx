import React, { useState, useRef, useEffect, FormEvent, KeyboardEvent } from 'react';
import { useApp } from '../../core/providers/AppContext';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useChatStore } from '../../core/state/chatStore';
import { useAuthStore } from '../../core/auth/authStore';
import { AuthLifecycle } from '../../core/auth/authLifecycle';
import { useMemo } from 'react';
import { useChatOrchestrator } from './hooks/useChatOrchestrator';
import { useIntelligence } from '../../core/intelligence/useIntelligence';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Bot,
  Sparkles,
  Send,
  Plus,
  Trash2,
  Edit2,
  Calendar,
  BookOpen,
  Target,
  Zap,
  Check,
  X,
  MessageSquare,
  ShieldAlert,
  RotateCw,
  AlertCircle,
} from 'lucide-react';

import { LiveChatSurface } from './components/LiveChatSurface';

export function ChatView() {
  const { language, setActiveRoute } = useApp();
  const isAr = language === 'ar';
  
  const [chatMode, setChatMode] = useState<'rest' | 'live'>('rest');
  
  const { getContext } = useIntelligence();

  const status = useChatStore((state) => state.status);
  const initialize = useChatStore((state) => state.initialize);
  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const selectConversation = useChatStore((state) => state.selectConversation);
  const createConversation = useChatStore((state) => state.createConversation);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const renameConversation = useChatStore((state) => state.renameConversation);
  const deleteConversation = useChatStore((state) => state.deleteConversation);

  useEffect(() => {
    if (status === 'idle') {
      initialize();
    }
  }, [status, initialize]);

  const activeConversation = useMemo(() => {
    return conversations.find((c) => c.id === activeConversationId) || null;
  }, [conversations, activeConversationId]);

  const {
    executionState,
    error,
    lastCommandFeedback,
    submitMessage,
    retryLastMessage,
    clearError,
  } = useChatOrchestrator({
    getContext,
    onCommandNavigate: (route) => setActiveRoute(route),
    language,
  });

  const [inputMessage, setInputMessage] = useState('');
  const [isMobileHistoryOpen, setIsMobileHistoryOpen] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [actionError, setActionError] = useState<{ ar: string; en: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleCreateConversation = async () => {
    setActionError(null);
    clearError();
    const authUser = useAuthStore.getState().user;
    const authLoading = useAuthStore.getState().loading;
    const uid = AuthLifecycle.getUid();

    if (authLoading) {
      setActionError({
        ar: 'جاري تهيئة جلسة المستخدم. يرجى المحاولة بعد لحظات.',
        en: 'Authentication is still initializing. Please try again in a moment.',
      });
      return;
    }

    if (!authUser || !uid) {
      setActionError({
        ar: 'بدء محادثة جديدة يتطلب تسجيل الدخول.',
        en: 'Starting a new conversation requires an authenticated user.',
      });
      return;
    }

    try {
      await createConversation();
    } catch (err: any) {
      setActionError({
        ar: 'فشل إنشاء محادثة جديدة.',
        en: err?.message || 'Failed to create conversation.',
      });
    }
  };

  // Intelligent auto-scroll
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) {
      if (executionState === 'generating') {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
      return;
    }

    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    
    if (executionState === 'generating' || isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeConversation?.messages, executionState]);

  const handleSend = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!inputMessage.trim() || executionState !== 'idle') return;
    const msg = inputMessage;
    setInputMessage('');
    await submitMessage(msg);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (executionState === 'idle') {
        handleSend();
      }
    }
  };

  const startRename = (id: string, currentTitle: string) => {
    setEditingConvId(id);
    setEditTitle(currentTitle);
  };

  const saveRename = (id: string) => {
    if (editTitle.trim()) {
      renameConversation(id, editTitle);
    }
    setEditingConvId(null);
  };

  const suggestionPrompts = [
    {
      icon: Calendar,
      titleAr: 'صياغة خطة عمل لليوم',
      titleEn: 'Draft daily focus plan',
      descAr: 'ترتيب الأولويات وكتل الوقت لزيادة الإنتاجية',
      descEn: 'Organize priorities and deep-work time blocks',
    },
    {
      icon: BookOpen,
      titleAr: 'تنظيم واستخلاص ملاحظات المعرفة',
      titleEn: 'Synthesize knowledge notes',
      descAr: 'تحويل الملاحظات الخام إلى رؤى منظمة',
      descEn: 'Transform raw observations into structured insights',
    },
    {
      icon: Target,
      titleAr: 'هيكلة الأهداف والمحطات',
      titleEn: 'Structure strategic milestones',
      descAr: 'تقسيم الهدف السنوي إلى خطوات قابلة للقياس',
      descEn: 'Deconstruct long-term vision into measurable steps',
    },
    {
      icon: Zap,
      titleAr: 'استفسار ذكي وسريع',
      titleEn: 'Fast synthesis query',
      descAr: 'تحليل فوري للمعلومات والأسئلة المعقدة',
      descEn: 'Rapid reasoning on structured technical topics',
    },
  ];

  return (
    <div className="max-w-5xl mx-auto flex flex-col flex-1 h-full min-h-0 w-full pb-2">
      {/* Module Header Bar */}
      <div className="flex flex-row items-center justify-between gap-3 pb-3 border-b border-zinc-800/80 mb-3">
        <div className="flex items-center gap-3">
          <Button 
            onClick={() => setIsMobileHistoryOpen(true)} 
            className="md:hidden flex items-center justify-center p-2 bg-zinc-900 border-zinc-800 text-zinc-300 rounded-lg shrink-0" 
            variant="outline"
          >
            <MessageSquare className="w-5 h-5" />
          </Button>
          <div className="relative">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-violet-800 flex items-center justify-center text-white shadow-md shadow-violet-950/60 border border-violet-500/30">
              <Bot className="w-5 h-5" />
            </div>
            <div className="absolute -bottom-0.5 -end-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-zinc-950" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-zinc-100">
                {isAr ? 'محادثة NOVO الذكية' : 'NOVO Conversation Workspace'}
              </h1>
              <Badge variant="violet" className="text-[10px] py-0 px-2">
                {isAr ? 'بنية محلية مفعلة' : 'Local Threads Active'}
              </Badge>
            </div>
            <p className="text-xs text-zinc-400">
              {isAr
                ? 'إدارة جلسات المحادثة وحفظ الرسائل محلياً، جاهزة لتوصيل نماذج الذكاء الاصطناعي'
                : 'Manage local conversation threads; AI model activation staged for Phase 2B'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setChatMode('rest')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                chatMode === 'rest'
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              {isAr ? 'قياسي' : 'Standard'}
            </button>
            <button
              type="button"
              onClick={() => setChatMode('live')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                chatMode === 'live'
                  ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-900/50 shadow-sm'
                  : 'text-zinc-400 hover:text-emerald-400/80 hover:bg-zinc-800/50'
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${chatMode === 'live' ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
              {isAr ? 'مباشر' : 'Live'}
            </button>
          </div>
          
          <Button
            onClick={handleCreateConversation}
            size="sm"
            className="hidden md:flex items-center gap-1.5 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isAr ? 'محادثة جديدة' : 'New Chat'}</span>
          </Button>
        </div>
      </div>

      
      {/* Mobile History Drawer Overlay */}
      {isMobileHistoryOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
            onClick={() => setIsMobileHistoryOpen(false)} 
          />
          <div className="relative w-4/5 max-w-sm h-full bg-[#090a0f] border-e border-zinc-800/80 flex flex-col p-4 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-zinc-100">{isAr ? 'المحادثات السابقة' : 'History'}</h2>
              <button onClick={() => setIsMobileHistoryOpen(false)} className="p-2 rounded-lg bg-zinc-900/50 text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <Button
              onClick={() => {
                handleCreateConversation();
                setIsMobileHistoryOpen(false);
              }}
              size="sm"
              className="flex items-center justify-center gap-2 mb-4 bg-violet-600 hover:bg-violet-500 text-white"
            >
              <Plus className="w-4 h-4" />
              <span>{isAr ? 'محادثة جديدة' : 'New Chat'}</span>
            </Button>

            <div className="flex-1 overflow-y-auto space-y-1">
              {conversations.length === 0 ? (
                <div className="p-4 text-center text-xs text-zinc-600">
                  {isAr ? 'لا توجد محادثات' : 'No chats yet'}
                </div>
              ) : (
                conversations.map((c) => {
                  const isSelected = c.id === activeConversation?.id;
                  const isEditing = editingConvId === c.id;

                  return (
                    <div
                      key={c.id}
                      onClick={() => {
                        if (!isEditing) {
                          selectConversation(c.id);
                          setIsMobileHistoryOpen(false);
                        }
                      }}
                      className={`group flex items-center justify-between gap-2 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-zinc-800/80 border-violet-500/40 text-zinc-100 font-medium shadow-xs'
                          : 'bg-zinc-900/40 border-zinc-800/50 text-zinc-400 hover:bg-zinc-850 hover:text-zinc-200'
                      }`}
                    >
                      {isEditing ? (
                        <div className="flex items-center gap-1 flex-1">
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            autoFocus
                            className="w-full bg-zinc-950 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-100"
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              saveRename(c.id);
                            }}
                            className="p-1 text-emerald-400 hover:text-emerald-300"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingConvId(null);
                            }}
                            className="p-1 text-zinc-500 hover:text-zinc-300"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 truncate flex-1">
                            <MessageSquare className="w-4 h-4 text-zinc-500 shrink-0" />
                            <span className="truncate text-sm">{c.title}</span>
                          </div>
                          <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                startRename(c.id, c.title);
                              }}
                              className="p-1.5 text-zinc-500 hover:text-zinc-300 rounded"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteConversation(c.id);
                              }}
                              className="p-1.5 text-zinc-500 hover:text-rose-400 rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Split Grid */}
      <div className="flex-1 flex flex-row gap-4 min-h-0">
        {/* Left Sub-sidebar: Desktop Only */}
        <div className="hidden md:flex w-64 lg:w-72 flex-col gap-2 border-e border-zinc-800/80 pe-3 overflow-y-auto shrink-0 min-h-0">
          <div className="text-[11px] font-medium text-zinc-500 px-1 flex items-center justify-between">
            <span>{isAr ? 'المحادثات السابقة' : 'Saved Conversations'}</span>
            <span className="font-mono text-zinc-600">{conversations.length}</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 pe-1">
            {conversations.length === 0 ? (
              <div className="p-4 text-center text-xs text-zinc-600">
                {isAr ? 'لا توجد محادثات' : 'No chats yet'}
              </div>
            ) : (
              conversations.map((c) => {
                const isSelected = c.id === activeConversation?.id;
                const isEditing = editingConvId === c.id;

                return (
                  <div
                    key={c.id}
                    onClick={() => !isEditing && selectConversation(c.id)}
                    className={`group flex items-center justify-between gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-zinc-800/80 border-violet-500/40 text-zinc-100 font-medium shadow-xs'
                        : 'bg-zinc-900/40 border-zinc-800/50 text-zinc-400 hover:bg-zinc-850 hover:text-zinc-200'
                    }`}
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-1 flex-1">
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          autoFocus
                          className="w-full bg-zinc-950 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-100"
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            saveRename(c.id);
                          }}
                          className="p-1 text-emerald-400 hover:text-emerald-300"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingConvId(null);
                          }}
                          className="p-1 text-zinc-500 hover:text-zinc-300"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 truncate flex-1">
                          <MessageSquare className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                          <span className="truncate">{c.title}</span>
                        </div>
                        <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              startRename(c.id, c.title);
                            }}
                            className="p-1 text-zinc-500 hover:text-zinc-300 rounded"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteConversation(c.id);
                            }}
                            className="p-1 text-zinc-500 hover:text-rose-400 rounded"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Main Column: Active Conversation Messages & Input */}
        {chatMode === 'live' ? (
          <LiveChatSurface />
        ) : (
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            {/* Messages Stage */}
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto space-y-4 py-3 px-1 pe-2 scroll-smooth">

            {!activeConversation || activeConversation.messages.length === 0 ? (
              <div className="h-full flex flex-col justify-center items-center py-6 text-center space-y-6">
                <div className="space-y-3">
                  <div className="relative inline-flex mx-auto">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-b from-zinc-800 to-zinc-900 border border-zinc-700/60 flex items-center justify-center text-violet-400 shadow-xl shadow-black/80">
                      <Sparkles className="w-7 h-7 text-violet-400" />
                    </div>
                    <div className="absolute inset-0 bg-violet-600/20 blur-xl rounded-full -z-10 pointer-events-none" />
                  </div>

                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-zinc-100 tracking-tight">
                      {isAr ? 'مساحة المحادثة مهيأة' : 'Conversation Canvas Ready'}
                    </h2>
                    <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
                      {isAr
                        ? 'اكتب رسالتك بالأسفل لحفظها في جلسة المحادثة المحلية. سيتم ربط توليد الذكاء الاصطناعي في المرحلة القادمة.'
                        : 'Type your message below to record it in this local session. AI generation responses will connect in Phase 2B.'}
                    </p>
                  </div>
                </div>

                {/* Suggestions Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-xl w-full text-start">
                  {suggestionPrompts.map((item, idx) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setInputMessage(isAr ? item.titleAr : item.titleEn);
                        }}
                        className="group flex items-start gap-3 p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/80 hover:bg-zinc-850 hover:border-zinc-700/80 text-start transition-all cursor-pointer"
                      >
                        <div className="p-2 rounded-lg bg-zinc-800 text-zinc-400 group-hover:text-violet-400 shrink-0">
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="space-y-0.5">
                          <div className="text-xs font-medium text-zinc-200">
                            {isAr ? item.titleAr : item.titleEn}
                          </div>
                          <div className="text-[11px] text-zinc-500 leading-snug">
                            {isAr ? item.descAr : item.descEn}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {activeConversation.messages.map((msg, index) => {
                  const isUser = msg.role === 'user';
                  
                  return (
                    <React.Fragment key={msg.id}>
                      <div
                        className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-xl p-3.5 rounded-2xl space-y-1 ${
                            isUser
                              ? 'bg-gradient-to-br from-violet-600 to-violet-700 text-white rounded-te-xs shadow-md shadow-violet-950/50'
                              : msg.role === 'system'
                              ? 'bg-rose-950/50 border border-rose-800/60 text-rose-300 rounded-ts-xs'
                              : 'bg-zinc-850 border border-zinc-700/60 text-zinc-100 rounded-ts-xs shadow-md shadow-black/40'
                          }`}
                        >
                          {isUser ? (
                            <p className="text-xs md:text-sm leading-relaxed whitespace-pre-wrap">
                              {msg.content}
                            </p>
                          ) : msg.role === 'system' ? (
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                <span className="text-xs md:text-sm leading-relaxed whitespace-pre-wrap">
                                  {(() => {
                                    try {
                                      const parsed = JSON.parse(msg.content);
                                      return isAr ? (parsed.messageAr || parsed.message) : parsed.message;
                                    } catch (e) {
                                      return msg.content;
                                    }
                                  })()}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => retryLastMessage()}
                                className="self-start flex items-center gap-1.5 px-3 py-1.5 mt-1 rounded bg-rose-900/60 hover:bg-rose-800 transition-colors text-[11px]"
                              >
                                <RotateCw className="w-3.5 h-3.5" />
                                <span>{isAr ? 'إعادة المحاولة' : 'Retry'}</span>
                              </button>
                            </div>
                          ) : (
                            <div className="text-xs md:text-sm leading-relaxed whitespace-pre-wrap markdown-body prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-800">
                              <Markdown remarkPlugins={[remarkGfm]}>{msg.content}</Markdown>
                            </div>
                          )}
                          <span
                            className={`text-[10px] font-mono block ${
                              isUser ? 'text-violet-200/70 text-end' : 'text-zinc-500 text-start'
                            }`}
                          >
                            {new Date(msg.createdAt).toLocaleTimeString(isAr ? 'ar-SA' : 'en-US', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}

                {executionState === 'generating' && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2.5 p-3 rounded-2xl rounded-ts-xs bg-zinc-850 border border-zinc-700/60 text-zinc-300 shadow-md shadow-black/40 text-xs">
                      <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                      <span className="font-medium text-violet-300">
                        {isAr ? 'NOVO يقوم بالمعالجة...' : 'NOVO is processing...'}
                      </span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Command Feedback Pill */}
          {lastCommandFeedback && (
            <div className="flex items-start gap-2 py-2 px-3 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-300 mb-2 whitespace-pre-wrap leading-relaxed shadow-sm">
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1">{isAr ? lastCommandFeedback.ar : lastCommandFeedback.en}</div>
            </div>
          )}

          {/* Error Banner with Retry */}
          {(error || actionError) && (
            <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-rose-950/50 border border-rose-800/60 text-xs text-rose-300 mb-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>
                  {actionError
                    ? (isAr ? actionError.ar : actionError.en)
                    : (isAr ? error?.messageAr || error?.message : error?.message)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {error?.retryable && (
                  <button
                    type="button"
                    onClick={() => retryLastMessage()}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-rose-900/60 hover:bg-rose-800 text-rose-200 text-[11px] transition-colors"
                  >
                    <RotateCw className="w-3 h-3" />
                    <span>{isAr ? 'إعادة المحاولة' : 'Retry'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    clearError();
                    setActionError(null);
                  }}
                  className="p-1 text-rose-400 hover:text-rose-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Orchestrator Readiness Status Pill */}
          <div className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-zinc-900/80 border border-zinc-800 text-[11px] text-zinc-400 mb-2">
            <ShieldAlert className="w-3.5 h-3.5 text-violet-400 shrink-0" />
            <span>
              {isAr
                ? 'محرك التنسيق الذكي (AI Orchestrator) مفعل — الأوامر تتنفذ تلقائياً في الخلفية.'
                : 'AI Orchestrator core active — commands execute automatically in background.'}
            </span>
          </div>

          {/* Chat Input Container */}
          <form onSubmit={handleSend} className="relative">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/90 p-2.5 shadow-lg shadow-black/50 space-y-2">
              <textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={executionState !== 'idle'}
                placeholder={
                  executionState !== 'idle'
                    ? (isAr ? 'جاري المعالجة، يرجى الانتظار...' : 'Processing, please wait...')
                    : (isAr
                      ? 'اكتب رسالتك، فكرتك، أو أمرك هنا واضغط Enter للإرسال...'
                      : 'Type your message, thought, or prompt here and hit Enter...')
                }
                rows={2}
                className="w-full bg-transparent resize-none border-0 text-xs md:text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none leading-relaxed disabled:opacity-50 disabled:cursor-not-allowed"
              />

              <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60 text-xs">
                <span className="text-[11px] text-zinc-500 font-mono">
                  {isAr ? 'محادثة محلية آمنة' : 'Local Secure Thread'}
                </span>

                <Button
                  type="submit"
                  size="sm"
                  disabled={!inputMessage.trim() || executionState !== 'idle'}
                  className="px-3 py-1.5"
                >
                  <Send className="w-3.5 h-3.5 me-1" />
                  <span>{isAr ? 'إرسال' : 'Send'}</span>
                </Button>
              </div>
            </div>
          </form>
        </div>
        )}
      </div>
    </div>
  );
}