// Поле поиска каталога: «справа SearchField 320 px «Поиск по названию»» (SPEC
// §4.2:247), разметка design/catalog-mockup.html:101–104, стили CAT:39.
// Управляемое: значение и фильтрацию держит потребитель. Своих подписей нет —
// label (доступное имя) и placeholder передаёт потребитель из src/i18n/ru.ts,
// как у Button. type="search" даёт роль searchbox.
import { SearchIcon } from './icons.tsx';
import styles from './SearchField.module.css';

export interface SearchFieldProps {
  value: string;
  onChange(value: string): void;
  placeholder: string;
  /** Доступное имя поля (`aria-label`): видимой подписи у поля нет (CAT:101). */
  label: string;
  className?: string;
}

export function SearchField({ value, onChange, placeholder, label, className }: SearchFieldProps) {
  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <SearchIcon className={styles.icon} />
      <input
        type="search"
        className={styles.input}
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </div>
  );
}
