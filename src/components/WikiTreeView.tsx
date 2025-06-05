'use client';

import React, { useState } from 'react';
import { FaChevronRight, FaChevronDown } from 'react-icons/fa';

// Import interfaces from the page component
interface WikiPage {
  id: string;
  title: string;
  content: string;
  filePaths: string[];
  importance: 'high' | 'medium' | 'low';
  relatedPages: string[];
  parentId?: string;
  isSection?: boolean;
  children?: string[];
}

interface WikiSection {
  id: string;
  title: string;
  pages: string[];
  subsections?: string[];
}

interface WikiStructure {
  id: string;
  title: string;
  description: string;
  pages: WikiPage[];
  sections: WikiSection[];
  rootSections: string[];
}

interface WikiTreeViewProps {
  wikiStructure: WikiStructure;
  currentPageId: string | undefined;
  onPageSelect: (pageId: string) => void;
  messages?: {
    pages?: string;
    [key: string]: string | undefined;
  };
}

const WikiTreeView: React.FC<WikiTreeViewProps> = ({
  wikiStructure,
  currentPageId,
  onPageSelect,
}) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(wikiStructure.rootSections)
  );

  const toggleSection = (sectionId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  };

  const renderSection = (sectionId: string, level = 0) => {
    const section = wikiStructure.sections.find(s => s.id === sectionId);
    if (!section) return null;

    const isExpanded = expandedSections.has(sectionId);

    return (
      <div key={sectionId} className="mb-2">
        <button
          className={`flex items-center w-full text-left px-2 py-1.5 rounded-md text-sm font-medium text-[var(--foreground)] hover:bg-[var(--background)]/70 transition-colors ${
            level === 0 ? 'bg-[var(--background)]/50' : ''
          }`}
          onClick={(e) => toggleSection(sectionId, e)}
        >
          {isExpanded ? (
            <FaChevronDown className="mr-2 text-xs" />
          ) : (
            <FaChevronRight className="mr-2 text-xs" />
          )}
          <span className="truncate">{section.title}</span>
        </button>

        {isExpanded && (
          <div className={`ml-4 mt-1 space-y-1 ${level > 0 ? 'pl-2 border-l border-[var(--border-color)]/30' : ''}`}>
            {/* Render pages in this section */}
            {section.pages.map(pageId => {
              const page = wikiStructure.pages.find(p => p.id === pageId);
              if (!page) return null;

              const isCurrentPage = currentPageId === pageId;

              return (
                <button
                  key={pageId}
                  className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors ${
                    isCurrentPage
                      ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-600 font-medium'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 border border-transparent'
                  }`}
                  onClick={() => onPageSelect(pageId)}
                >
                  <div className="flex items-center">
                    <div
                      className={`w-2 h-2 rounded-full mr-2 flex-shrink-0 ${
                        page.importance === 'high'
                          ? 'bg-[#9b7cb9]'
                          : page.importance === 'medium'
                          ? 'bg-[#d7c4bb]'
                          : 'bg-[#e8927c]'
                      }`}
                    ></div>
                    <span className="truncate">{page.title}</span>
                  </div>
                </button>
              );
            })}

            {/* Render subsections recursively */}
            {section.subsections?.map(subsectionId =>
              renderSection(subsectionId, level + 1)
            )}
          </div>
        )}
      </div>
    );
  };

  // If there are no sections defined yet, or if sections/rootSections are empty arrays, fall back to the flat list view
  if (!wikiStructure.sections || wikiStructure.sections.length === 0 || !wikiStructure.rootSections || wikiStructure.rootSections.length === 0) {
    return (
      <ul className="space-y-2">
        {wikiStructure.pages.map(page => {
          const isSelected = currentPageId === page.id;
          
          return (
            <li key={page.id}>
              <button
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  isSelected
                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-600 font-medium'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 border border-transparent'
                }`}
                onClick={() => onPageSelect(page.id)}
              >
                <div className="flex items-center">
                  <div
                    className={`w-2 h-2 rounded-full mr-2 flex-shrink-0 ${
                      page.importance === 'high'
                        ? 'bg-[#9b7cb9]'
                        : page.importance === 'medium'
                        ? 'bg-[#d7c4bb]'
                        : 'bg-[#e8927c]'
                    }`}
                  ></div>
                  <span className="truncate">{page.title}</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="space-y-1">
      {wikiStructure.rootSections.map(sectionId => {
        const section = wikiStructure.sections.find(s => s.id === sectionId);
        if (!section) {
          return null;
        }
        return renderSection(sectionId);
      })}
    </div>
  );
};

export default WikiTreeView;