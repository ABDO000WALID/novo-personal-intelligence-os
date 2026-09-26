import { useState, useMemo, useEffect, FormEvent } from 'react';
import { useApp } from '../../core/providers/AppContext';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useMoneyStore } from '../../core/state/moneyStore';
import { calculateFinancialSummary } from './domain/moneyEngine';
import { TransactionType } from '../../types/data';
import {
  Wallet,
  ArrowDownRight,
  ArrowUpRight,
  Plus,
  Trash2,
  PieChart,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';

export function MoneyView() {
  const { language } = useApp();
  const isAr = language === 'ar';
  const status = useMoneyStore(state => state.status);
  const initialize = useMoneyStore(state => state.initialize);
  const transactions = useMoneyStore(state => state.transactions);
  const createTransaction = useMoneyStore(state => state.createTransaction);
  const deleteTransaction = useMoneyStore(state => state.deleteTransaction);
  
  useEffect(() => {
    if (status === 'idle') {
      initialize();
    }
  }, [status, initialize]);

  const totals = useMemo(() => calculateFinancialSummary(transactions), [transactions]);

  const [isAdding, setIsAdding] = useState(false);
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) return;

    createTransaction({ type, amount: numAmount, category, description });
    setAmount('');
    setCategory('');
    setDescription('');
    setIsAdding(false);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat(isAr ? 'ar-SA' : 'en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    }).format(val);
  };

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString(isAr ? 'ar-SA' : 'en-US', {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  };

  const categories = {
    expense: isAr
      ? ['مصاريف يومية', 'اشتراكات وخدمات', 'تعليم وكتب', 'صحة ورياضة', 'تقنية ومعدات', 'أخرى']
      : ['Daily Living', 'Subscriptions', 'Education', 'Health', 'Tech & Tools', 'Other'],
    income: isAr
      ? ['راتب شهري', 'عمل حر واستشارات', 'عوائد استثمار', 'مكافآت', 'أخرى']
      : ['Salary', 'Freelance & Consulting', 'Returns', 'Bonus', 'Other'],
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-600/20 to-emerald-900/10 border border-emerald-500/30 text-emerald-400 shadow-sm shadow-emerald-950/40">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-zinc-100">
                {isAr ? 'المركز المالي الشخصي' : 'Personal Financial Hub'}
              </h1>
              <Badge variant="violet" className="text-[10px] py-0 px-2">
                {isAr ? 'تتبع محلي خاص' : 'Private Local Log'}
              </Badge>
            </div>
            <p className="text-xs text-zinc-400">
              {isAr
                ? 'متابعة الدخل والمصاريف، حساب الرصيد الصافي، وحفظ السجلات محلياً'
                : 'Track income & expenses, calculate net balance, and store records locally'}
            </p>
          </div>
        </div>

        <Button
          onClick={() => setIsAdding(true)}
          size="sm"
          className="flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>{isAr ? 'حركة مالية جديدة' : 'New Transaction'}</span>
        </Button>
      </div>

      {/* KPI Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Net Balance */}
        <Card className="p-5 space-y-1 bg-gradient-to-b from-zinc-900 to-zinc-950 border-zinc-800/80 shadow-sm">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>{isAr ? 'الرصيد الصافي' : 'Net Balance'}</span>
            <Wallet className="w-4 h-4 text-zinc-500" />
          </div>
          <div
            className={`text-2xl font-semibold font-mono tracking-tight ${
              totals.balance >= 0 ? 'text-zinc-100' : 'text-rose-400'
            }`}
          >
            {formatCurrency(totals.balance)}
          </div>
          <p className="text-[11px] text-zinc-500">
            {isAr ? 'إجمالي الفرق بين الدخل والمصروفات' : 'Total net difference (Income - Expenses)'}
          </p>
        </Card>

        {/* Total Income */}
        <Card className="p-5 space-y-1 bg-gradient-to-b from-zinc-900 to-zinc-950 border-zinc-800/80 shadow-sm">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>{isAr ? 'إجمالي المداخيل' : 'Total Income'}</span>
            <div className="p-1 rounded bg-emerald-950/50 text-emerald-400">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-semibold font-mono text-emerald-400 tracking-tight">
            {formatCurrency(totals.totalIncome)}
          </div>
          <p className="text-[11px] text-zinc-500">
            {isAr ? 'المداخيل المسجلة محلياً' : 'Total recorded inflow'}
          </p>
        </Card>

        {/* Total Expenses */}
        <Card className="p-5 space-y-1 bg-gradient-to-b from-zinc-900 to-zinc-950 border-zinc-800/80 shadow-sm">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>{isAr ? 'إجمالي المصروفات' : 'Total Expenses'}</span>
            <div className="p-1 rounded bg-rose-950/50 text-rose-400">
              <TrendingDown className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-semibold font-mono text-rose-400 tracking-tight">
            {formatCurrency(totals.totalExpenses)}
          </div>
          <p className="text-[11px] text-zinc-500">
            {isAr ? 'المصروفات المسجلة محلياً' : 'Total recorded outflow'}
          </p>
        </Card>
      </div>

      {/* Add Transaction Form Modal / Card */}
      {isAdding && (
        <Card className="p-5 border-violet-500/40 bg-zinc-900/95 shadow-xl shadow-black/60 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <h3 className="text-xs font-semibold text-zinc-200">
              {isAr ? 'إضافة حركة مالية' : 'Add Financial Entry'}
            </h3>
            <button
              onClick={() => setIsAdding(false)}
              className="p-1 rounded text-zinc-500 hover:text-zinc-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleAdd} className="space-y-3">
            {/* Income / Expense Toggle */}
            <div className="flex items-center gap-2 p-1 bg-zinc-950 rounded-xl border border-zinc-800 w-full sm:w-64">
              <button
                type="button"
                onClick={() => {
                  setType('expense');
                  setCategory('');
                }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  type === 'expense'
                    ? 'bg-rose-950/80 text-rose-300 border border-rose-800/50 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {isAr ? 'مصروف (-)' : 'Expense (-)'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setType('income');
                  setCategory('');
                }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  type === 'income'
                    ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/50 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {isAr ? 'دخل (+)' : 'Income (+)'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">
                  {isAr ? 'المبلغ ($)' : 'Amount ($)'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  autoFocus
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">
                  {isAr ? 'التصنيف' : 'Category'}
                </label>
                <input
                  type="text"
                  list="category-suggestions"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder={isAr ? 'اختر أو اكتب تصنيفاً...' : 'Select or type category...'}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500"
                />
                <datalist id="category-suggestions">
                  {categories[type].map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">
                {isAr ? 'الوصف / ملاحظة' : 'Description / Note'}
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={isAr ? 'تفاصيل إضافية عن الحركة...' : 'Additional transaction note...'}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsAdding(false)}
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button type="submit" size="sm">
                {isAr ? 'إضافة الحركة' : 'Add Entry'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Transactions History List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
            <PieChart className="w-4 h-4 text-violet-400" />
            <span>{isAr ? 'سجل المعاملات والتدفقات' : 'Transaction History'}</span>
          </h2>
          <span className="text-[11px] text-zinc-500 font-mono">
            {transactions.length} {isAr ? 'عملية' : 'entries'}
          </span>
        </div>

        {transactions.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-zinc-900/30 border border-zinc-800/40 space-y-2">
            <Wallet className="w-8 h-8 text-zinc-600 mx-auto" />
            <p className="text-xs text-zinc-400">
              {isAr
                ? 'لا توجد حركات مسجلة حالياً. أضف دخلاً أو مصروفاً لبدء التتبع!'
                : 'No recorded transactions yet. Add income or expense to begin!'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700/60 transition-all text-xs"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-lg border ${
                      t.type === 'income'
                        ? 'bg-emerald-950/50 border-emerald-800/40 text-emerald-400'
                        : 'bg-rose-950/50 border-rose-800/40 text-rose-400'
                    }`}
                  >
                    {t.type === 'income' ? (
                      <ArrowDownRight className="w-4 h-4" />
                    ) : (
                      <ArrowUpRight className="w-4 h-4" />
                    )}
                  </div>

                  <div>
                    <div className="font-medium text-zinc-200">
                      {t.category}
                    </div>
                    {t.description && (
                      <div className="text-[11px] text-zinc-500">
                        {t.description}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className="text-[10px] text-zinc-500 font-mono hidden sm:inline-block">
                    {formatDate(t.createdAt)}
                  </span>

                  <span
                    className={`font-mono font-semibold text-xs md:text-sm ${
                      t.type === 'income' ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {t.type === 'income' ? '+' : '-'}
                    {formatCurrency(t.amount)}
                  </span>

                  <button
                    onClick={() => deleteTransaction(t.id)}
                    className="p-1 rounded text-zinc-600 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
                    title={isAr ? 'حذف المعاملة' : 'Delete transaction'}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quiet Privacy Note */}
      <Card variant="subtle" className="p-3.5 flex items-center gap-3">
        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
        <p className="text-xs text-zinc-400">
          {isAr
            ? 'البيانات المالية محفوظة فقط في المتصفح المحلي (localStorage) ولا يتم إرسالها إلى أي خادم خارجي.'
            : 'Financial data is securely stored only in local storage and is never transmitted to external servers.'}
        </p>
      </Card>
    </div>
  );
}
