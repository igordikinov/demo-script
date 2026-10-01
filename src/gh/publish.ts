// Публикация «моего» сценария в «Общие» через GitHub API — SPEC §4.2:255 (окно
// A5.3), DN-rmz. Бэкенда по-прежнему нет (§1): статический бандл ходит в
// api.github.com прямо из браузера. Право на запись даёт fine-grained personal
// access token («Contents: Read and write», только этот репозиторий), который
// пользователь вставляет в окно переноса; хранится он в localStorage браузера
// (src/state/ghToken.ts), в бандле секретов нет — публичная страница не может
// их прятать. Файл коммитится в main: push запускает CI, деплой публикует
// сценарий в разделе «Общие».
//
// Без React и DOM: модуль импортируют и Node-скрипты (--experimental-strip-types);
// fetch передаётся параметром, как FetchFn в state/shared.ts.
import { buildScenarioBytes, exportFileName } from '../excel/export.ts';
import type { Scenario } from '../model/schema.ts';

/** Репозиторий, в который окно A5.3 отправляет файлы. */
export const GH_OWNER = 'igordikinov';
export const GH_REPO = 'demo-script';
export const GH_BRANCH = 'main';
export const GH_API = 'https://api.github.com';

/** Страница создания fine-grained токена (кнопка-ссылка окна A5.3). */
export const GH_TOKEN_CREATE_URL = 'https://github.com/settings/personal-access-tokens/new';

/** fetch с методом и телом: FetchFn из state/shared.ts иници не передаёт. */
export type GhFetch = (url: string, init?: RequestInit) => Promise<Response>;

const defaultFetch: GhFetch = (url, init) => fetch(url, init);

/** Итог публикации: успех со ссылкой на коммит либо причина отказа. */
export type PublishResult =
  | { ok: true; commitUrl: string }
  | { ok: false; error: 'auth' | 'network' | 'other'; status?: number };

/** Путь файла общего сценария в репозитории (§3.7:211). */
export function scenarioPath(fileName: string): string {
  return `scenarios/${fileName}`;
}

/**
 * Base64 без btoa/Buffer: функция работает одинаково в браузере и в Node
 * (--experimental-strip-types), без DOM- и node-*-импортов (CLAUDE.md).
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] as number;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += ALPHABET[b0 >> 2];
    out += ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? '=' : ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? '=' : ALPHABET[b2 & 0x3f];
  }
  return out;
}

function headers(token: string): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/** GET файла: 200 → sha для замены, 404 → файла ещё нет. Прочее — отказ. */
async function readSha(
  fetchFn: GhFetch,
  token: string,
  url: string,
): Promise<{ sha?: string } | PublishResult> {
  let response: Response;
  try {
    response = await fetchFn(url, { method: 'GET', headers: headers(token) });
  } catch {
    return { ok: false, error: 'network' };
  }
  if (response.status === 404) {
    return {};
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, error: 'auth', status: response.status };
  }
  if (!response.ok) {
    return { ok: false, error: 'other', status: response.status };
  }
  const body = (await response.json()) as { sha?: string };
  return { sha: body.sha };
}

/** PUT содержимого файла; `sha` задан — файл заменяется (Contents API). */
async function putFile(
  fetchFn: GhFetch,
  token: string,
  url: string,
  message: string,
  content: string,
  sha?: string,
): Promise<Response> {
  return fetchFn(url, {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify({ message, content, branch: GH_BRANCH, ...(sha ? { sha } : {}) }),
  });
}

/**
 * Коммитит книгу «моего» сценария в `scenarios/<id>.xlsx` ветки main. Файл
 * существует — заменяется (диалог предупреждает об этом заранее); параллельный
 * коммит (409) — одна повторная попытка со свежим sha. Книгу собирает
 * buildScenarioBytes — та же, что у скачивания окна A5.3.
 */
export async function publishScenario(
  scenario: Scenario,
  token: string,
  fetchFn: GhFetch = defaultFetch,
): Promise<PublishResult> {
  const fileName = exportFileName(scenario);
  const url = `${GH_API}/repos/${GH_OWNER}/${GH_REPO}/contents/${scenarioPath(fileName)}`;
  const content = bytesToBase64(await buildScenarioBytes(scenario));
  const message = `Перенос из «Моих» в «Общие»: ${scenarioPath(fileName)}`;

  const before = await readSha(fetchFn, token, url);
  if ('ok' in before) {
    return before;
  }
  try {
    let response = await putFile(fetchFn, token, url, message, content, before.sha);
    if (response.status === 409 && before.sha !== undefined) {
      // Файл успели поменять после чтения sha — перечитываем и пробуем снова.
      const fresh = await readSha(fetchFn, token, url);
      if ('ok' in fresh) {
        return fresh;
      }
      response = await putFile(fetchFn, token, url, message, content, fresh.sha);
    }
    if (response.ok) {
      const body = (await response.json()) as { commit?: { html_url?: string } };
      const commitUrl = body.commit?.html_url;
      if (commitUrl !== undefined) {
        return { ok: true, commitUrl };
      }
    }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: 'auth', status: response.status };
    }
    if (response.status === 409) {
      return { ok: false, error: 'other', status: 409 };
    }
    return { ok: false, error: 'other', status: response.status };
  } catch {
    return { ok: false, error: 'network' };
  }
}
