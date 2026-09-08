const fs = require('fs');

let chatView = fs.readFileSync('src/modules/chat/ChatView.tsx', 'utf8');

// Remove the global error banner
chatView = chatView.replace(
  /\{\/\* Error Banner with Retry \*\/\}\s*\{error && \([\s\S]*?\}\)/,
  ''
);

// Add the rendering of `system` messages as errors in the chat flow
// Let's find where the messages map is
const messageMapRegex = /className=\{\`flex \$\{isUser \? 'justify-end' : 'justify-start'\}\`\}\n\s*>\n\s*<div\n\s*className=\{\`max-w-xl p-3\.5 rounded-2xl space-y-1 \$\{[\s\S]*?isUser[\s\S]*?\? 'bg-gradient-to-br from-violet-600 to-violet-700 text-white rounded-te-xs shadow-md shadow-violet-950\/50'[\s\S]*?: 'bg-zinc-850 border border-zinc-700\/60 text-zinc-100 rounded-ts-xs shadow-md shadow-black\/40'[\s\S]*?\}\`\}/;

chatView = chatView.replace(messageMapRegex, (match) => {
  return `className={\`flex \${isUser ? 'justify-end' : 'justify-start'}\`}
                    >
                      <div
                        className={\`max-w-xl p-3.5 rounded-2xl space-y-1 \${
                          isUser
                            ? 'bg-gradient-to-br from-violet-600 to-violet-700 text-white rounded-te-xs shadow-md shadow-violet-950/50'
                            : msg.role === 'system'
                            ? 'bg-rose-950/50 border border-rose-800/60 text-rose-300 rounded-ts-xs'
                            : 'bg-zinc-850 border border-zinc-700/60 text-zinc-100 rounded-ts-xs shadow-md shadow-black/40'
                        }\`}`;
});

// Now replace the inside of the message to parse JSON for system errors and add retry button
const contentRegex = /\{isUser \? \([\s\S]*?\) : \([\s\S]*?<Markdown remarkPlugins=\{\[remarkGfm\]\}>\{msg\.content\}<\/Markdown>\n\s*<\/div>\n\s*\)\}/;

chatView = chatView.replace(contentRegex, (match) => {
  return `{isUser ? (
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
                        )}`;
});


fs.writeFileSync('src/modules/chat/ChatView.tsx', chatView);
