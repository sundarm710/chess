import { useEffect, useState } from 'react';

interface State<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/** Minimal fetch-JSON hook. In production this is where TanStack Query would slot in
 *  (caching, dedupe, retries) — the component API stays identical. */
export function useJson<T>(url: string | null): State<T> {
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: !!url });

  useEffect(() => {
    if (!url) return;
    let alive = true;
    setState({ data: null, error: null, loading: true });
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.json();
      })
      .then((data: T) => alive && setState({ data, error: null, loading: false }))
      .catch((e: Error) => alive && setState({ data: null, error: e.message, loading: false }));
    return () => {
      alive = false;
    };
  }, [url]);

  return state;
}
