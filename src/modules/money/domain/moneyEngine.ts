import { Transaction } from '../../../types/data';

export function calculateFinancialSummary(transactions: Transaction[]) {
  let totalIncome = 0;
  let totalExpenses = 0;
  
  for (const t of transactions) {
    if (t.type === 'income') {
      totalIncome += t.amount;
    } else {
      totalExpenses += t.amount;
    }
  }
  
  const balance = totalIncome - totalExpenses;
  
  return {
    totalIncome,
    totalExpenses,
    balance,
  };
}
