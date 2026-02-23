import { migrate } from "./migrate";

type GlobalInit = typeof globalThis & {
  __finance_db_initialized__?: boolean;
  __finance_db_initializing__?: boolean;
  __finance_db_init_promise__?: Promise<void>;
};

export async function initDbOnce(): Promise<void> {
  const globalInit = globalThis as GlobalInit;
  if (globalInit.__finance_db_initialized__) {
    return;
  }

  if (globalInit.__finance_db_init_promise__) {
    await globalInit.__finance_db_init_promise__;
    return;
  }

  globalInit.__finance_db_init_promise__ = (async () => {
    globalInit.__finance_db_initializing__ = true;
    try {
      await migrate();
      globalInit.__finance_db_initialized__ = true;
    } finally {
      globalInit.__finance_db_initializing__ = false;
    }
  })();

  try {
    await globalInit.__finance_db_init_promise__;
  } catch (error) {
    globalInit.__finance_db_init_promise__ = undefined;
    throw error;
  }
}



