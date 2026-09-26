export class AuthLifecycle {
  private static epoch = 0;
  private static currentUid: string | null = null;
  private static listeners: Array<() => void> = [];

  static getEpoch() {
    return this.epoch;
  }

  static getUid(): string | null {
    return this.currentUid;
  }

  /**
   * Registers a callback to be notified when the auth context resets (e.g. sign-out).
   * This is part of the client-side termination contract.
   */
  static onReset(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Simulates a context/identity change (e.g. login/logout).
   * Increments the epoch, invalidating all previously created guards.
   */
  static reset(uid: string | null = null) {
    this.epoch++;
    this.currentUid = uid;
    
    // Notify listeners (e.g. Live Session termination)
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error('AuthLifecycle onReset listener failed:', err);
      }
    }
  }

  /**
   * Creates a guard bound to the current auth context epoch.
   * Use this to prevent stale async operations from mutating state.
   */
  static createGuard() {
    const capturedEpoch = this.epoch;
    return {
      isStale: () => this.epoch !== capturedEpoch
    };
  }
}
