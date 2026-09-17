// @vitest-environment node
// SPEC §3.1 (:67-102): ScenarioSchema/BlockSchema/StepSchema — единая схема
// zod для сценария из Excel и из localStorage. Тест гоняем в Node, т.к.
// схема — чистые данные без DOM.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ScenarioSchema } from '../src/model/schema';

// Эталон содержания — tests/fixtures/deployment-demo.json (CLAUDE.md: не
// придумывать содержание сценария). В фикстуре нет schema/id/source/fileName/
// loadedAt/blocks[].n/blocks[].sheet — их проставляет тот, кто сохраняет
// (SPEC:100), поэтому валидный сценарий дополняем этими полями сами (план DN-03, §A2).
const fixturePath = fileURLToPath(new URL('./fixtures/deployment-demo.json', import.meta.url));
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
  title: string;
  module: string;
  map: string;
  blocks: { title: string; steps: Record<string, unknown>[] }[];
};

function validScenario(): Record<string, unknown> {
  // Глубокая копия, чтобы тесты не делили мутируемое состояние.
  const clone = JSON.parse(JSON.stringify(fixture)) as typeof fixture;
  return {
    schema: 1,
    id: 'deployment-demo',
    source: 'repo',
    title: clone.title,
    module: clone.module,
    map: clone.map,
    fileName: 'deployment-demo.xlsx',
    loadedAt: '2026-09-16T00:00:00Z',
    blocks: clone.blocks.map((b, i) => ({
      n: i + 1,
      title: b.title,
      sheet: `Блок ${i + 1}`,
      steps: b.steps,
    })),
  };
}

describe('ScenarioSchema: валидный сценарий', () => {
  it('проходит целиком', () => {
    expect(ScenarioSchema.safeParse(validScenario()).success).toBe(true);
  });

  it('id шага "1.10" остаётся строкой (SPEC:71, :137)', () => {
    const parsed = ScenarioSchema.parse(validScenario());
    const id = parsed.blocks[0]?.steps[9]?.id;
    expect(typeof id).toBe('string');
    expect(id).toBe('1.10');
  });

  it('"мой" id с префиксом my- проходит (SPEC:89)', () => {
    const scenario = { ...validScenario(), id: 'my-deployment-demo' };
    expect(ScenarioSchema.safeParse(scenario).success).toBe(true);
  });
});

describe('ScenarioSchema: отклоняет неверные данные', () => {
  it('пустой steps в блоке', () => {
    const scenario = validScenario();
    const blocks = scenario['blocks'] as Record<string, unknown>[];
    const first = blocks[0] as Record<string, unknown>;
    scenario['blocks'] = [{ ...first, steps: [] }];
    expect(ScenarioSchema.safeParse(scenario).success).toBe(false);
  });

  it('пустой blocks сценария', () => {
    const scenario = { ...validScenario(), blocks: [] };
    expect(ScenarioSchema.safeParse(scenario).success).toBe(false);
  });

  it.each(['remote', 'local repo', ''])('неверный source: %s', (source) => {
    const scenario = { ...validScenario(), source };
    expect(ScenarioSchema.safeParse(scenario).success).toBe(false);
  });

  it.each(['xyz', 'SNP', ''])('неверный map: %s', (map) => {
    const scenario = { ...validScenario(), map };
    expect(ScenarioSchema.safeParse(scenario).success).toBe(false);
  });

  it('schema !== 1', () => {
    const scenario = { ...validScenario(), schema: 2 };
    expect(ScenarioSchema.safeParse(scenario).success).toBe(false);
  });

  it.each(['Demo', 'demo 1', 'my_x'])('id не проходит regex: %s', (id) => {
    const scenario = { ...validScenario(), id };
    expect(ScenarioSchema.safeParse(scenario).success).toBe(false);
  });

  it.each([0, 1.5])('n блока не positive int: %s', (n) => {
    const scenario = validScenario();
    const blocks = scenario['blocks'] as Record<string, unknown>[];
    const first = blocks[0] as Record<string, unknown>;
    scenario['blocks'] = [{ ...first, n }, ...blocks.slice(1)];
    expect(ScenarioSchema.safeParse(scenario).success).toBe(false);
  });

  it('пустой title шага', () => {
    const scenario = validScenario();
    const blocks = scenario['blocks'] as Record<string, unknown>[];
    const first = blocks[0] as Record<string, unknown>;
    const steps = first['steps'] as Record<string, unknown>[];
    const firstStep = steps[0] as Record<string, unknown>;
    const patchedSteps = [{ ...firstStep, title: '' }, ...steps.slice(1)];
    scenario['blocks'] = [{ ...first, steps: patchedSteps }, ...blocks.slice(1)];
    expect(ScenarioSchema.safeParse(scenario).success).toBe(false);
  });

  it('шаг без comment — поле undefined, а не пустая строка (SPEC:102)', () => {
    const scenario = validScenario();
    const blocks = scenario['blocks'] as Record<string, unknown>[];
    const first = blocks[0] as Record<string, unknown>;
    const steps = first['steps'] as Record<string, unknown>[];
    const firstStep = { ...(steps[0] as Record<string, unknown>) };
    delete firstStep['comment'];
    const patchedSteps = [firstStep, ...steps.slice(1)];
    scenario['blocks'] = [{ ...first, steps: patchedSteps }, ...blocks.slice(1)];
    expect(ScenarioSchema.safeParse(scenario).success).toBe(false);
  });
});
