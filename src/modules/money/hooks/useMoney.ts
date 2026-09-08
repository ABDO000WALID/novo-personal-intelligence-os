import { useState, useEffect, useMemo, useCallback } from 'react';
import { Transaction, TransactionType } from '../../../types/data';
import { STORAGE_KEYS } from '../../../core/storage/storageKeys';
import { storageService, INITIAL_SEEDS, NOVO_STORAGE_EVENT } from '../../../core/storage/storageService';

export function useMoney() {
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    return storageService.getItem<Transaction[]>(
      STORAGE_KEYS.MONEY_ENTRIES,
      INITIAL_SEEDS.transactions()
    );
  });

  const syncTransactions = useCallback((newTransactions: Transaction[]) => {
    setTransactions(newTransactions);
    storageService.setItem(STORAGE_KEYS.MONEY_ENTRIES, newTransactions);
  }, []);

  useEffect(() => {
    const handleStorageUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ key: string }>;
      if (customEvent.detail?.key === STORAGE_KEYS.MONEY_ENTRIES) {
        const updated = storageService.getItem<Transaction[]>(STORAGE_KEYS.MONEY_ENTRIES, []);
        setTransactions(updated);
      }
    };

    window.addEventListener(NOVO_STORAGE_EVENT, handleStorageUpdate);
    return () => {
      window.removeEventListener(NOVO_STORAGE_EVENT, handleStorageUpdate);
    };
  }, []);

  const addTransaction = useCallback(
    (type: TransactionType, amount: number, category: string, description: string) => {
      const newTx: Transaction = {
        id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        type,
        amount: Math.abs(amount),
        category: category.trim() || (type === 'income' ? 'دخل عام' : 'مصروف عام'),
        description: description.trim(),
        createdAt: new Date().toISOString(),
      };
      const updated = [newTx, ...transactions];
      syncTransactions(updated);
      return newTx;
    },
    [transactions, syncTransactions]
  );

  const deleteTransaction = useCallback(
    (id: string) => {
      const updated = transactions.filter((t) => t.id !== id);
      syncTransactions(updated);
    },
    [transactions, syncTransactions]
  );

  const totals = useMemo(() => {
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
  }, [transactions]);

  return {
    transactions,
    totals,
    addTransaction,
    deleteTransaction,
  };
}
