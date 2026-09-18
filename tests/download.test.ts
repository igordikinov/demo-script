// Скачивание из окна загрузки — src/components/ui/download.ts (для DN-24:
// пустые «Мои» тоже скачивают шаблон). SPEC §6:368 «Собирается в браузере…
// writeFile», но src/excel/template.ts без DOM (CLAUDE.md: src/excel/* —
// чистые функции без DOM) — Blob и временную ссылку делает этот модуль.
// §7:381: без allow-downloads в iframe шаблон не скачается — здесь это не
// проверяется (iframe — DN-27), только сам механизм скачивания.
//
// URL.createObjectURL/revokeObjectURL и HTMLAnchorElement.prototype.click в
// jsdom либо не реализованы, либо дают «Not implemented: navigation» —
// подменяются во всех тестах файла.
import { buildTemplate, TEMPLATE_FILE_NAME } from '../src/excel/template';
import { downloadBytes, downloadTemplate, XLSX_MIME_TYPE } from '../src/components/ui/download';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  // Таймер revoke — до восстановления моков, иначе он всплывёт позже с
  // немоканным URL.revokeObjectURL (jsdom его не реализует).
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Подменяет createObjectURL/revokeObjectURL/click; возвращает клики по ссылке. */
function mockDownloadDom(objectUrl: string): {
  createObjectURL: ReturnType<typeof vi.spyOn>;
  revokeObjectURL: ReturnType<typeof vi.spyOn>;
  clicks: { download: string; href: string }[];
} {
  const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue(objectUrl);
  const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  const clicks: { download: string; href: string }[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicks.push({ download: this.download, href: this.href });
  });
  return { createObjectURL, revokeObjectURL, clicks };
}

describe('downloadBytes', () => {
  it('Blob нужного размера/типа, клик по ссылке с download/href, ссылка убрана из DOM, revoke по таймеру', () => {
    const { createObjectURL, revokeObjectURL, clicks } = mockDownloadDom('blob:x');

    downloadBytes(new Uint8Array([1, 2, 3]), 'a.xlsx', XLSX_MIME_TYPE);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const call = createObjectURL.mock.calls[0];
    if (!call) throw new Error('createObjectURL не вызван');
    const blob = call[0] as Blob;
    expect(blob.size).toBe(3);
    expect(blob.type).toBe(XLSX_MIME_TYPE);

    expect(clicks).toEqual([{ download: 'a.xlsx', href: 'blob:x' }]);
    expect(document.querySelector('a[download]')).toBeNull();

    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:x');
  });
});

describe('downloadTemplate (SPEC §6:368): имя файла и размер байтов шаблона', () => {
  it('download === TEMPLATE_FILE_NAME, размер Blob === (await buildTemplate()).length', async () => {
    const { clicks, createObjectURL } = mockDownloadDom('blob:tpl');
    const bytes = await buildTemplate();

    await downloadTemplate();

    expect(clicks).toEqual([{ download: TEMPLATE_FILE_NAME, href: 'blob:tpl' }]);
    const call = createObjectURL.mock.calls[0];
    if (!call) throw new Error('createObjectURL не вызван');
    const blob = call[0] as Blob;
    expect(blob.type).toBe(XLSX_MIME_TYPE);
    expect(blob.size).toBe(bytes.length);
  });
});
