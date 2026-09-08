import { useState } from 'react';
import { useApp } from '../../core/providers/AppContext';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useNotes } from './hooks/useNotes';
import {
  FileText,
  Plus,
  Search,
  Trash2,
  Calendar,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

export function NotesView() {
  const { language } = useApp();
  const isAr = language === 'ar';
  const {
    filteredNotes,
    activeNote,
    activeNoteId,
    setActiveNoteId,
    searchQuery,
    setSearchQuery,
    createNote,
    updateNote,
    deleteNote,
  } = useNotes();

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const formatDate = (isoStr: string) => {
    try {
      const date = new Date(isoStr);
      return date.toLocaleDateString(isAr ? 'ar-SA' : 'en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Module Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-600/20 to-violet-900/10 border border-violet-500/30 text-violet-400 shadow-sm shadow-violet-950/40">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-zinc-100">
                {isAr ? 'الملاحظات والمعرفة' : 'Notes & Thoughts'}
              </h1>
              <Badge variant="violet" className="text-[10px] py-0 px-2">
                {isAr ? 'حفظ محلي فوري' : 'Local Storage'}
              </Badge>
            </div>
            <p className="text-xs text-zinc-400">
              {isAr
                ? 'تدوين فوري للأفكار، حفظ دائم على متصفحك، وبحث فوري'
                : 'Instant ideation, safe local persistence, and fast search'}
            </p>
          </div>
        </div>

        <Button
          onClick={() => createNote()}
          size="sm"
          className="flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>{isAr ? 'ملاحظة جديدة' : 'New Note'}</span>
        </Button>
      </div>

      {/* Main Split Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[560px]">
        {/* Left Column: Notes List & Search */}
        <div className="lg:col-span-4 flex flex-col gap-3">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isAr ? 'بحث في الملاحظات...' : 'Search notes...'}
              className="w-full bg-zinc-900/90 border border-zinc-800 rounded-xl ps-9 pe-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50 transition-colors"
            />
          </div>

          {/* Notes Cards Scroll Container */}
          <div className="flex-1 space-y-2 overflow-y-auto max-h-[500px] pe-1">
            {filteredNotes.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-zinc-900/30 border border-zinc-800/40 space-y-2">
                <FileText className="w-6 h-6 text-zinc-600 mx-auto" />
                <p className="text-xs text-zinc-500">
                  {searchQuery
                    ? isAr
                      ? 'لا توجد نتائج تطابق بحثك'
                      : 'No matching notes found'
                    : isAr
                      ? 'لا توجد ملاحظات بعد. ابدأ بإنشاء واحدة!'
                      : 'No notes yet. Create your first note!'}
                </p>
              </div>
            ) : (
              filteredNotes.map((note) => {
                const isSelected = note.id === activeNoteId;
                return (
                  <div
                    key={note.id}
                    onClick={() => setActiveNoteId(note.id)}
                    className={`group relative p-3.5 rounded-xl border transition-all duration-150 cursor-pointer text-start ${
                      isSelected
                        ? 'bg-zinc-800/80 border-violet-500/40 shadow-sm shadow-violet-950/30 ring-1 ring-violet-500/20'
                        : 'bg-zinc-900/50 border-zinc-800/70 hover:bg-zinc-850 hover:border-zinc-700/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3
                        className={`text-xs font-medium truncate ${
                          isSelected ? 'text-zinc-100 font-semibold' : 'text-zinc-300'
                        }`}
                      >
                        {note.title || (isAr ? 'بدون عنوان' : 'Untitled')}
                      </h3>

                      <span className="text-[10px] text-zinc-500 font-mono shrink-0">
                        {formatDate(note.updatedAt || note.createdAt)}
                      </span>
                    </div>

                    <p className="text-[11px] text-zinc-400/80 line-clamp-2 mt-1 leading-relaxed">
                      {note.content || (isAr ? 'لا يوجد محتوى...' : 'No content yet...')}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Active Note Editor */}
        <div className="lg:col-span-8 flex flex-col">
          {activeNote ? (
            <Card className="flex-1 flex flex-col p-5 bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 border-zinc-800/80 space-y-4 shadow-md shadow-black/40">
              {/* Note Editor Header Bar */}
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800/70 gap-2">
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                  <span>
                    {isAr ? 'آخر تحديث:' : 'Updated:'} {formatDate(activeNote.updatedAt)}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400/90 ms-2">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>{isAr ? 'محفوظ' : 'Saved'}</span>
                  </span>
                </div>

                {/* Delete Note with Confirmation */}
                <div className="flex items-center gap-1.5">
                  {confirmDeleteId === activeNote.id ? (
                    <div className="flex items-center gap-1.5 bg-rose-950/40 border border-rose-800/50 px-2 py-1 rounded-lg text-xs">
                      <span className="text-rose-300 text-[11px]">
                        {isAr ? 'تأكيد الحذف؟' : 'Confirm delete?'}
                      </span>
                      <button
                        onClick={() => {
                          deleteNote(activeNote.id);
                          setConfirmDeleteId(null);
                        }}
                        className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-medium"
                      >
                        {isAr ? 'نعم' : 'Yes'}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px]"
                      >
                        {isAr ? 'إلغاء' : 'Cancel'}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(activeNote.id)}
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
                      title={isAr ? 'حذف الملاحظة' : 'Delete note'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Editable Title Input */}
              <input
                type="text"
                value={activeNote.title}
                onChange={(e) => updateNote(activeNote.id, { title: e.target.value })}
                placeholder={isAr ? 'عنوان الملاحظة...' : 'Note title...'}
                className="w-full bg-transparent border-0 text-base md:text-lg font-semibold text-zinc-100 placeholder:text-zinc-600 focus:outline-none tracking-tight"
              />

              {/* Editable Content Textarea */}
              <textarea
                value={activeNote.content}
                onChange={(e) => updateNote(activeNote.id, { content: e.target.value })}
                placeholder={
                  isAr
                    ? 'اكتب أفكارك وملاحظاتك هنا، يتم الحفظ تلقائياً في التخزين المحلي...'
                    : 'Write your thoughts and notes here, automatically saved locally...'
                }
                className="flex-1 w-full min-h-[360px] bg-transparent resize-none border-0 text-xs md:text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none leading-relaxed"
              />
            </Card>
          ) : (
            <Card className="flex-1 p-12 flex flex-col items-center justify-center text-center space-y-4 bg-zinc-900/40 border-zinc-800/60">
              <div className="w-12 h-12 rounded-2xl bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-zinc-500">
                <Sparkles className="w-6 h-6 text-violet-400/60" />
              </div>
              <div className="space-y-1 max-w-sm">
                <h3 className="text-sm font-medium text-zinc-300">
                  {isAr ? 'لا توجد ملاحظة محددة' : 'No note selected'}
                </h3>
                <p className="text-xs text-zinc-500">
                  {isAr
                    ? 'اختر ملاحظة من القائمة لعرضها وتعديلها، أو أنشئ ملاحظة جديدة.'
                    : 'Select a note from the list to view and edit, or create a new one.'}
                </p>
              </div>
              <Button onClick={() => createNote()} size="sm" variant="secondary">
                <Plus className="w-3.5 h-3.5 me-1" />
                <span>{isAr ? 'إنشاء ملاحظة جديدة' : 'Create note'}</span>
              </Button>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
