'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { FaGlobe, FaDownload, FaTrash, FaExternalLinkAlt, FaSyncAlt } from 'react-icons/fa';

interface GlobalCacheItem {
  id: string;
  owner: string;
  repo: string;
  repo_type: string;
  language: string;
  name: string;
  created_at?: string;
  updated_at?: string;
  size: number;
}

interface GlobalWikiCacheProps {
  className?: string;
  maxItems?: number;
}

export default function GlobalWikiCache({ className = "", maxItems }: GlobalWikiCacheProps) {
  const [cacheItems, setCacheItems] = useState<GlobalCacheItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGlobalCaches = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/global-wiki-cache');
      if (!response.ok) {
        throw new Error(`Failed to fetch global caches: ${response.statusText}`);
      }
      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }
      setCacheItems(maxItems ? data.slice(0, maxItems) : data);
    } catch (e: unknown) {
      console.error("Failed to load global caches:", e);
      const message = e instanceof Error ? e.message : "An unknown error occurred.";
      setError(message);
      setCacheItems([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchGlobalCaches();
  }, [maxItems]);

  const handleDelete = async (item: GlobalCacheItem) => {
    if (!confirm(`Are you sure you want to delete the global cache for ${item.name}?`)) {
      return;
    }
    
    try {
      const params = new URLSearchParams({
        repo_type: item.repo_type,
        language: item.language,
      });
      
      const response = await fetch(`/api/global-wiki-cache/${item.owner}/${item.repo}?${params.toString()}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorBody.error || response.statusText);
      }
      
      // Remove from local state
      setCacheItems(prev => prev.filter(c => c.id !== item.id));
    } catch (e: unknown) {
      console.error('Failed to delete global cache:', e);
      alert(`Failed to delete global cache: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  const handleDownload = async (item: GlobalCacheItem) => {
    try {
      const params = new URLSearchParams({
        repo_type: item.repo_type,
        language: item.language,
      });
      
      const response = await fetch(`/api/global-wiki-cache/${item.owner}/${item.repo}?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error(`Failed to download cache: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Create and download JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${item.id}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      console.error('Failed to download cache:', e);
      alert(`Failed to download cache: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return 'Unknown';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return 'Invalid date';
    }
  };

  return (
    <div className={`${className}`}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <FaGlobe className="text-[var(--accent-primary)]" />
          <h2 className="text-2xl font-bold text-[var(--accent-primary)]">
            Global Wiki Cache
          </h2>
        </div>
        <button
          onClick={fetchGlobalCaches}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-[var(--accent-primary)] text-white rounded hover:bg-[var(--accent-primary)]/80 transition-colors"
          disabled={isLoading}
        >
          <FaSyncAlt className={isLoading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {isLoading && (
        <div className="text-center py-8">
          <div className="animate-spin inline-block w-6 h-6 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full"></div>
          <p className="mt-2 text-[var(--muted)]">Loading global caches...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-red-700">Error loading global caches: {error}</p>
        </div>
      )}

      {!isLoading && !error && cacheItems.length === 0 && (
        <div className="text-center py-8">
          <FaGlobe className="mx-auto text-4xl text-[var(--muted)] mb-4" />
          <p className="text-[var(--muted)]">No global wiki caches found.</p>
          <p className="text-sm text-[var(--muted)] mt-2">
            Wiki caches will appear here once they are uploaded to Supabase storage.
          </p>
        </div>
      )}

      {!isLoading && !error && cacheItems.length > 0 && (
        <div className="space-y-4">
          {cacheItems.map((item) => (
            <div
              key={item.id}
              className="border border-[var(--border-color)] rounded-lg p-4 bg-[var(--card-bg)] hover:shadow-md transition-all duration-200"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold text-[var(--foreground)]">
                      {item.name}
                    </h3>
                    <span className="text-xs px-2 py-1 bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] rounded">
                      {item.repo_type}
                    </span>
                    <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded">
                      {item.language}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm text-[var(--muted)]">
                    <span>Size: {formatFileSize(item.size)}</span>
                    {item.updated_at && (
                      <span>Updated: {formatDate(item.updated_at)}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <Link
                    href={`/${item.owner}/${item.repo}?repo_type=${item.repo_type}&language=${item.language}`}
                    className="p-2 text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/10 rounded transition-colors"
                    title="View Wiki"
                  >
                    <FaExternalLinkAlt className="h-4 w-4" />
                  </Link>
                  
                  <button
                    onClick={() => handleDownload(item)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    title="Download Cache"
                  >
                    <FaDownload className="h-4 w-4" />
                  </button>
                  
                  <button
                    onClick={() => handleDelete(item)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="Delete Cache"
                  >
                    <FaTrash className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && !error && cacheItems.length > 0 && maxItems && cacheItems.length === maxItems && (
        <div className="text-center mt-6">
          <p className="text-sm text-[var(--muted)]">
            Showing {maxItems} of potentially more items.
          </p>
        </div>
      )}
    </div>
  );
} 