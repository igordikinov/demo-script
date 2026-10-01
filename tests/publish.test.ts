// @vitest-environment node
// Отправка книги в репозиторий через GitHub API — SPEC §4.2:255 (окно A5.3),
// ТК 35 (SPEC §8:431), DN-rmz. fetch подменяется функцией со списком ответов:
// последовательность GET sha → PUT (409 → повторный GET → PUT) сверяется
// вызовами. Node 18+ даёт Response глобально, как и браузер.
import { bytesToBase64, publishScenario, scenarioPath } from '../src/gh/publish';
import type { GhFetch } from '../src/gh/publish';
import { ScenarioSchema, type Scenario } from '../src/model/schema';
import fixtureJson from './fixtures/deployment-demo.json';

const fixture = fixtureJson as {
  title: string;
  module: string;
  map: string;
  blocks: { title: string; steps: Record<string, unknown>[] }[];
};

/** Копия приёма tests/reducer.test.ts:36-52 — общий хелпер не заводим. */
function buildMine(id: string): Scenario {
  const clone = JSON.parse(JSON.stringify(fixture)) as typeof fixture;
  return ScenarioSchema.parse({
    schema: 1,
    id,
    source: 'local',
    title: clone.title,
    module: clone.module,
    map: clone.map,
    fileName: 'Deployment_demo_v2.xlsx',
    loadedAt: '2026-09-18T10:42:00.000Z',
    blocks: clone.blocks.map((b, i) => ({
      n: i + 1,
      title: b.title,
      sheet: `Блок ${i + 1}`,
      steps: b.steps,
    })),
  });
}

const URL_ =
  'https://api.github.com/repos/igordikinov/demo-script/contents/scenarios/deployment-demo.xlsx';

/** Ответ GitHub с JSON-телом. */
function ghResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

interface Recorded {
  method: string;
  url: string;
  auth: string | null;
  body: Record<string, unknown> | null;
}

/** fetchFn, отвечающий по сценарию и запоминающий каждый вызов. */
function scripted(responses: Response[]): { fetchFn: GhFetch; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const fetchFn: GhFetch = async (url, init) => {
    const response = responses.shift();
    if (response === undefined) {
      throw new Error(`непредвиденный вызов: ${String(init?.method)} ${url}`);
    }
    calls.push({
      method: String(init?.method ?? 'GET'),
      url,
      auth: new Headers(init?.headers).get('Authorization'),
      body:
        init?.body === undefined
          ? null
          : (JSON.parse(String(init.body)) as Record<string, unknown>),
    });
    return response;
  };
  return { fetchFn, calls };
}

describe('bytesToBase64 (SPEC §4.2:255, ТК 35): без btoa и Buffer', () => {
  const CASES: readonly (readonly [readonly number[], string])[] = [
    [[], ''],
    [[104, 105], 'aGk='],
    [[102, 111, 111], 'Zm9v'],
    [[1, 2, 3, 4], 'AQIDBA=='],
  ];

  it.each(CASES)('%j → %s', (bytes, expected) => {
    expect(bytesToBase64(new Uint8Array(bytes))).toBe(expected);
  });

  it('случайные байты совпадают с Buffer.toString("base64")', () => {
    const bytes = new Uint8Array(1024).map(() => Math.floor(Math.random() * 256));
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });
});

describe('publishScenario (SPEC §4.2:255, ТК 35)', () => {
  it('файла нет (404) → PUT без sha; успех — commitUrl', async () => {
    const { fetchFn, calls } = scripted([
      ghResponse(404, { message: 'Not Found' }),
      ghResponse(201, {
        commit: { html_url: 'https://github.com/igordikinov/demo-script/commit/abc' },
      }),
    ]);

    const result = await publishScenario(buildMine('my-deployment-demo'), 'github_pat_x', fetchFn);

    expect(result).toEqual({
      ok: true,
      commitUrl: 'https://github.com/igordikinov/demo-script/commit/abc',
    });
    expect(calls.map((c) => c.method)).toEqual(['GET', 'PUT']);
    expect(calls[0]?.url).toBe(URL_);
    expect(calls[0]?.auth).toBe('Bearer github_pat_x');
    const put = calls[1]?.body;
    expect(put?.branch).toBe('main');
    expect(put?.sha).toBeUndefined();
    expect(put?.message).toBe(
      `Перенос из «Моих» в «Общие»: ${scenarioPath('deployment-demo.xlsx')}`,
    );
    // content — base64 той же книги, что скачивает окно (buildScenarioBytes).
    expect(typeof put?.content).toBe('string');
  });

  it('файл есть (200) → PUT с его sha — замена существующего общего', async () => {
    const { fetchFn, calls } = scripted([
      ghResponse(200, { sha: 'sha-1' }),
      ghResponse(200, { commit: { html_url: 'https://github.com/c2' } }),
    ]);

    const result = await publishScenario(buildMine('my-deployment-demo'), 't', fetchFn);

    expect(result).toEqual({ ok: true, commitUrl: 'https://github.com/c2' });
    expect(calls[1]?.body?.sha).toBe('sha-1');
  });

  it('409 на PUT → повторный GET sha и второй PUT со свежим sha', async () => {
    const { fetchFn, calls } = scripted([
      ghResponse(200, { sha: 'old' }),
      ghResponse(409, { message: 'conflict' }),
      ghResponse(200, { sha: 'fresh' }),
      ghResponse(200, { commit: { html_url: 'https://github.com/c3' } }),
    ]);

    const result = await publishScenario(buildMine('my-deployment-demo'), 't', fetchFn);

    expect(result).toEqual({ ok: true, commitUrl: 'https://github.com/c3' });
    expect(calls.map((c) => c.method)).toEqual(['GET', 'PUT', 'GET', 'PUT']);
    expect(calls[3]?.body?.sha).toBe('fresh');
  });

  it('401 на GET → отказ auth, PUT не отправляется; токен сбрасывается окном', async () => {
    const { fetchFn, calls } = scripted([ghResponse(401, { message: 'Bad credentials' })]);

    const result = await publishScenario(buildMine('my-deployment-demo'), 'bad', fetchFn);

    expect(result).toEqual({ ok: false, error: 'auth', status: 401 });
    expect(calls.map((c) => c.method)).toEqual(['GET']);
  });

  it('403 на PUT → auth', async () => {
    const { fetchFn } = scripted([ghResponse(404, {}), ghResponse(403, { message: 'no write' })]);

    const result = await publishScenario(buildMine('my-deployment-demo'), 't', fetchFn);

    expect(result).toEqual({ ok: false, error: 'auth', status: 403 });
  });

  it('fetch бросился → network', async () => {
    const fetchFn: GhFetch = async () => {
      throw new TypeError('Failed to fetch');
    };

    const result = await publishScenario(buildMine('my-deployment-demo'), 't', fetchFn);

    expect(result).toEqual({ ok: false, error: 'network' });
  });

  it('500 на PUT → other', async () => {
    const { fetchFn } = scripted([ghResponse(404, {}), ghResponse(500, { message: 'oops' })]);

    const result = await publishScenario(buildMine('my-deployment-demo'), 't', fetchFn);

    expect(result).toEqual({ ok: false, error: 'other', status: 500 });
  });
});
