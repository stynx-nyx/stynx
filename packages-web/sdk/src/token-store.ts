import type { FrontendTokenStore, FrontendTokens } from './auth';

interface BrowserStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const safeJsonParse = (raw: string): FrontendTokens | null => {
  try {
    return JSON.parse(raw) as FrontendTokens;
  } catch {
    return null;
  }
};

export class InMemoryTokenStore implements FrontendTokenStore {
  private value: FrontendTokens | null = null;

  read(): FrontendTokens | null {
    return this.value ? { ...this.value } : null;
  }

  write(tokens: FrontendTokens): void {
    this.value = { ...tokens };
  }

  clear(): void {
    this.value = null;
  }
}

export class BrowserLocalStorageTokenStore implements FrontendTokenStore {
  constructor(
    private readonly storageKey = 'stynx.auth.tokens',
    private readonly storageProvider: BrowserStorageLike | null = (
      globalThis as { localStorage?: BrowserStorageLike | undefined }
    ).localStorage ?? null,
  ) {}

  read(): FrontendTokens | null {
    if (!this.storageProvider) {
      return null;
    }
    const raw = this.storageProvider.getItem(this.storageKey);
    if (!raw) {
      return null;
    }
    return safeJsonParse(raw);
  }

  write(tokens: FrontendTokens): void {
    if (!this.storageProvider) {
      return;
    }
    this.storageProvider.setItem(this.storageKey, JSON.stringify(tokens));
  }

  clear(): void {
    this.storageProvider?.removeItem(this.storageKey);
  }
}
