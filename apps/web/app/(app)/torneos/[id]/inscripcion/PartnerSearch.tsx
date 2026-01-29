'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type SearchRow = {
  club_player_id: string;
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
};

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export default function PartnerSearch({
  clubId,
  onSelect,
}: {
  clubId: string;
  onSelect: (row: SearchRow) => void;
}) {
  const [q, setQ] = useState('');
  const qDebounced = useDebouncedValue(q.trim(), 300);

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setError(null);

      if (!clubId || qDebounced.length < 2) {
        setResults([]);
        return;
      }

      setLoading(true);
      const { data, error } = await supabase.rpc('search_club_players', {
        p_club_id: clubId,
        p_query: qDebounced,
        p_limit: 20,
      });

      if (cancelled) return;

      if (error) {
        setError(error.message);
        setResults([]);
      } else {
        setResults((data ?? []) as SearchRow[]);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [clubId, qDebounced]);

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <label style={{ display: 'grid', gap: 6 }}>
        <span>Buscar compañero (email / apellido / nombre)</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ej: juan@gmail.com o Pérez"
          style={{ padding: 10, border: '1px solid #ccc', borderRadius: 8 }}
        />
      </label>

      {loading && <div>Buscando…</div>}
      {error && <div style={{ color: 'salmon' }}>{error}</div>}

      {!loading && results.length > 0 && (
        <div style={{ border: '1px solid #eee', borderRadius: 10, overflow: 'hidden' }}>
          {results.map((r) => (
            <button
              key={r.club_player_id}
              onClick={() => onSelect(r)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: 12,
                border: 0,
                borderBottom: '1px solid #f2f2f2',
                background: 'white',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 600 }}>
                {(r.last_name ?? '').trim()} {(r.first_name ?? '').trim()}
              </div>
              <div style={{ opacity: 0.8 }}>{r.email}</div>
            </button>
          ))}
        </div>
      )}

      {!loading && qDebounced.length >= 2 && results.length === 0 && !error && (
        <div>No se encontraron resultados.</div>
      )}
    </div>
  );
}
