import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from 'react';
import { useApp } from '../../../core/providers/AppContext';
import { LiveTransportClient } from '../../../core/live/liveTransportClient';
import { useLiveTransport } from '../../../core/live/useLiveTransport';
import { useLiveChat } from '../../../core/live/useLiveChat';
import { useAuthStore } from '../../../core/auth/authStore';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, AlertCircle, Bot, Zap, WifiOff, Loader2, Sparkles, Activity } from 'lucide-react';

export function LiveChatSurface() {
  const { language } = useApp();
  const isAr = language === 'ar';
  
  // Own exactly one LiveTransportClient instance for the lifetime of this component
  const [client] = useState(() => new LiveTransportClient());
  
  const liveTransport = useLiveTransport(client);
  const liveChat = useLiveChat(client);
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  
  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  
  // Connection effect runs AFTER hooks have subscribed
  useEffect(() => {
    let mounted = true;
    
    const connect = async () => {
      const currentUser = useAuthStore.getState().user;
      if (!currentUser) {
        // No authenticated user, connection will wait until user is available
        return;
      }
      
      try {
        const token = await currentUser.getIdToken();
        if (!mounted) return;
        
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}/api/live`;
        
        await client.connect(wsUrl, token);
      } catch (err) {
        // Handled by liveTransport error state
        console.error('LiveChatSurface connection failed:', err);
      }
    };
    
    connect();
    
    return () => {
      mounted = false;
      client.disconnect();
    };
  }, [client, user]);

  // Auto-scroll on new messages or streaming
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [liveChat.messages, liveChat.isStreaming]);

  const handleSend = (e?: FormEvent) => {
    e?.preventDefault();
    if (!inputMessage.trim()) return;
    
    const success = liveChat.sendMessage(inputMessage);
    if (success) {
      setInputMessage('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const renderConnectionState = () => {
    if (liveTransport.error || liveChat.error) {
      return (
        <div className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-[11px] text-rose-300 mb-2">
          <WifiOff className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          <span>{isAr ? 'خطأ في الاتصال' : 'Connection Error'}: {liveTransport.error?.message || liveChat.error?.message}</span>
        </div>
      );
    }
    
    switch (liveTransport.connectionState) {
      case 'DISCONNECTED':
        return (
          <div className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-zinc-900/80 border border-zinc-800 text-[11px] text-zinc-500 mb-2">
            <WifiOff className="w-3.5 h-3.5 shrink-0" />
            <span>
              {authLoading
                ? (isAr ? 'غير متصل (جاري التحقق من الهوية...)' : 'Disconnected (Checking authentication...)')
                : !user
                ? (isAr ? 'غير متصل (يتطلب تسجيل الدخول)' : 'Disconnected (Authentication required)')
                : (isAr ? 'غير متصل' : 'Disconnected')}
            </span>
          </div>
        );
      case 'CONNECTING':
        return (
          <div className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-yellow-950/30 border border-yellow-800/40 text-[11px] text-yellow-500 mb-2">
            <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
            <span>{isAr ? 'جاري الاتصال...' : 'Connecting...'}</span>
          </div>
        );
      case 'AUTHENTICATING':
        return (
          <div className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-yellow-950/30 border border-yellow-800/40 text-[11px] text-yellow-500 mb-2">
            <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
            <span>{isAr ? 'جاري المصادقة...' : 'Authenticating...'}</span>
          </div>
        );
      case 'NOVO_CONNECTED':
        if (!liveTransport.isGeminiReady) {
          return (
            <div className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-blue-950/30 border border-blue-800/40 text-[11px] text-blue-400 mb-2">
              <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
              <span>{isAr ? 'بدء تشغيل الذكاء الاصطناعي...' : 'Starting AI...'}</span>
            </div>
          );
        }
        return (
          <div className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-emerald-950/30 border border-emerald-800/40 text-[11px] text-emerald-400 mb-2 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
            <Activity className="w-3.5 h-3.5 shrink-0 animate-pulse" />
            <span>{isAr ? 'مباشر (Live)' : 'Live'}</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0">
      {/* Messages Stage */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto space-y-4 py-3 px-1 pe-2 scroll-smooth">
        {liveChat.messages.length === 0 ? (
          <div className="h-full flex flex-col justify-center items-center py-6 text-center space-y-6">
            <div className="space-y-3">
              <div className="relative inline-flex mx-auto">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-b from-zinc-800 to-zinc-900 border border-zinc-700/60 flex items-center justify-center text-emerald-400 shadow-xl shadow-black/80">
                  <Zap className="w-7 h-7 text-emerald-400" />
                </div>
                <div className="absolute inset-0 bg-emerald-600/20 blur-xl rounded-full -z-10 pointer-events-none" />
              </div>

              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-zinc-100 tracking-tight">
                  {isAr ? 'المحادثة المباشرة' : 'Live Chat Canvas'}
                </h2>
                <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
                  {isAr
                    ? 'هذه الجلسة حية ومؤقتة. لن يتم حفظ الرسائل في سجلك.'
                    : 'This session is live and ephemeral. Messages are not saved to your history.'}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {liveChat.messages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id || `msg-${idx}`}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xl p-3.5 rounded-2xl space-y-1 ${
                      isUser
                        ? 'bg-gradient-to-br from-violet-600 to-violet-700 text-white rounded-te-xs shadow-md shadow-violet-950/50'
                        : 'bg-zinc-850 border border-zinc-700/60 text-zinc-100 rounded-ts-xs shadow-md shadow-black/40'
                    }`}
                  >
                    {isUser ? (
                      <p className="text-xs md:text-sm leading-relaxed whitespace-pre-wrap">
                        {msg.content}
                      </p>
                    ) : (
                      <div className="text-xs md:text-sm leading-relaxed whitespace-pre-wrap markdown-body prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-800">
                        <Markdown remarkPlugins={[remarkGfm]}>{msg.content}</Markdown>
                        {msg.isStreaming && (
                          <span className="inline-block w-1.5 h-3.5 ml-1 align-middle bg-violet-400 animate-pulse" />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {renderConnectionState()}

      {/* Chat Input Container */}
      <form onSubmit={handleSend} className="relative">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/90 p-2.5 shadow-lg shadow-black/50 space-y-2">
          <textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isAr
                ? 'اكتب رسالتك، فكرتك، أو أمرك هنا واضغط Enter للإرسال...'
                : 'Type your message, thought, or command here and press Enter...'
            }
            className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 resize-none outline-none min-h-[44px] max-h-32 disabled:opacity-50"
            rows={1}
            style={{
              height: 'auto',
              minHeight: '44px',
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
            }}
          />
          <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60">
            <div className="text-[10px] text-zinc-500 font-medium">
              {isAr ? 'وضع مباشر (مؤقت)' : 'Live Mode (Ephemeral)'}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={!inputMessage.trim()}
                className="flex items-center justify-center w-8 h-8 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
