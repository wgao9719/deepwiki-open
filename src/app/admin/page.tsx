'use client';

import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import ProcessedProjects from '@/components/ProcessedProjects';
import { useLanguage } from '@/contexts/LanguageContext';
import Link from 'next/link';
import { FaHome, FaCrown } from 'react-icons/fa';
import ThemeToggle from '@/components/theme-toggle';
import UserMenu from '@/components/UserMenu';

export default function AdminPage() {
  const { user, isAdmin, loading } = useAuth();
  const { messages } = useLanguage();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      router.push('/');
    }
  }, [user, isAdmin, loading, router]);

  if (loading) {
    return (
      <div className="h-screen paper-texture p-4 md:p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500 mx-auto mb-4"></div>
          <p className="text-[var(--muted)]">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return null;
  }

  return (
    <div className="h-screen paper-texture p-4 md:p-8 flex flex-col">
      {/* Header */}
      <header className="max-w-full mx-auto mb-6 h-fit w-full">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-[var(--card-bg)] rounded-lg shadow-custom border border-[var(--border-color)] p-4">
          <div className="flex items-center">
            <div className="bg-[var(--highlight)] p-2 rounded-lg mr-3">
              <FaCrown className="text-2xl text-white" />
            </div>
            <div className="mr-6">
              <h1 className="text-xl md:text-2xl font-bold text-[var(--highlight)]">Administrator Panel</h1>
              <p className="text-xs text-[var(--muted)] whitespace-nowrap">Manage all system repositories and settings</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <Link href="/" className="text-[var(--accent-primary)] hover:text-[var(--highlight)] flex items-center gap-1.5 transition-colors border-b border-[var(--border-color)] hover:border-[var(--accent-primary)] pb-0.5">
              <FaHome /> Back to Home
            </Link>
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-full mx-auto">
          <div className="bg-[var(--card-bg)] rounded-lg shadow-custom border border-[var(--border-color)] p-6">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-[var(--foreground)] mb-2">All Processed Repositories</h2>
              <p className="text-[var(--muted)]">
                As an administrator, you can view and manage all processed repositories in the system. 
                Use the delete buttons to remove any repository from the cache.
              </p>
            </div>
            
            {/* Processed Projects with admin privileges */}
            <ProcessedProjects 
              showHeader={false}
              messages={messages}
              className="w-full"
            />
          </div>
        </div>
      </main>
    </div>
  );
} 