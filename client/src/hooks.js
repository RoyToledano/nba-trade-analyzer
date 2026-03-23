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

    setLoading(true);
    setError(null);
    setPlayers([]);

    fetch(`/api/teams/${teamId}/players`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load roster (${r.status})`);
        return r.json();
      })
      .then((json) => setPlayers(json.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [teamId]);

  return { players, loading, error };
}
