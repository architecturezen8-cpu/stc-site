import { useEffect, useState } from "react";

/**
 * Debounce a fast-changing value (e.g. a search field) so expensive
 * re-filtering only runs after the user pauses typing. No dependencies.
 */
export function useDebouncedValue<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
