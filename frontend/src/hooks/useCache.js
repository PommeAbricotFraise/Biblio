import { useState, useEffect } from 'react';

// Hook de cache intelligent pour optimiser les performances
export const useCache = (key, fetchFunction, dependencies = [], ttl = 300000) => { // 5min TTL
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(0);

  const getCacheKey = () => `cache_${key}_${JSON.stringify(dependencies)}`;
  
  const getFromCache = () => {
    try {
      const cached = localStorage.getItem(getCacheKey());
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        if (age < ttl) {
          return data;
        }
      }
    } catch (e) {
      console.warn('Erreur lecture cache:', e);
    }
    return null;
  };

  const setToCache = (newData) => {
    try {
      localStorage.setItem(getCacheKey(), JSON.stringify({
        data: newData,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.warn('Erreur écriture cache:', e);
    }
  };

  const fetchData = async (force = false) => {
    // Vérifier le cache d'abord (sauf si force)
    if (!force) {
      const cached = getFromCache();
      if (cached) {
        setData(cached);
        return cached;
      }
    }

    // Éviter les requêtes multiples simultanées
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const result = await fetchFunction();
      setData(result);
      setToCache(result);
      setLastFetch(Date.now());
      return result;
    } catch (err) {
      setError(err);
      console.error('Erreur fetch:', err);
    } finally {
      setLoading(false);
    }
  };

  const invalidateCache = () => {
    localStorage.removeItem(getCacheKey());
    setData(null);
  };

  // Fetch automatique au mount et quand les dépendances changent
  useEffect(() => {
    fetchData();
  }, dependencies);

  return {
    data,
    loading,
    error,
    refetch: () => fetchData(true),
    invalidateCache,
    lastFetch
  };
};