import { useState, useMemo, FormEvent, KeyboardEvent } from 'react';
import { useApp } from '../../core/providers/AppContext';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useKnowledge } from './hooks/useKnowledge';
import {
  KnowledgeCategory,
  KnowledgeImportance,
  KnowledgeItem,
} from '../../types/data';
import {
  Database,
  Search,
  Plus,
  Pin,
  Tag,
  Edit2,
  Trash2,
  Check,
  X,
  Sparkles,
  BookOpen,
  Code2,
  Rocket,
  Lightbulb,
  User,
  Wallet,
  Globe,
  Filter,
  BrainCircuit,
  Clock,
  RotateCcw,
} from 'lucide-react';

interface CategoryConfig {
  labelAr: string;
  labelEn: string;
  icon: typeof BookOpen;
  colorClass: string;
  borderClass: string;
}

const CATEGORIES: Record<KnowledgeCategory, CategoryConfig> = {
  study: {
    labelAr: 'دراسة وتعلم',
    labelEn: 'Study',
    icon: BookOpen,
    colorClass: 'text-indigo-400 bg-indigo-950/40',
    borderClass: 'border-indigo-800/40',
  },
  programming: {
    labelAr: 'برمجة وتطوير',
    labelEn: 'Programming',
    icon: Code2,
    colorClass: 'text-cyan-400 bg-cyan-950/40',
    borderClass: 'border-cyan-800/40',
  },
  project: {
    labelAr: 'مشاريع وسياق',
    labelEn: 'Projects',
    icon: Rocket,
    colorClass: 'text-violet-400 bg-violet-950/40',
    borderClass: 'border-violet-800/40',
  },
  idea: {
    labelAr: 'أفكار ورؤى',
    labelEn: 'Ideas',
    icon: Lightbulb,
    colorClass: 'text-amber-400 bg-amber-950/40',
    borderClass: 'border-amber-800/40',
  },
  personal: {
    labelAr: 'شخصي وحياتي',
    labelEn: 'Personal',
    icon: User,
    colorClass: 'text-emerald-400 bg-emerald-950/40',
    borderClass: 'border-emerald-800/40',
  },
  finance: {
    labelAr: 'مالية واستثمار',
    labelEn: 'Finance',
    icon: Wallet,
    colorClass: 'text-emerald-300 bg-emerald-950/30',
    borderClass: 'border-emerald-800/30',
  },
  general: {
    labelAr: 'معرفة عامة',
    labelEn: 'General',
    icon: Globe,
    colorClass: 'text-zinc-300 bg-zinc-800/60',
    borderClass: 'border-zinc-700/50',
  },
};

const IMPORTANCE_CONFIG: Record<
  KnowledgeImportance,
  { labelAr: string; labelEn: string; badgeClass: string; dotClass: string }
> = {
  high: {
    labelAr: 'أهمية قصوى',
    labelEn: 'High Priority',
    badgeClass: 'bg-violet-950/50 text-violet-300 border-violet-700/50 shadow-xs shadow-violet-950/30',
    dotClass: 'bg-violet-400',
  },
  medium: {
    labelAr: 'أهمية متوسطة',
    labelEn: 'Medium Priority',
    badgeClass: 'bg-zinc-800/60 text-zinc-300 border-zinc-700/50',
    dotClass: 'bg-zinc-400',
  },
  low: {
    labelAr: 'مرجعية عامة',
    labelEn: 'Low Priority',
    badgeClass: 'bg-zinc-900/60 text-zinc-400 border-zinc-800/60',
    dotClass: 'bg-zinc-500',
  },
};

