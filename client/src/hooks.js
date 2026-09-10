import { useState, useEffect } from "react";

export function useTeams() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/teams")
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load teams (${r.status})`);
        return r.json();
      })
      .then((json) => {
        const sorted = [...json.data].sort((a, b) =>
          a.full_name.localeCompare(b.full_name)
        );
        setTeams(sorted);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return { teams, loading, error };
}

export function usePlayers(teamId) {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!teamId) {
      setPlayers([]);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setPlayers([]);

    fetch(`/api/teams/${teamId}/players`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load roster (${r.status})`);
        return r.json();
      })
      .then((json) => setPlayers(json.data))
      .catch((err) => { if (err.name !== "AbortError") setError(err.message); })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [teamId]);

  return { players, loading, error };
}

export function useCapPosition(teamId) {
  const [capPosition, setCapPosition] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!teamId) {
      setCapPosition(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setCapPosition(null);
    setError(null);

    fetch(`/api/teams/${teamId}/cap`, { signal: controller.signal })
      .then((r) => {
        // 404 = endpoint not yet live or team not synced; fail silently
        if (!r.ok) return null;
        return r.json();
      })
      .then((json) => setCapPosition(json?.data ?? null))
      .catch((err) => {
        if (err.name !== "AbortError") { setCapPosition(null); setError(err.message); }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [teamId]);

  return { capPosition, loading, error };
}
