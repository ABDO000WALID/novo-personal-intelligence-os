import { AuthLifecycle } from '../auth/authLifecycle';
import { create } from 'zustand';
import { Transaction } from '../../types/data';
import { RepositoryFactory } from '../data/RepositoryFactory';

interface MoneyState {
  transactions: Transaction[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  lastUpdated: string | null;
  initialize: () => Promise<void>;
  createTransaction: (tx: Omit<Transaction, 'id' | 'createdAt'>) => Promise<Transaction>;
  updateTransaction: (id: string, updates: Partial<Omit<Transaction, 'id' | 'createdAt'>>) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  clearState: () => void;
}

let initializationPromise: Promise<void> | null = null;

export const useMoneyStore = create<MoneyState>((set, get) => ({
  transactions: [],
  status: 'idle',
  error: null,
  lastUpdated: null,
  clearState: () => {
    initializationPromise = null;
    set({
      transactions: [],
      status: 'idle',
      error: null,
      lastUpdated: null
    });
  },

  initialize: async () => {
    const authGuard = AuthLifecycle.createGuard();
    const { status } = get();
    if (status === 'ready') return;

    if (initializationPromise) {
      return initializationPromise;
    }

    set({ status: 'loading', error: null });

    initializationPromise = (async () => {
      try {
        const transactions = await RepositoryFactory.getMoneyRepository().getAll();
        if (authGuard.isStale()) return;
        set({
          transactions,
          status: 'ready',
          error: null,
          lastUpdated: new Date().toISOString()
        });
      } catch (err) {
        if (authGuard.isStale()) return;
        set({ error: (err as Error).message, status: 'error' });
        throw err;
      } finally {
        initializationPromise = null;
      }
    })();

    return initializationPromise;
  },

  createTransaction: async (txData) => {
    const authGuard = AuthLifecycle.createGuard();
    const newTx: Transaction = {
      id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type: txData.type,
      amount: Math.abs(txData.amount),
      category: txData.category.trim() || (txData.type === 'income' ? 'دخل عام' : 'مصروف عام'),
      description: txData.description.trim(),
      createdAt: new Date().toISOString(),
    };

    set(state => ({
      transactions: [newTx, ...state.transactions],
      lastUpdated: new Date().toISOString(),
    }));

    try {
      await RepositoryFactory.getMoneyRepository().create(newTx);
    } catch (err) {
      console.error('[MoneyStore] Failed to persist new transaction', err);
      if (authGuard.isStale()) return;
      // Targeted rollback
      set(state => ({
        transactions: state.transactions.filter(tx => tx.id !== newTx.id),
      }));
      throw err;
    }

    return newTx;
  },

  updateTransaction: async (id, updates) => {
    const authGuard = AuthLifecycle.createGuard();
    const originalTx = get().transactions.find(tx => tx.id === id);
    if (!originalTx) return;

    const updatedTx = { ...originalTx, ...updates };

    set(state => ({
      transactions: state.transactions.map(tx => tx.id === id ? updatedTx : tx),
      lastUpdated: new Date().toISOString(),
    }));

    try {
      await RepositoryFactory.getMoneyRepository().update(id, updatedTx);
    } catch (err) {
      console.error('[MoneyStore] Failed to update transaction', err);
      if (authGuard.isStale()) return;
      // Targeted rollback: check if the object reference is still what we created optimistically
      set(state => {
        const currentTx = state.transactions.find(tx => tx.id === id);
        if (currentTx === updatedTx) {
          return {
            transactions: state.transactions.map(tx => tx.id === id ? originalTx : tx),
          };
        }
        return state;
      });
      throw err;
    }
  },

  deleteTransaction: async (id) => {
    const authGuard = AuthLifecycle.createGuard();
    const originalTx = get().transactions.find(tx => tx.id === id);
    if (!originalTx) return;

    const originalIndex = get().transactions.findIndex(tx => tx.id === id);

    set(state => ({
      transactions: state.transactions.filter(tx => tx.id !== id),
      lastUpdated: new Date().toISOString(),
    }));

    try {
      await RepositoryFactory.getMoneyRepository().delete(id);
    } catch (err) {
      console.error('[MoneyStore] Failed to delete transaction', err);
      if (authGuard.isStale()) return;
      // Targeted rollback
      set(state => {
        if (state.transactions.some(tx => tx.id === id)) {
           return state;
        }
        const restored = [...state.transactions];
        restored.splice(originalIndex, 0, originalTx);
        return { transactions: restored };
      });
      throw err;
    }
  }
}));
