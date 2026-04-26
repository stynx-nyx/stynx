interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface CookieOptions {
  name?: string;
  path?: string;
  sameSite?: 'Strict' | 'Lax' | 'None';
  secure?: boolean;
}

type RefreshTokenStorageMode = 'session-storage' | 'cookie';

function resolveDocument(): Document | null {
  return typeof document === 'undefined' ? null : document;
}

export class RefreshTokenStorage {
  private readonly storage: SessionStorageLike | null;
  private readonly cookie: CookieOptions;

  constructor(
    private readonly key: string,
    private readonly mode: RefreshTokenStorageMode = 'session-storage',
    storage: SessionStorageLike | null = typeof sessionStorage === 'undefined' ? null : sessionStorage,
    private readonly browserDocument: Document | null = resolveDocument(),
    cookie: CookieOptions = {},
  ) {
    this.storage = this.mode === 'session-storage' ? storage : null;
    this.cookie = {
      name: cookie.name ?? key,
      path: cookie.path ?? '/',
      sameSite: cookie.sameSite ?? 'Lax',
      secure: cookie.secure ?? true,
    };
  }

  read(): string | null {
    if (this.mode === 'cookie') {
      return this.readCookie();
    }
    return this.storage?.getItem(this.key) ?? null;
  }

  write(token: string | null): void {
    if (this.mode === 'cookie') {
      this.writeCookie(token);
      return;
    }
    if (!this.storage) {
      return;
    }
    if (!token) {
      this.storage.removeItem(this.key);
      return;
    }
    this.storage.setItem(this.key, token);
  }

  clear(): void {
    if (this.mode === 'cookie') {
      this.writeCookie(null);
      return;
    }
    this.storage?.removeItem(this.key);
  }

  private readCookie(): string | null {
    const cookieSource = this.browserDocument?.cookie ?? '';
    const prefix = `${encodeURIComponent(this.cookie.name ?? this.key)}=`;
    for (const rawEntry of cookieSource.split(';')) {
      const entry = rawEntry.trim();
      if (entry.startsWith(prefix)) {
        return decodeURIComponent(entry.slice(prefix.length));
      }
    }
    return null;
  }

  private writeCookie(token: string | null): void {
    if (!this.browserDocument) {
      return;
    }
    const name = encodeURIComponent(this.cookie.name ?? this.key);
    if (!token) {
      this.browserDocument.cookie = `${name}=; Max-Age=0; Path=${this.cookie.path}`;
      return;
    }

    const directives = [
      `${name}=${encodeURIComponent(token)}`,
      `Path=${this.cookie.path}`,
      `SameSite=${this.cookie.sameSite}`,
    ];
    if (this.cookie.secure) {
      directives.push('Secure');
    }
    this.browserDocument.cookie = directives.join('; ');
  }
}
