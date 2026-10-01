// GitHub-токен окна «Перенести в общие» — SPEC §4.2:255 (A5.3), DN-rmz.
// Fine-grained PAT («Contents: Read and write», только этот репозиторий) лежит
// в localStorage браузера пользователя, который переносит сценарий; в бандле
// секретов нет. Ключ отдельный от библиотеки «Моих» (§3.6:201), доступ — как
// везде, в try/catch (§3.6:206: iframe с sandbox бросает на доступе к
// window.localStorage). Чистые функции без React: хранилище передаётся
// параметром (LibraryStorage), тесты подменяют его памятью.
import type { LibraryStorage } from './library.ts';

/** Ключ localStorage (SPEC §4.2:255). */
export const GH_TOKEN_KEY = 'demo-navigator:github-token:v1';

/** Токен или `null` — ключа нет или хранилище недоступно. Не бросает. */
export function readGhToken(storage: LibraryStorage | null): string | null {
  if (storage === null) {
    return null;
  }
  try {
    return storage.getItem(GH_TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Запоминает токен после успешной публикации. `false` — хранилище недоступно
 * (iframe без allow-same-origin): поле ввода продолжает работать, токен просто
 * не переживёт перезагрузку.
 */
export function writeGhToken(storage: LibraryStorage | null, token: string): boolean {
  if (storage === null) {
    return false;
  }
  try {
    storage.setItem(GH_TOKEN_KEY, token);
    return true;
  } catch {
    return false;
  }
}

/** «Забыть токен» и неудачная авторизация: ключ удаляется. Не бросает. */
export function clearGhToken(storage: LibraryStorage | null): void {
  if (storage === null) {
    return;
  }
  try {
    storage.removeItem(GH_TOKEN_KEY);
  } catch {
    // Недоступное хранилище — ключа в нём и так нет.
  }
}
