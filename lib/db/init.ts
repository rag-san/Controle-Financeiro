import { migrate } from "./migrate";

type GlobalInit = typeof globalThis & {
  __finance_db_initialized__?: boolean;
};

export function initDbOnce(): void {
  const globalInit = globalThis as GlobalInit;
  if (globalInit.__finance_db_initialized__) {
    return;
  }

  migrate();
  globalInit.__finance_db_initialized__ = true;
}



