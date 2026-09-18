// Корень приложения: стор (SPEC §1:15) → шапка A0 (§4.1), область содержимого,
// окно загрузки A4 (§4.8:329) и хост тоста (§4.8:350). Содержимое каталога и
// сценария — DN-24 / DN-26.
// AppShell выделен, чтобы хост тоста можно было проверить с initialState.
import { useAppStore } from './state/context.ts';
import { StoreProvider } from './state/store.tsx';
import { Header } from './components/Header/Header.tsx';
import { ImportModal } from './components/ImportModal/ImportModal.tsx';
import { Toast } from './components/ui/Toast.tsx';

export function AppShell() {
  const { state, dispatch } = useAppStore();
  const { toast, modal } = state;

  return (
    <>
      <Header />
      <main />
      {/* Монтируется на каждое открытие: после «Отмены» окно снова пустое. */}
      {modal?.kind === 'import' && <ImportModal />}
      {/* restartKey={seq}: повтор того же текста перезапускает отсчёт; key не ставить — пересоздаст живой регион role="status". */}
      <Toast
        restartKey={toast?.seq}
        message={toast?.message ?? null}
        onDismiss={() => {
          dispatch({ type: 'dismissToast' });
        }}
      />
    </>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <AppShell />
    </StoreProvider>
  );
}
