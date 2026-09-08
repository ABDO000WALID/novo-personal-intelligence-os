const fs = require('fs');
let code = fs.readFileSync('src/modules/chat/ChatView.tsx', 'utf8');

const regexImport = /import \{ useState, useRef, useEffect, FormEvent, KeyboardEvent \} from 'react';/;
code = code.replace(regexImport, "import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from 'react';");

// Insert isMobileHistoryOpen
code = code.replace(
  /const \[inputMessage, setInputMessage\] = useState\(''\);/,
  `const [inputMessage, setInputMessage] = useState('');\n  const [isMobileHistoryOpen, setIsMobileHistoryOpen] = useState(false);\n  const messagesContainerRef = useRef<HTMLDivElement>(null);`
);

// Replace auto-scroll effect
code = code.replace(
  /\/\/ Auto-scroll to bottom of conversation\n\s*useEffect\(\(\) => \{\n\s*messagesEndRef\.current\?\.scrollIntoView\(\{ behavior: 'smooth' \}\);\n\s*\}, \[activeConversation\?\.messages, executionState\]\);/,
  `// Intelligent auto-scroll
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) {
      // Fallback
      if (executionState === 'generating') {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
      return;
    }

    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    
    if (executionState === 'generating' || isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeConversation?.messages, executionState]);`
);

// Update Header to include Mobile History Button
code = code.replace(
  /<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800\/80 mb-3">/,
  `<div className="flex flex-row items-center justify-between gap-3 pb-3 border-b border-zinc-800/80 mb-3">`
);

code = code.replace(
  /<div className="flex items-center gap-3">\n\s*<div className="relative">/,
  `<div className="flex items-center gap-3">
          <Button 
            onClick={() => setIsMobileHistoryOpen(true)} 
            className="md:hidden flex items-center justify-center p-2 bg-zinc-900 border-zinc-800 text-zinc-300 rounded-lg shrink-0" 
            variant="outline"
          >
            <MessageSquare className="w-5 h-5" />
          </Button>
          <div className="relative">`
);

// We need to render the Sidebar list correctly.
// Let's replace the whole Main Split Grid
const historySidebarBlock = `
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
                createConversation();
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
                      className={\`group flex items-center justify-between gap-2 p-3 rounded-xl border text-xs cursor-pointer transition-all \${
                        isSelected
                          ? 'bg-zinc-800/80 border-violet-500/40 text-zinc-100 font-medium shadow-xs'
                          : 'bg-zinc-900/40 border-zinc-800/50 text-zinc-400 hover:bg-zinc-850 hover:text-zinc-200'
                      }\`}
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
                    className={\`group flex items-center justify-between gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition-all \${
                      isSelected
                        ? 'bg-zinc-800/80 border-violet-500/40 text-zinc-100 font-medium shadow-xs'
                        : 'bg-zinc-900/40 border-zinc-800/50 text-zinc-400 hover:bg-zinc-850 hover:text-zinc-200'
                    }\`}
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
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          {/* Messages Stage */}
          <div ref={messagesContainerRef} className="flex-1 overflow-y-auto space-y-4 py-3 px-1 pe-2 scroll-smooth">
`;

// Now we need to replace from `{/* Main Split Grid */}` down to `<div className="flex-1 overflow-y-auto space-y-4 py-3 px-1 pe-2">`
const startIndex = code.indexOf('{/* Main Split Grid */}');
const endIndex = code.indexOf('<div className="flex-1 overflow-y-auto space-y-4 py-3 px-1 pe-2">');

if (startIndex !== -1 && endIndex !== -1) {
  const toReplace = code.substring(startIndex, endIndex + '<div className="flex-1 overflow-y-auto space-y-4 py-3 px-1 pe-2">'.length);
  code = code.replace(toReplace, historySidebarBlock);
}

// Ensure the button in header is hidden correctly on desktop.
// The button 'New Chat' in header:
code = code.replace(
  /<Button\n\s*onClick=\{\(\) => createConversation\(\)\}\n\s*size="sm"\n\s*className="flex items-center gap-1\.5 self-start sm:self-auto"\n\s*>/,
  `<Button
          onClick={() => createConversation()}
          size="sm"
          className="hidden md:flex items-center gap-1.5 shrink-0"
        >`
);

fs.writeFileSync('src/modules/chat/ChatView.tsx', code);
