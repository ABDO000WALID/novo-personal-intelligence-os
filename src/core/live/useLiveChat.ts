import { useState, useEffect, useCallback } from 'react';
import { LiveTransportClient, LiveConnectionState } from './liveTransportClient';

export interface LiveChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

// دالة ذكية لتنظيف واستخراج النص سواء كانت الرسالة مكتملة أو أثناء الـ Streaming
export function sanitizeMessageContent(content: string): string {
  if (!content) return content;
  const trimmed = content.trim();
  
  // التحقق إذا كان النص يحتوي على هيكل مصفوفة بيانات
  if (trimmed.startsWith('[{') && trimmed.includes('"text"')) {
    try {
      // 1. محاولة فك البيانات بشكل طبيعي (لو الرسالة اكتملت)
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item: any) => item?.text || '').join('');
      }
    } catch {
      // 2. حالة الـ Streaming (البيانات غير مكتملة): تنظيف النص يدوياً لعرضه فورياً
      let streamingText = content
        // إزالة أقواس البداية
        .replace(/^\[\s*\{\s*(?:"type"\s*:\s*"text"\s*,\s*)?"text"\s*:\s*"/, '')
        // إزالة أقواس النهاية إن وجدت
        .replace(/"\s*\}?\s*\]?$/, '');
        
      // فك تشفير الرموز الخاصة بالمسافات والسطور الجديدة
      streamingText = streamingText
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t');
        
      return streamingText;
    }
  }
  return content;
}

export function useLiveChat(client: LiveTransportClient) {
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [connectionState, setConnectionState] = useState<LiveConnectionState>(() => client.getState());
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    const handleState = (newState: LiveConnectionState) => {
      if (!mounted) return;
      setConnectionState(newState);
      if (newState === 'DISCONNECTED' || newState === 'ERROR') {
        setMessages(prev => {
          const streamingIdx = prev.findIndex(m => m.role === 'assistant' && m.isStreaming);
          if (streamingIdx === -1) return prev;
          const updated = [...prev];
          updated[streamingIdx] = {
            ...updated[streamingIdx],
            isStreaming: false
          };
          return updated;
        });
      }
    };

    const handleTextDelta = (text: string) => {
      if (!mounted) return;
      if (!text || typeof text !== 'string') return;
      
      setMessages(prev => {
        const streamingIdx = prev.findIndex(m => m.role === 'assistant' && m.isStreaming);
        if (streamingIdx === -1) {
          // Start a new streaming assistant message
          return [...prev, {
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            role: 'assistant',
            content: text,
            isStreaming: true
          }];
        }
        
        // Append to the active streaming assistant message
        const updated = [...prev];
        const active = updated[streamingIdx];
        updated[streamingIdx] = {
          ...active,
          content: active.content + text
        };
        return updated;
      });
    };

    const handleFinalizeTurn = () => {
      if (!mounted) return;
      setMessages(prev => {
        const streamingIdx = prev.findIndex(m => m.role === 'assistant' && m.isStreaming);
        if (streamingIdx === -1) {
          return prev; // Ignore if no active stream
        }
        
        // Finalize the active streaming assistant message
        const updated = [...prev];
        updated[streamingIdx] = {
          ...updated[streamingIdx],
          isStreaming: false
        };
        return updated;
      });
    };

    const handleError = (err: Error) => {
      if (!mounted) return;
      setError(err);
    };

    // Register listeners
    client.on('state', handleState);
    client.on('textDelta', handleTextDelta);
    client.on('turnComplete', handleFinalizeTurn);
    client.on('interrupted', handleFinalizeTurn);
    client.on('error', handleError);

    // Unregister exact same listeners on unmount
    return () => {
      mounted = false;
      client.off('state', handleState);
      client.off('textDelta', handleTextDelta);
      client.off('turnComplete', handleFinalizeTurn);
      client.off('interrupted', handleFinalizeTurn);
      client.off('error', handleError);
    };
  }, [client]);

  const sendMessage = useCallback((text: string): boolean => {
    const trimmed = text.trim();
    if (!trimmed) return false;

    const success = client.sendText(trimmed);
    if (success) {
      setError(null);
      setMessages(prev => [...prev, {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role: 'user',
        content: trimmed,
        isStreaming: false
      }]);
    }
    
    return success;
  }, [client]);

  const isStreaming = messages.some(m => m.role === 'assistant' && m.isStreaming === true);

  // تنظيف الرسائل قبل إرسالها للواجهة (UI)
  const sanitizedMessages = messages.map(m => ({
    ...m,
    content: m.role === 'assistant' ? sanitizeMessageContent(m.content) : m.content
  }));

  return {
    messages: sanitizedMessages,
    isStreaming,
    connectionState,
    error,
    sendMessage
  };
}