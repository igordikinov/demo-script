// GitHub-токен окна «Перенести в общие» — SPEC §4.2:255 (A5.3), ТК 35
// (SPEC §8:431), DN-rmz. Ключ отдельный от библиотеки «Моих» (§3.6:201);
// доступ к хранилищу в try/catch (§3.6:206). Память вместо localStorage —
// приём tests/library.test.ts.
import { clearGhToken, GH_TOKEN_KEY, readGhToken, writeGhToken } from '../src/state/ghToken';
import type { LibraryStorage } from '../src/state/library';

function memoryStorage(): { storage: LibraryStorage; raw: () => string | null } {
  let value: string | null = null;
  return {
    storage: {
      getItem: () => value,
      setItem: (_key, v) => {
        value = v;
      },
      removeItem: () => {
        value = null;
      },
    },
    raw: () => value,
  };
}

/** Хранилище, бросающее на любом обращении (iframe с sandbox, §3.6:206). */
function throwingStorage(): LibraryStorage {
  return {
    getItem: () => {
      throw new DOMException('denied', 'SecurityError');
    },
    setItem: () => {
      throw new DOMException('denied', 'SecurityError');
    },
    removeItem: () => {
      throw new DOMException('denied', 'SecurityError');
    },
  };
}

describe('ghToken (SPEC §4.2:255, ТК 35): localStorage demo-navigator:github-token:v1', () => {
  it('write → read возвращает токен; clear → null', () => {
    const { storage } = memoryStorage();
    expect(readGhToken(storage)).toBeNull();

    expect(writeGhToken(storage, 'github_pat_x')).toBe(true);
    expect(readGhToken(storage)).toBe('github_pat_x');

    clearGhToken(storage);
    expect(readGhToken(storage)).toBeNull();
  });

  it('недоступное хранилище: read → null, write → false, clear не бросает', () => {
    const storage = throwingStorage();
    expect(readGhToken(storage)).toBeNull();
    expect(writeGhToken(storage, 't')).toBe(false);
    expect(() => clearGhToken(storage)).not.toThrow();
  });

  it('null вместо хранилища: read → null, write → false', () => {
    expect(readGhToken(null)).toBeNull();
    expect(writeGhToken(null, 't')).toBe(false);
    expect(() => clearGhToken(null)).not.toThrow();
  });

  it('ключ — GH_TOKEN_KEY, не ключ библиотеки «Моих» (§3.6:201)', () => {
    expect(GH_TOKEN_KEY).toBe('demo-navigator:github-token:v1');
  });
});
