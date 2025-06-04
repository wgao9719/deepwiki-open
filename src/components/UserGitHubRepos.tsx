'use client';

import React, { useState, useEffect } from 'react';
import { FaGithub, FaStar, FaCodeBranch, FaSync, FaUser, FaCalendarAlt, FaExternalLinkAlt } from 'react-icons/fa';

interface GitHubRepo {
  name: string;
  full_name: string;
  description: string;
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
  email: string;
  full_name: string;
  avatar_url: string;
  username: string;
  github_username: string;
  github_repos: GitHubRepo[];
  github_repos_updated_at: string;
  github_collaborator_repos: GitHubRepo[];
  github_collaborator_repos_updated_at: string;
  created_at: string;
  updated_at: string;
}

interface Props {
  userId: string;
  maxRepos?: number;
  showUpdateButton?: boolean;
  className?: string;
  repoType?: 'owned' | 'collaborator' | 'all';
}

const UserGitHubRepos: React.FC<Props> = ({ 
  userId, 
  maxRepos = 10, 
  showUpdateButton = false, 
  className = "",
  repoType = 'all'
}) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [ownedRepositories, setOwnedRepositories] = useState<GitHubRepo[]>([]);
  const [collaboratorRepositories, setCollaboratorRepositories] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUserProfile = async () => {
    if (!userId) return;

    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/user/profile/${userId}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          setError('User profile not found');
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

  const updateRepositories = async (force = false) => {
    if (!profile?.github_username) {
      setError('No GitHub username found in profile');
      return;
    }

    try {
      setUpdating(true);
      setError(null);

      const endpoint = force ? '/api/user/github-repos/refresh' : '/api/user/github-repos/update';
      const params = new URLSearchParams({
        user_id: userId,
        github_username: profile.github_username,
        ...(force && { force: 'true' })
      });

      const response = await fetch(`${endpoint}?${params.toString()}`, {
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
    if (userId) {
      fetchUserProfile();
    }
  }, [userId]);

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString();
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

  const getRepositoriesToDisplay = () => {
    switch (repoType) {
      case 'owned':
        return ownedRepositories;
      case 'collaborator':
        return collaboratorRepositories;
      case 'all':
      default:
        return [...ownedRepositories, ...collaboratorRepositories].sort((a, b) => 
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
    }
  };

  const getTitle = () => {
    switch (repoType) {
      case 'owned':
        return 'GitHub Repositories';
      case 'collaborator':
        return 'Contributor Repositories';
      case 'all':
      default:
        return 'GitHub Repositories';
    }
  };

  const getSubtitle = () => {
    if (!profile?.github_username) return '';
    
    switch (repoType) {
      case 'owned':
        return `@${profile.github_username} • ${ownedRepositories.length} repositories`;
      case 'collaborator':
        return `@${profile.github_username} • ${collaboratorRepositories.length} contributor repositories`;
      case 'all':
      default:
        const total = ownedRepositories.length + collaboratorRepositories.length;
        return `@${profile.github_username} • ${total} repositories total`;
    }
  };

  if (loading) {
    return (
      <div className={`bg-[var(--card-bg)] rounded-lg p-6 ${className}`}>
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent-primary)]"></div>
          <span className="ml-2 text-[var(--muted)]">Loading repositories...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-[var(--card-bg)] rounded-lg p-6 ${className}`}>
        <div className="text-center">
          <div className="text-[var(--highlight)] mb-2">Error loading repositories</div>
          <div className="text-sm text-[var(--muted)] mb-4">{error}</div>
          <button
            onClick={() => fetchUserProfile()}
            className="px-4 py-2 bg-[var(--accent-primary)] text-white rounded-md hover:bg-[var(--accent-primary)]/90 transition-colors text-sm"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const repositories = getRepositoriesToDisplay();
  const displayRepos = repositories.slice(0, maxRepos);

  return (
    <div className={`bg-[var(--card-bg)] rounded-lg p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FaGithub className="text-xl text-[var(--foreground)]" />
          <div>
            <h3 className="text-lg font-semibold text-[var(--foreground)]">
              {getTitle()}
            </h3>
            {getSubtitle() && (
              <p className="text-sm text-[var(--muted)]">
                {getSubtitle()}
              </p>
            )}
          </div>
        </div>

        {showUpdateButton && profile?.github_username && (
          <div className="flex gap-2">
            <button
              onClick={() => updateRepositories(false)}
              disabled={updating}
              className="flex items-center gap-2 px-3 py-1.5 bg-[var(--background)] text-[var(--foreground)] rounded-md hover:bg-[var(--background)]/80 disabled:opacity-50 disabled:cursor-not-allowed border border-[var(--border-color)] transition-colors text-sm"
            >
              <FaSync className={`text-xs ${updating ? 'animate-spin' : ''}`} />
              {updating ? 'Updating...' : 'Update'}
            </button>
            <button
              onClick={() => updateRepositories(true)}
              disabled={updating}
              className="flex items-center gap-2 px-3 py-1.5 bg-[var(--accent-primary)] text-white rounded-md hover:bg-[var(--accent-primary)]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
            >
              Force Refresh
            </button>
          </div>
        )}
      </div>

      {/* Last Updated */}
      {profile?.github_repos_updated_at && (
        <div className="flex items-center gap-2 text-xs text-[var(--muted)] mb-4">
          <FaCalendarAlt />
          <span>Last updated: {formatDate(profile.github_repos_updated_at)}</span>
        </div>
      )}

      {/* Repositories List */}
      {displayRepos.length === 0 ? (
        <div className="text-center py-8">
          <FaGithub className="text-4xl text-[var(--muted)] mx-auto mb-3" />
          <p className="text-[var(--muted)]">No repositories found</p>
          {profile?.github_username && (
            <button
              onClick={() => updateRepositories(true)}
              className="mt-3 px-4 py-2 bg-[var(--accent-primary)] text-white rounded-md hover:bg-[var(--accent-primary)]/90 transition-colors text-sm"
            >
              Fetch Repositories
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {displayRepos.map((repo) => (
            <div
              key={repo.full_name}
              className="border border-[var(--border-color)] rounded-lg p-4 hover:border-[var(--accent-primary)]/30 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <a
                      href={repo.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--accent-primary)] hover:text-[var(--highlight)] font-medium text-sm transition-colors flex items-center gap-1"
                    >
                      {repo.name}
                      <FaExternalLinkAlt className="text-xs" />
                    </a>
                    {repo.is_fork && (
                      <span className="text-xs bg-[var(--background)] text-[var(--muted)] px-2 py-0.5 rounded-full border border-[var(--border-color)]">
                        Fork
                      </span>
                    )}
                    {repo.is_owner && (
                      <span className="text-xs bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] px-2 py-0.5 rounded-full border border-[var(--accent-primary)]/30">
                        Owner
                      </span>
                    )}
                    {repo.relationship && (
                      <span className="text-xs bg-[var(--highlight)]/10 text-[var(--highlight)] px-2 py-0.5 rounded-full border border-[var(--highlight)]/30">
                        {repo.relationship === 'collaborator' ? 'Collaborator' : 'Org Member'}
                      </span>
                    )}
                  </div>

                  {repo.description && (
                    <p className="text-sm text-[var(--muted)] mb-3 leading-relaxed">
                      {repo.description}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-xs text-[var(--muted)]">
                    {repo.language && (
                      <div className="flex items-center gap-1">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: getLanguageColor(repo.language) }}
                        />
                        <span>{repo.language}</span>
                      </div>
                    )}
                    
                    <div className="flex items-center gap-1">
                      <FaStar className="text-[var(--accent-primary)]" />
                      <span>{repo.stars.toLocaleString()}</span>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      <FaCodeBranch className="text-[var(--muted)]" />
                      <span>{repo.forks.toLocaleString()}</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <FaUser className="text-[var(--muted)]" />
                      <span>{repo.owner}</span>
                    </div>

                    <span>Updated {formatDate(repo.updated_at)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {repositories.length > maxRepos && (
            <div className="text-center pt-4">
              <p className="text-sm text-[var(--muted)]">
                Showing {maxRepos} of {repositories.length} repositories
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default UserGitHubRepos; 