export function KnowledgeView() {
  const { language } = useApp();
  const isAr = language === 'ar';

  const {
    items,
    filteredItems,
    pinnedItems,
    unpinnedItems,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    selectedImportance,
    setSelectedImportance,
    createKnowledge,
    updateKnowledge,
    deleteKnowledge,
    togglePinned,
    stats,
  } = useKnowledge();

  // Editor states
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  // Form states
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formCategory, setFormCategory] = useState<KnowledgeCategory>('general');
  const [formImportance, setFormImportance] = useState<KnowledgeImportance>('medium');
  const [formPinned, setFormPinned] = useState(false);
  const [formTags, setFormTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Inline delete confirmation ID
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const resetForm = () => {
    setFormTitle('');
    setFormContent('');
    setFormCategory('general');
    setFormImportance('medium');
    setFormPinned(false);
    setFormTags([]);
    setTagInput('');
    setEditingItemId(null);
    setIsEditorOpen(false);
  };

  const handleOpenCreate = () => {
    resetForm();
    setIsEditorOpen(true);
  };

  const handleOpenEdit = (item: KnowledgeItem) => {
    setEditingItemId(item.id);
    setFormTitle(item.title);
    setFormContent(item.content);
    setFormCategory(item.category);
    setFormImportance(item.importance);
    setFormPinned(item.pinned);
    setFormTags(item.tags);
    setTagInput('');
    setIsEditorOpen(true);
  };

  const handleAddTag = () => {
    const trimmed = tagInput.trim().toLowerCase();
    if (!trimmed) return;
    if (!formTags.includes(trimmed)) {
      setFormTags([...formTags, trimmed]);
    }
    setTagInput('');
  };

  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormTags(formTags.filter((t) => t !== tagToRemove));
  };

  const handleSubmitForm = (e: FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    if (editingItemId) {
      updateKnowledge(editingItemId, {
        title: formTitle,
        content: formContent,
        category: formCategory,
        importance: formImportance,
        pinned: formPinned,
        tags: formTags,
      });
    } else {
      createKnowledge({
        title: formTitle,
        content: formContent,
        category: formCategory,
        importance: formImportance,
        pinned: formPinned,
        tags: formTags,
      });
    }

    resetForm();
  };

  const formatRelativeTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(isAr ? 'ar-SA' : 'en-US', {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  };

  const categoryEntries = useMemo(
    () => Object.entries(CATEGORIES) as [KnowledgeCategory, CategoryConfig][],
    []
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* 1. Module Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-600/20 to-indigo-900/10 border border-violet-500/30 text-violet-400 shadow-sm shadow-violet-950/40">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-zinc-100">
                {isAr ? 'خزينة المعرفة والذاكرة الشخصية' : 'Personal Intelligence & Knowledge Memory'}
              </h1>
              <Badge variant="violet" className="text-[10px] py-0 px-2">
                {isAr ? 'قاعدة محلية نشطة' : 'Local Memory Active'}
              </Badge>
            </div>
            <p className="text-xs text-zinc-400">
              {isAr
                ? 'حفظ وتصنيف المعرفة، سياقات المشاريع، والأفكار الاستراتيجية لتدعيم ذاكرة NOVO'
                : 'Curate learning, project contexts, and strategic memories for NOVO intelligence'}
            </p>
          </div>
        </div>

        <Button
          id="btn-add-knowledge"
          onClick={handleOpenCreate}
          size="sm"
          className="flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>{isAr ? 'إضافة معرفة جديدة' : 'Add Knowledge'}</span>
        </Button>
      </div>

      {/* 2. Metadata / Stats Overview Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3.5 bg-gradient-to-b from-zinc-900/70 to-zinc-950 border-zinc-800/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] text-zinc-400 font-medium">
              {isAr ? 'إجمالي المعارف' : 'Total Items'}
            </div>
            <div className="text-xl font-bold font-mono text-zinc-100 mt-0.5">{stats.total}</div>
          </div>
          <BrainCircuit className="w-5 h-5 text-zinc-600" />
        </Card>

        <Card className="p-3.5 bg-gradient-to-b from-zinc-900/70 to-zinc-950 border-zinc-800/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] text-zinc-400 font-medium">
              {isAr ? 'الذاكرة المثبتة' : 'Pinned Memories'}
            </div>
            <div className="text-xl font-bold font-mono text-amber-400 mt-0.5">{stats.pinned}</div>
          </div>
          <Pin className="w-5 h-5 text-amber-500/60 fill-amber-500/20" />
        </Card>

        <Card className="p-3.5 bg-gradient-to-b from-zinc-900/70 to-zinc-950 border-zinc-800/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] text-zinc-400 font-medium">
              {isAr ? 'أهمية قصوى' : 'High Priority'}
            </div>
            <div className="text-xl font-bold font-mono text-violet-400 mt-0.5">
              {stats.highImportance}
            </div>
          </div>
          <Sparkles className="w-5 h-5 text-violet-500/60" />
        </Card>

        <Card className="p-3.5 bg-gradient-to-b from-zinc-900/70 to-zinc-950 border-zinc-800/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] text-zinc-400 font-medium">
              {isAr ? 'مطابقة الفلتر' : 'Filtered Matches'}
            </div>
            <div className="text-xl font-bold font-mono text-emerald-400 mt-0.5">
              {filteredItems.length}
            </div>
          </div>
          <Filter className="w-5 h-5 text-emerald-500/60" />
        </Card>
      </div>

      {/* 3. Search & Filters Bar */}
      <div className="space-y-3 p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800/70 shadow-xs">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Instant Search Input */}
          <div className="relative flex-1">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              id="knowledge-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                isAr
                  ? 'ابحث في العناوين، المحتوى، والوسوم...'
                  : 'Search by title, content, or tags...'
              }
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg ps-9 pe-8 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute end-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-0.5"
                title={isAr ? 'مسح البحث' : 'Clear search'}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Importance Filter */}
          <div className="flex items-center gap-1.5 self-start sm:self-auto shrink-0">
            <span className="text-[11px] text-zinc-500 font-medium hidden sm:inline-block">
              {isAr ? 'الأهمية:' : 'Priority:'}
            </span>
            <div className="inline-flex rounded-lg bg-zinc-950 p-1 border border-zinc-800 text-xs">
              {(['all', 'high', 'medium', 'low'] as const).map((imp) => {
                const isSelected = selectedImportance === imp;
                const label =
                  imp === 'all'
                    ? isAr
                      ? 'الكل'
                      : 'All'
                    : isAr
                      ? IMPORTANCE_CONFIG[imp].labelAr
                      : IMPORTANCE_CONFIG[imp].labelEn;
                return (
                  <button
                    key={imp}
                    onClick={() => setSelectedImportance(imp)}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-violet-950/80 text-violet-200 border border-violet-700/50 shadow-xs'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Category Pills Filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1 rounded-lg text-xs font-medium shrink-0 transition-all border cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-zinc-800 text-zinc-100 border-zinc-600 shadow-xs'
                : 'bg-zinc-950/60 text-zinc-400 border-zinc-800/80 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            {isAr ? 'جميع الفئات' : 'All Categories'}
          </button>

          {categoryEntries.map(([catKey, config]) => {
            const Icon = config.icon;
            const isSelected = selectedCategory === catKey;
            return (
              <button
                key={catKey}
                onClick={() => setSelectedCategory(catKey)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium shrink-0 transition-all border cursor-pointer ${
                  isSelected
                    ? `${config.colorClass} ${config.borderClass} border shadow-xs font-semibold`
                    : 'bg-zinc-950/60 text-zinc-400 border-zinc-800/80 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{isAr ? config.labelAr : config.labelEn}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Knowledge Editor (Create / Edit Inline Workspace Card) */}
      {isEditorOpen && (
        <Card
          id="knowledge-editor-card"
          className="p-5 border-violet-500/40 bg-zinc-900/95 shadow-xl shadow-black/60 space-y-4"
        >
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-violet-950/60 border border-violet-800/40 text-violet-400">
                {editingItemId ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              </div>
              <h2 className="text-sm font-semibold text-zinc-100">
                {editingItemId
                  ? isAr
                    ? 'تعديل المعرفة المحفوظة'
                    : 'Edit Knowledge Memory'
                  : isAr
                    ? 'إضافة معرفة جديدة إلى الذاكرة'
                    : 'Add New Knowledge Item'}
              </h2>
            </div>
            <button
              onClick={resetForm}
              className="p-1 rounded text-zinc-500 hover:text-zinc-300"
              title={isAr ? 'إغلاق' : 'Close'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmitForm} className="space-y-4">
            {/* Title */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                {isAr ? 'عنوان المعرفة أو الموضوع' : 'Title / Subject'}
                <span className="text-violet-400 ms-1">*</span>
              </label>
              <input
                id="knowledge-form-title"
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder={
                  isAr
                    ? 'مثال: معمارية الأنظمة الموزعة، ملخص كتاب، سياق مشروع...'
                    : 'e.g. Distributed systems architecture, book takeaways, project context...'
                }
                required
                autoFocus
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 font-medium"
              />
            </div>

            {/* Content */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                {isAr ? 'المحتوى والشروحات والسياق' : 'Content & Insights'}
              </label>
              <textarea
                id="knowledge-form-content"
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder={
                  isAr
                    ? 'اكتب التفاصيل المعرفية، الروابط المنطقية، أو المعلومات الهامة التي تريد الاحتفاظ بها...'
                    : 'Enter key facts, architectural logic, structured notes, or memories to retain...'
                }
                rows={4}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 leading-relaxed resize-y"
              />
            </div>

            {/* Category + Importance + Pinned Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Category */}
              <div>
                <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                  {isAr ? 'التصنيف' : 'Category'}
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value as KnowledgeCategory)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-violet-500"
                >
                  {categoryEntries.map(([catKey, config]) => (
                    <option key={catKey} value={catKey}>
                      {isAr ? config.labelAr : config.labelEn}
                    </option>
                  ))}
                </select>
              </div>

              {/* Importance */}
              <div>
                <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                  {isAr ? 'درجة الأهمية' : 'Priority Level'}
                </label>
                <select
                  value={formImportance}
                  onChange={(e) => setFormImportance(e.target.value as KnowledgeImportance)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-violet-500"
                >
                  <option value="high">{isAr ? 'أهمية قصوى (High)' : 'High'}</option>
                  <option value="medium">{isAr ? 'متوسطة (Medium)' : 'Medium'}</option>
                  <option value="low">{isAr ? 'منخفضة (Low)' : 'Low'}</option>
                </select>
              </div>

              {/* Pinned Toggle */}
              <div>
                <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                  {isAr ? 'تثبيت في الذاكرة' : 'Pin to Memory'}
                </label>
                <button
                  type="button"
                  onClick={() => setFormPinned(!formPinned)}
                  className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                    formPinned
                      ? 'bg-amber-950/60 text-amber-300 border-amber-800/60 shadow-xs'
                      : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                  }`}
                >
                  <Pin className={`w-3.5 h-3.5 ${formPinned ? 'fill-amber-400' : ''}`} />
                  <span>{formPinned ? (isAr ? 'مثبتة في الأعلى' : 'Pinned') : isAr ? 'غير مثبتة' : 'Not Pinned'}</span>
                </button>
              </div>
            </div>

            {/* Tags Input */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                {isAr ? 'الوسوم والكلمات المفتاحية' : 'Tags & Keywords'}
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Tag className="absolute start-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    placeholder={
                      isAr
                        ? 'اكتب وسماً واضغط Enter (مثال: react, cloud, finance)...'
                        : 'Type tag and press Enter (e.g. react, cloud, finance)...'
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg ps-9 pe-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500"
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleAddTag}
                  disabled={!tagInput.trim()}
                >
                  {isAr ? 'إضافة وسم' : 'Add Tag'}
                </Button>
              </div>

              {/* Tag Pills */}
              {formTags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {formTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-950/40 text-violet-300 border border-violet-800/40 text-[11px] font-mono"
                    >
                      <span>#{tag}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="hover:text-rose-300 p-0.5"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Form Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800/80">
              <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
                {isAr ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button id="btn-save-knowledge" type="submit" size="sm">
                <Check className="w-4 h-4 me-1" />
                <span>
                  {editingItemId
                    ? isAr
                      ? 'حفظ التعديلات'
                      : 'Save Changes'
                    : isAr
                      ? 'إضافة إلى المعرفة'
                      : 'Save Knowledge'}
                </span>
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* 5. Main Knowledge Content Area */}
      {filteredItems.length === 0 ? (
        /* Empty State */
        <div className="p-12 text-center rounded-2xl bg-zinc-900/30 border border-zinc-800/50 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-violet-400 mx-auto shadow-md">
            <BrainCircuit className="w-6 h-6" />
          </div>

          <div className="space-y-1.5 max-w-md mx-auto">
            <h2 className="text-base font-semibold text-zinc-200">
              {items.length === 0
                ? isAr
                  ? 'تبدأ مكتبة ذكائك الشخصي من هنا'
                  : 'Your personal intelligence library starts here'
                : isAr
                  ? 'لم يتم العثور على نتائج مطابقة'
                  : 'No matching knowledge found'}
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {items.length === 0
                ? isAr
                  ? 'احفظ الأفكار، المعارف، سياق المشاريع، والمعلومات الاستراتيجية التي سيعتمد عليها NOVO في التفكير والاسترجاع.'
                  : 'Save important ideas, learning, projects, and information that NOVO can use in the future.'
                : isAr
                  ? 'جرّب تعديل كلمات البحث أو اختيار فئة وأهمية أخرى لعرض عناصر المعرفة.'
                  : 'Try adjusting your search terms or clearing category filters to find items.'}
            </p>
          </div>

          {items.length === 0 ? (
            <Button onClick={handleOpenCreate} size="sm">
              <Plus className="w-4 h-4 me-1" />
              <span>{isAr ? 'أضف أول معرفة' : 'Add your first knowledge'}</span>
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
                setSelectedImportance('all');
              }}
            >
              <RotateCcw className="w-3.5 h-3.5 me-1" />
              <span>{isAr ? 'إعادة ضبط عوامل التصفية' : 'Reset Filters'}</span>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* A. Pinned Knowledge Section */}
          {pinnedItems.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <Pin className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20" />
                <h2 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                  {isAr ? 'الذاكرة المثبتة والأولويات' : 'Pinned Strategic Memories'}
                </h2>
                <span className="text-[10px] font-mono text-zinc-500">
                  ({pinnedItems.length})
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {pinnedItems.map((item) => (
                  <KnowledgeCard
                    key={item.id}
                    item={item}
                    isAr={isAr}
                    confirmDeleteId={confirmDeleteId}
                    setConfirmDeleteId={setConfirmDeleteId}
                    onTogglePinned={() => togglePinned(item.id)}
                    onEdit={() => handleOpenEdit(item)}
                    onDelete={() => deleteKnowledge(item.id)}
                    formatRelativeTime={formatRelativeTime}
                  />
                ))}
              </div>
            </div>
          )}

          {/* B. All / Recent Knowledge Section */}
          {unpinnedItems.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-3.5 h-3.5 text-violet-400" />
                  <h2 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                    {pinnedItems.length > 0
                      ? isAr
                        ? 'باقي عناصر المعرفة'
                        : 'Knowledge Library'
                      : isAr
                        ? 'جميع عناصر المعرفة'
                        : 'All Knowledge Items'}
                  </h2>
                </div>
                <span className="text-[10px] font-mono text-zinc-500">
                  {unpinnedItems.length} {isAr ? 'عنصر' : 'items'}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {unpinnedItems.map((item) => (
                  <KnowledgeCard
                    key={item.id}
                    item={item}
                    isAr={isAr}
                    confirmDeleteId={confirmDeleteId}
                    setConfirmDeleteId={setConfirmDeleteId}
                    onTogglePinned={() => togglePinned(item.id)}
                    onEdit={() => handleOpenEdit(item)}
                    onDelete={() => deleteKnowledge(item.id)}
                    formatRelativeTime={formatRelativeTime}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Sub-component for individual Knowledge Item Card
interface KnowledgeCardProps {
  key?: string;
  item: KnowledgeItem;
  isAr: boolean;
  confirmDeleteId: string | null;
  setConfirmDeleteId: (id: string | null) => void;
  onTogglePinned: () => void;
  onEdit: () => void;
  onDelete: () => void;
  formatRelativeTime: (iso: string) => string;
}

function KnowledgeCard({
  item,
  isAr,
  confirmDeleteId,
  setConfirmDeleteId,
  onTogglePinned,
  onEdit,
  onDelete,
  formatRelativeTime,
}: KnowledgeCardProps) {
  const catConfig = CATEGORIES[item.category] || CATEGORIES.general;
  const impConfig = IMPORTANCE_CONFIG[item.importance] || IMPORTANCE_CONFIG.medium;
  const CatIcon = catConfig.icon;
  const isConfirmingDelete = confirmDeleteId === item.id;

  return (
    <Card
      id={`knowledge-card-${item.id}`}
      className={`p-4 flex flex-col justify-between transition-all duration-150 relative group ${
        item.pinned
          ? 'bg-gradient-to-b from-zinc-900/90 to-zinc-950 border-amber-500/30 hover:border-amber-500/50 shadow-xs shadow-amber-950/20'
          : 'bg-zinc-900/40 hover:bg-zinc-900/70 border-zinc-800/80 hover:border-zinc-700/80'
      }`}
    >
      <div className="space-y-2.5">
        {/* Top Badges & Card Actions */}
        <div className="flex items-center justify-between gap-2">
          {/* Category & Importance */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border ${catConfig.colorClass} ${catConfig.borderClass}`}
            >
              <CatIcon className="w-3 h-3" />
              <span>{isAr ? catConfig.labelAr : catConfig.labelEn}</span>
            </span>

            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium border ${impConfig.badgeClass}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${impConfig.dotClass}`} />
              <span>{isAr ? impConfig.labelAr : impConfig.labelEn}</span>
            </span>
          </div>

          {/* Quick Actions (Pin, Edit, Delete) */}
          <div className="flex items-center gap-1">
            <button
              onClick={onTogglePinned}
              className={`p-1 rounded-md transition-colors cursor-pointer ${
                item.pinned
                  ? 'text-amber-400 hover:text-amber-300 bg-amber-950/40 border border-amber-800/40'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
              }`}
              title={
                item.pinned
                  ? isAr
                    ? 'إلغاء التثبيت'
                    : 'Unpin memory'
                  : isAr
                    ? 'تثبيت في الذاكرة'
                    : 'Pin memory'
              }
            >
              <Pin className={`w-3.5 h-3.5 ${item.pinned ? 'fill-amber-400' : ''}`} />
            </button>

            <button
              onClick={onEdit}
              className="p-1 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
              title={isAr ? 'تعديل المعرفة' : 'Edit knowledge'}
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setConfirmDeleteId(isConfirmingDelete ? null : item.id)}
              className="p-1 rounded-md text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors cursor-pointer"
              title={isAr ? 'حذف' : 'Delete'}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Title */}
        <h3 className="text-xs sm:text-sm font-semibold text-zinc-100 leading-snug">
          {item.title}
        </h3>

        {/* Content Preview */}
        {item.content && (
          <p className="text-xs text-zinc-400 leading-relaxed line-clamp-3 whitespace-pre-wrap">
            {item.content}
          </p>
        )}

        {/* Tags */}
        {item.tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 pt-1">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.2 rounded bg-zinc-800/60 border border-zinc-700/50 text-[10px] text-zinc-400 font-mono"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Card Footer: Timestamp & Source */}
      <div className="flex items-center justify-between pt-3 mt-3 border-t border-zinc-800/60 text-[10px] text-zinc-500 font-mono">
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3 text-zinc-600" />
          <span>{formatRelativeTime(item.updatedAt)}</span>
        </div>

        {item.source && (
          <span className="px-1.5 py-0.2 rounded bg-zinc-950 text-zinc-500 border border-zinc-800">
            {item.source === 'note' ? (isAr ? 'من ملاحظة' : 'from note') : isAr ? 'يدوي' : 'manual'}
          </span>
        )}
      </div>

      {/* Lightweight Inline Delete Confirmation Overlay */}
      {isConfirmingDelete && (
        <div className="absolute inset-0 bg-zinc-950/95 backdrop-blur-xs rounded-xl p-4 flex flex-col justify-center items-center text-center space-y-3 z-10 border border-rose-500/40">
          <p className="text-xs font-medium text-zinc-200">
            {isAr ? 'تأكيد حذف عنصر المعرفة هذا نهائياً؟' : 'Permanently delete this memory item?'}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setConfirmDeleteId(null)}
              className="px-3 py-1 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-900 border border-zinc-700 cursor-pointer"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              onClick={() => {
                setConfirmDeleteId(null);
                onDelete();
              }}
              className="px-3 py-1 rounded-lg text-xs text-white bg-rose-600 hover:bg-rose-500 shadow-xs cursor-pointer font-medium"
            >
              {isAr ? 'نعم، حذف' : 'Yes, Delete'}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
