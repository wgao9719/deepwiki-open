'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { FaGithub, FaStar, FaCodeBranch, FaSync, FaExternalLinkAlt, FaClock, FaCode } from 'react-icons/fa';

interface GitHubRepo {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  stars: number;
  forks: number;
  updated_at: string;
  owner: string;
  is_owner: boolean;
  is_fork: boolean;
  relationship?: string; // 'collaborator' or 'organization_member' for collaborator repos
}

interface UserProfile {
  id: string;
  github_username: string;
  github_repos: GitHubRepo[];
  github_repos_updated_at: string;
  github_collaborator_repos: GitHubRepo[];
  github_collaborator_repos_updated_at: string;
}

export default function GitHubReposSidebar() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [ownedRepositories, setOwnedRepositories] = useState<GitHubRepo[]>([]);
  const [collaboratorRepositories, setCollaboratorRepositories] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUserProfile = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/user/profile/${user.id}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          setError('No GitHub repositories found');
        } else {
          throw new Error(`Failed to fetch profile: ${response.status}`);
        }
        return;
      }
      
      const data = await response.json();
      setProfile(data.profile);
      setOwnedRepositories(data.profile.github_repos || []);
      setCollaboratorRepositories(data.profile.github_collaborator_repos || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch repositories');
      console.error('Error fetching user profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateRepositories = async () => {
    if (!user?.id || !profile?.github_username) return;

    try {
      setUpdating(true);
      setError(null);

      const params = new URLSearchParams({
        user_id: user.id,
        github_username: profile.github_username,
        force: 'true'
      });

      const response = await fetch(`/api/user/github-repos/refresh?${params.toString()}`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`Failed to update repositories: ${response.status}`);
      }

      // Wait a moment then refresh the data
      setTimeout(() => {
        fetchUserProfile();
      }, 2000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update repositories');
      console.error('Error updating repositories:', err);
    } finally {
      setUpdating(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchUserProfile();
    }
  }, [user?.id]);

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffInDays === 0) return 'Today';
      if (diffInDays === 1) return 'Yesterday';
      if (diffInDays < 7) return `${diffInDays}d ago`;
      if (diffInDays < 30) return `${Math.floor(diffInDays / 7)}w ago`;
      if (diffInDays < 365) return `${Math.floor(diffInDays / 30)}mo ago`;
      return `${Math.floor(diffInDays / 365)}y ago`;
    } catch {
      return 'Unknown';
    }
  };

  const getLanguageColor = (language: string | null) => {
    const colors: Record<string, string> = {
      'JavaScript': '#f1e05a',
      'TypeScript': '#2b7489',
      'Python': '#3572A5',
      'Java': '#b07219',
      'C++': '#f34b7d',
      'C': '#555555',
      'C#': '#239120',
      'PHP': '#4F5D95',
      'Ruby': '#701516',
      'Go': '#00ADD8',
      'Rust': '#dea584',
      'Swift': '#ffac45',
      'Kotlin': '#F18E33',
      'Dart': '#00B4AB',
      'Shell': '#89e051',
      'HTML': '#e34c26',
      'CSS': '#1572B6',
      'Vue': '#2c3e50',
      'React': '#61dafb',
    };
    return colors[language || ''] || '#586069';
  };

  // Don't render anything if user is not authenticated
  if (!user) {
    return null;
  }

  return (
    <div className="w-80 bg-[var(--card-bg)] rounded-lg border border-[var(--border-color)] shadow-custom p-4 h-fit sticky top-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FaGithub className="text-lg text-[var(--foreground)]" />
          <h3 className="text-sm font-semibold text-[var(--foreground)]">
            Your Repositories
          </h3>
        </div>
        
        {profile?.github_username && (
          <button
            onClick={updateRepositories}
            disabled={updating}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-[var(--background)] text-[var(--foreground)] rounded-md hover:bg-[var(--background)]/80 disabled:opacity-50 disabled:cursor-not-allowed border border-[var(--border-color)] transition-colors"
            title="Refresh repositories"
          >
            <FaSync className={`text-xs ${updating ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[var(--accent-primary)]"></div>
          <span className="ml-2 text-sm text-[var(--muted)]">Loading...</span>
        </div>
      ) : error ? (
        <div className="text-center py-8">
          <div className="text-sm text-[var(--muted)] mb-2">{error}</div>
          <button
            onClick={fetchUserProfile}
            className="px-3 py-1 bg-[var(--accent-primary)] text-white rounded-md hover:bg-[var(--accent-primary)]/90 transition-colors text-xs"
          >
            Try Again
          </button>
        </div>
      ) : ownedRepositories.length === 0 && collaboratorRepositories.length === 0 ? (
        <div className="text-center py-8">
          <FaGithub className="text-2xl text-[var(--muted)] mb-2 mx-auto" />
          <div className="text-sm text-[var(--muted)] mb-2">No repositories found</div>
          {profile?.github_username && (
            <button
              onClick={updateRepositories}
              className="px-3 py-1 bg-[var(--accent-primary)] text-white rounded-md hover:bg-[var(--accent-primary)]/90 transition-colors text-xs"
            >
              Fetch Repositories
            </button>
          )}
        </div>
      ) : (
        <>
          {/* GitHub username */}
          {profile?.github_username && (
            <div className="text-xs text-[var(--muted)] mb-3 flex items-center gap-1">
              <span>@{profile.github_username}</span>
              <span>•</span>
              <span>{ownedRepositories.length + collaboratorRepositories.length} repositories</span>
            </div>
          )}

          {/* Repository list */}
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {ownedRepositories.slice(0, 10).map((repo) => (
              <div
                key={repo.full_name}
                className="border border-[var(--border-color)] rounded-md p-3 hover:bg-[var(--background)]/50 transition-colors group"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-[var(--foreground)] truncate">
                      {repo.name}
                    </h4>
                    {repo.description && (
                      <p className="text-xs text-[var(--muted)] mt-1 line-clamp-2">
                        {repo.description}
                      </p>
                    )}
                  </div>
                  <a
                    href={repo.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--muted)] hover:text-[var(--accent-primary)] ml-2 flex-shrink-0"
                    title="Open on GitHub"
                  >
                    <FaExternalLinkAlt className="text-xs" />
                  </a>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    {repo.language && (
                      <div className="flex items-center gap-1">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: getLanguageColor(repo.language) }}
                        />
                        <span className="text-[var(--muted)]">{repo.language}</span>
                      </div>
                    )}
                    {repo.stars > 0 && (
                      <div className="flex items-center gap-1 text-[var(--muted)]">
                        <FaStar className="text-xs" />
                        <span>{repo.stars}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-[var(--muted)]">
                    <FaClock className="text-xs" />
                    <span>{formatDate(repo.updated_at)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Show more link if there are more repos */}
          {ownedRepositories.length > 10 && (
            <div className="text-center mt-3 pt-3 border-t border-[var(--border-color)]">
              <a
                href={`https://github.com/${profile?.github_username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[var(--accent-primary)] hover:text-[var(--highlight)] transition-colors"
              >
                View all {ownedRepositories.length} owned repositories →
              </a>
            </div>
          )}

          {/* Collaborator repositories */}
          {collaboratorRepositories.length > 0 && (
            <>
              <div className="text-xs text-[var(--muted)] mt-3 pt-3 border-t border-[var(--border-color)] text-center">
                Collaborator repositories
              </div>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {collaboratorRepositories.slice(0, 10).map((repo) => (
                  <div
                    key={repo.full_name}
                    className="border border-[var(--border-color)] rounded-md p-3 hover:bg-[var(--background)]/50 transition-colors group"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-[var(--foreground)] truncate">
                          {repo.name}
                        </h4>
                        {repo.description && (
                          <p className="text-xs text-[var(--muted)] mt-1 line-clamp-2">
                            {repo.description}
                          </p>
                        )}
                      </div>
                      <a
                        href={repo.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--muted)] hover:text-[var(--accent-primary)] ml-2 flex-shrink-0"
                        title="Open on GitHub"
                      >
                        <FaExternalLinkAlt className="text-xs" />
                      </a>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-3">
                        {repo.language && (
                          <div className="flex items-center gap-1">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: getLanguageColor(repo.language) }}
                            />
                            <span className="text-[var(--muted)]">{repo.language}</span>
                          </div>
                        )}
                        {repo.stars > 0 && (
                          <div className="flex items-center gap-1 text-[var(--muted)]">
                            <FaStar className="text-xs" />
                            <span>{repo.stars}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[var(--muted)]">
                        <FaClock className="text-xs" />
                        <span>{formatDate(repo.updated_at)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Show more link if there are more collaborator repos */}
              {collaboratorRepositories.length > 10 && (
                <div className="text-center mt-3 pt-3 border-t border-[var(--border-color)]">
                  <a
                    href={`https://github.com/${profile?.github_username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--accent-primary)] hover:text-[var(--highlight)] transition-colors"
                  >
                    View all {collaboratorRepositories.length} collaborator repositories →
                  </a>
                </div>
              )}
            </>
          )}

          {/* Last updated */}
          {profile?.github_repos_updated_at && (
            <div className="text-xs text-[var(--muted)] mt-3 pt-3 border-t border-[var(--border-color)] text-center">
              Updated {formatDate(profile.github_repos_updated_at)}
            </div>
          )}
        </>
      )}
    </div>
  );
} 