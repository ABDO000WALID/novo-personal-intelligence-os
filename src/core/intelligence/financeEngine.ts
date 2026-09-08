import { Transaction } from '../../types/data';
import { FinanceSummary, ExpenseCategoryBreakdown } from './intelligenceTypes';
import { isWithinDays } from './dateUtils';

/**
 * Deterministic Financial Analysis Engine
 * Calculates net cash flow, categorical expense distribution, and recent expenditure trends.
 * Note: Strictly for personal organization and budgeting awareness.
 */
export function analyzeFinance(transactions: Transaction[], now: Date = new Date()): FinanceSummary {
  let totalIncome = 0;
  let totalExpenses = 0;
  let recentSpending = 0;
  let recentTransactionCount = 0;
  const categoryExpensesMap: Record<string, number> = {};

  for (const tx of transactions) {
    const amount = Number(tx.amount) || 0;
    const isRecent = isWithinDays(tx.createdAt, 7, now);

    if (isRecent) {
      recentTransactionCount++;
    }

    if (tx.type === 'income') {
      totalIncome += amount;
    } else if (tx.type === 'expense') {
      totalExpenses += amount;
      if (isRecent) {
        recentSpending += amount;
      }
      const cat = tx.category ? tx.category.trim() : 'General';
      categoryExpensesMap[cat] = (categoryExpensesMap[cat] || 0) + amount;
    }
  }

  const currentBalance = totalIncome - totalExpenses;

  // Build category breakdown
  const expensesByCategory: ExpenseCategoryBreakdown[] = Object.entries(categoryExpensesMap)
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: totalExpenses > 0 ? Math.round((amount / totalExpenses) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const largestExpenseCategory =
    expensesByCategory.length > 0 ? expensesByCategory[0].category : null;

  return {
    totalIncome,
    totalExpenses,
    currentBalance,
    recentSpending,
    expensesByCategory,
    largestExpenseCategory,
    recentTransactionCount,
  };
}
