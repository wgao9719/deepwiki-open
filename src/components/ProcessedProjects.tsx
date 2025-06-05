'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { FaTimes, FaTh, FaList } from 'react-icons/fa';
import { useAuth } from '@/contexts/AuthContext';

// Interface should match the structure from the API
interface ProcessedProject {
  id: string;
  owner: string;
  repo: string;
  name: string;
  repo_type: string;
  submittedAt: number;
  language: string;
}

interface UserGitHubRepo {
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
  is_collaborator: boolean;
  is_fork: boolean;
  relationship?: string; // 'collaborator' or 'organization_member' for collaborator repos
}

interface ProcessedProjectsProps {
  showHeader?: boolean;
  maxItems?: number;
  className?: string;
  messages?: Record<string, Record<string, string>>; // Translation messages with proper typing
}

export default function ProcessedProjects({ 
  showHeader = true, 
  maxItems, 
  className = "",
  messages 
}: ProcessedProjectsProps) {
  const [projects, setProjects] = useState<ProcessedProject[]>([]);
  const [userRepositories, setUserRepositories] = useState<UserGitHubRepo[]>([]);
  const [collaboratorRepositories, setCollaboratorRepositories] = useState<UserGitHubRepo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const { user, isAdmin } = useAuth();

  // Default messages fallback
  const defaultMessages = {
    title: 'Processed Wiki Projects',
    searchPlaceholder: 'Search projects by name, owner, or repository...',
    noProjects: 'No projects found in the server cache. The cache might be empty or the server encountered an issue.',
    noSearchResults: 'No projects match your search criteria.',
    processedOn: 'Processed on:',
    loadingProjects: 'Loading projects...',
    errorLoading: 'Error loading projects:',
    backToHome: 'Back to Home',
    yourRepositories: 'Your Repositories',
    yourContributorRepositories: 'Collaborated Repositories',
    otherRepositories: 'Other Repositories'
  };

  const t = (key: string) => {
    if (messages?.projects?.[key]) {
      return messages.projects[key];
    }
    return defaultMessages[key as keyof typeof defaultMessages] || key;
  };

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        // Fetch processed projects
        const projectsResponse = await fetch('/api/wiki/projects');
        if (!projectsResponse.ok) {
          throw new Error(`Failed to fetch projects: ${projectsResponse.statusText}`);
        }
        const projectsData = await projectsResponse.json();
        if (projectsData.error) {
          throw new Error(projectsData.error);
        }
        setProjects(projectsData as ProcessedProject[]);

        // Fetch user's GitHub repositories if user is logged in
        if (user?.id) {
          try {
            const userProfileResponse = await fetch(`/api/user/profile/${user.id}`);
            if (userProfileResponse.ok) {
              const userData = await userProfileResponse.json();
              setUserRepositories(userData.profile?.github_repos || []);
              setCollaboratorRepositories(userData.profile?.github_collaborator_repos || []);
            }
          } catch (err) {
            console.warn('Could not fetch user repositories:', err);
            // Don't show error for this as it's not critical
          }
        }
      } catch (e: unknown) {
        console.error("Failed to load projects from API:", e);
        const message = e instanceof Error ? e.message : "An unknown error occurred.";
        setError(message);
        setProjects([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user?.id]);

  // Categorize projects based on user repositories
  const categorizedProjects = useMemo(() => {
    // Combine all repositories for comprehensive categorization
    const allRepositories = [...userRepositories, ...collaboratorRepositories];
    
    // Create categorized sets based on repository ownership and relationship
    const ownedRepoFullNames = new Set(
      allRepositories
        .filter(repo => repo.is_owner === true) // User owns this repo (includes both regular repos and forks)
        .map(repo => repo.full_name.toLowerCase())
    );
    
    const collaboratedRepoFullNames = new Set(
      allRepositories
        .filter(repo => 
          repo.is_owner === false || // User doesn't own this repo (base repos, external collaborations)
          (repo.relationship && ['base_of_fork', 'base_of_collaborator_fork'].includes(repo.relationship)) // Base repositories
        )
        .map(repo => repo.full_name.toLowerCase())
    );
    
    // Debug logging to help verify the new categorization
    console.log('Owned repositories (includes forks):', allRepositories.filter(r => r.is_owner === true).map(r => ({ 
      name: r.full_name, 
      is_fork: r.is_fork, 
      is_owner: r.is_owner,
      relationship: r.relationship 
    })));
    console.log('Collaborated repositories (base repos and external collaborations):', allRepositories.filter(r => 
      r.is_owner === false || 
      (r.relationship && ['base_of_fork', 'base_of_collaborator_fork'].includes(r.relationship))
    ).map(r => ({ 
      name: r.full_name, 
      is_owner: r.is_owner, 
      is_collaborator: r.is_collaborator, 
      relationship: r.relationship 
    })));
    
    let filteredProjects = projects;
    
    // Apply search filter if query exists
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filteredProjects = projects.filter(project => 
        project.name.toLowerCase().includes(query) ||
        project.owner.toLowerCase().includes(query) ||
        project.repo.toLowerCase().includes(query) ||
        project.repo_type.toLowerCase().includes(query)
      );
    }

    // Separate into user repos, collaborator repos, and other repos
    const userProjects: ProcessedProject[] = [];
    const collaboratorProjects: ProcessedProject[] = [];
    const otherProjects: ProcessedProject[] = [];

    filteredProjects.forEach(project => {
      // Create the full repository name for the project
      const projectFullName = `${project.owner}/${project.repo}`.toLowerCase();
      
      if (ownedRepoFullNames.has(projectFullName)) {
        userProjects.push(project);
        console.log(`Project ${projectFullName} categorized as USER repository (owned or forked by user)`);
      } else if (collaboratedRepoFullNames.has(projectFullName)) {
        collaboratorProjects.push(project);
        console.log(`Project ${projectFullName} categorized as COLLABORATED repository (base repo or external collaboration)`);
      } else {
        otherProjects.push(project);
        console.log(`Project ${projectFullName} categorized as OTHER repository`);
      }
    });

    // Apply maxItems limit if specified
    let totalShown = 0;
    const finalUserProjects = maxItems ? userProjects.slice(0, Math.min(userProjects.length, maxItems - totalShown)) : userProjects;
    totalShown += finalUserProjects.length;
    
    const remainingSlots1 = maxItems ? maxItems - totalShown : collaboratorProjects.length;
    const finalCollaboratorProjects = remainingSlots1 > 0 ? collaboratorProjects.slice(0, remainingSlots1) : [];
    totalShown += finalCollaboratorProjects.length;
    
    const remainingSlots2 = maxItems ? maxItems - totalShown : otherProjects.length;
    const finalOtherProjects = remainingSlots2 > 0 ? otherProjects.slice(0, remainingSlots2) : [];

    return {
      userProjects: finalUserProjects,
      collaboratorProjects: finalCollaboratorProjects,
      otherProjects: finalOtherProjects,
      hasUserRepos: ownedRepoFullNames.size > 0 && finalUserProjects.length > 0,
      hasCollaboratorRepos: collaboratedRepoFullNames.size > 0 && finalCollaboratorProjects.length > 0
    };
  }, [projects, userRepositories, collaboratorRepositories, searchQuery, maxItems]);

  const clearSearch = () => {
    setSearchQuery('');
  };

  const handleDelete = async (project: ProcessedProject) => {
    if (!confirm(`Are you sure you want to delete project ${project.name}?`)) {
      return;
    }
    try {
      const response = await fetch('/api/wiki/projects', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: project.owner,
          repo: project.repo,
          repo_type: project.repo_type,
          language: project.language,
        }),
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorBody.error || response.statusText);
      }
      setProjects(prev => prev.filter(p => p.id !== project.id));
    } catch (e: unknown) {
      console.error('Failed to delete project:', e);
      alert(`Failed to delete project: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  const renderProjectsList = (projectsList: ProcessedProject[], showDeleteButton: boolean = true) => (
    <div className={viewMode === 'card' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-2'}>
      {projectsList.map((project) => (
        viewMode === 'card' ? (
          <div key={project.id} className="relative p-4 border border-[var(--border-color)] rounded-lg bg-[var(--card-bg)] shadow-sm hover:shadow-md transition-all duration-200 hover:scale-[1.02]">
            {(showDeleteButton || isAdmin) && (
              <button
                type="button"
                onClick={() => handleDelete(project)}
                className="absolute top-2 right-2 text-[var(--muted)] hover:text-[var(--foreground)]"
                title="Delete project"
              >
                <FaTimes className="h-4 w-4" />
              </button>
            )}
            <Link
              href={`/${project.owner}/${project.repo}?type=${project.repo_type}&language=${project.language}`}
              className="block"
            >
              <h3 className="text-lg font-semibold text-[var(--link-color)] hover:underline mb-2 line-clamp-2">
                {project.name}
              </h3>
              <div className="flex flex-wrap gap-2 mb-3">
                <span className="px-2 py-1 text-xs bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] rounded-full border border-[var(--accent-primary)]/20">
                  {project.repo_type}
                </span>
                <span className="px-2 py-1 text-xs bg-[var(--background)] text-[var(--muted)] rounded-full border border-[var(--border-color)]">
                  {project.language}
                </span>
              </div>
              <p className="text-xs text-[var(--muted)]">
                {t('processedOn')} {new Date(project.submittedAt).toLocaleDateString()}
              </p>
            </Link>
          </div>
        ) : (
          <div key={project.id} className="relative p-3 border border-[var(--border-color)] rounded-lg bg-[var(--card-bg)] hover:bg-[var(--background)] transition-colors">

            {(showDeleteButton || isAdmin) && (
              <button
                type="button"
                onClick={() => handleDelete(project)}
                className="absolute top-2 right-2 text-[var(--muted)] hover:text-[var(--foreground)]"
                title="Delete project"
              >
                <FaTimes className="h-4 w-4" />
              </button>
            )}
            <Link
              href={`/${project.owner}/${project.repo}?type=${project.repo_type}&language=${project.language}`}
              className="flex items-center justify-between"
            >
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-medium text-[var(--link-color)] hover:underline truncate">
                  {project.name}
                </h3>
                <p className="text-xs text-[var(--muted)] mt-1">
                  {t('processedOn')} {new Date(project.submittedAt).toLocaleDateString()} • {project.repo_type} • {project.language}
                </p>
              </div>
              <div className="flex gap-2 ml-4">
                <span className="px-2 py-1 text-xs bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] rounded border border-[var(--accent-primary)]/20">
                  {project.repo_type}
                </span>
              </div>
            </Link>
          </div>
        )
      ))}
    </div>
  );

  return (
    <div className={`${className}`}>
      {showHeader && (
        <header className="mb-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-[var(--accent-primary)]">{t('title')}</h1>
            <Link href="/" className="text-[var(--accent-primary)] hover:underline">
              {t('backToHome')}
            </Link>
          </div>
        </header>
      )}

      {/* Search Bar and View Toggle */}
      <div className="mb-6 flex flex-col sm:flex-row gap-4">
        {/* Search Bar */}
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="input-japanese block w-full pl-4 pr-12 py-2.5 border border-[var(--border-color)] rounded-lg bg-[var(--background)] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]"
          />
          {searchQuery && (
            <button
              onClick={clearSearch}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            >
              <FaTimes className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* View Toggle */}
        <div className="flex items-center bg-[var(--background)] border border-[var(--border-color)] rounded-lg p-1">
          <button
            onClick={() => setViewMode('card')}
            className={`p-2 rounded transition-colors ${
              viewMode === 'card'
                ? 'bg-[var(--accent-primary)] text-white'
                : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)]'
            }`}
            title="Card View"
          >
            <FaTh className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded transition-colors ${
              viewMode === 'list'
                ? 'bg-[var(--accent-primary)] text-white'
                : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)]'
            }`}
            title="List View"
          >
            <FaList className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isLoading && <p className="text-[var(--muted)]">{t('loadingProjects')}</p>}
      {error && <p className="text-[var(--highlight)]">{t('errorLoading')} {error}</p>}

      {!isLoading && !error && (
        <>
          {/* User Repositories Section */}
          {categorizedProjects.hasUserRepos && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-xl font-semibold text-[var(--foreground)]">{t('yourRepositories')}</h2>
                <span className="px-2 py-1 text-xs bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] rounded-full border border-[var(--accent-primary)]/20">
                  {categorizedProjects.userProjects.length}
                </span>
              </div>
              {renderProjectsList(categorizedProjects.userProjects)}
            </div>
          )}

          {/* Contributor Repositories Section */}
          {categorizedProjects.hasCollaboratorRepos && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-xl font-semibold text-[var(--foreground)]">{t('yourContributorRepositories')}</h2>
                <span className="px-2 py-1 text-xs bg-[var(--highlight)]/10 text-[var(--highlight)] rounded-full border border-[var(--highlight)]/20">
                  {categorizedProjects.collaboratorProjects.length}
                </span>
              </div>
              {renderProjectsList(categorizedProjects.collaboratorProjects, false)}
            </div>
          )}

          {/* Other Repositories Section */}
          {categorizedProjects.otherProjects.length > 0 && (
            <div>
              {(categorizedProjects.hasUserRepos || categorizedProjects.hasCollaboratorRepos) && (
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-xl font-semibold text-[var(--foreground)]">{t('otherRepositories')}</h2>
                  <span className="px-2 py-1 text-xs bg-[var(--background)] text-[var(--muted)] rounded-full border border-[var(--border-color)]">
                    {categorizedProjects.otherProjects.length}
                  </span>
                </div>
              )}
              {renderProjectsList(categorizedProjects.otherProjects, false)}
            </div>
          )}

          {/* No Results Messages */}
          {projects.length > 0 && categorizedProjects.userProjects.length === 0 && categorizedProjects.collaboratorProjects.length === 0 && categorizedProjects.otherProjects.length === 0 && searchQuery && (
            <p className="text-[var(--muted)]">{t('noSearchResults')}</p>
          )}

          {projects.length === 0 && (
            <p className="text-[var(--muted)]">{t('noProjects')}</p>
          )}
        </>
      )}
    </div>
  );
}
