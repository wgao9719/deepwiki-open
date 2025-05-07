'use client';

import React, { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import Link from 'next/link';

export default function TestLanguagePage() {
  const { language, setLanguage } = useLanguage();
  const [browserLanguage, setBrowserLanguage] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setBrowserLanguage(navigator.language || (navigator as any).userLanguage || 'Not detected');
    }
  }, []);

  return (
    <div className="min-h-screen p-8 bg-[var(--card-bg)]">
      <div className="max-w-2xl mx-auto bg-white p-6 rounded-lg shadow-lg">
        <h1 className="text-2xl font-bold mb-6">Language Detection Test</h1>
        
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">Current Settings</h2>
          <p><strong>Current Language:</strong> {language}</p>
          <p><strong>Browser Language:</strong> {browserLanguage}</p>
          <p><strong>localStorage Language:</strong> {typeof window !== 'undefined' ? localStorage.getItem('language') || 'Not set' : 'N/A'}</p>
        </div>
        
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">Change Language</h2>
          <div className="flex gap-2">
            <button 
              onClick={() => setLanguage('en')}
              className={`px-4 py-2 rounded ${language === 'en' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
            >
              English
            </button>
            <button 
              onClick={() => setLanguage('ja')}
              className={`px-4 py-2 rounded ${language === 'ja' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
            >
              Japanese (日本語)
            </button>
            <button 
              onClick={() => setLanguage('zh')}
              className={`px-4 py-2 rounded ${language === 'zh' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
            >
              Chinese (中文)
            </button>
            <button 
              onClick={() => setLanguage('es')}
              className={`px-4 py-2 rounded ${language === 'es' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
            >
              Spanish (Español)
            </button>
          </div>
        </div>
        
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">Test Reset</h2>
          <button 
            onClick={() => {
              if (typeof window !== 'undefined') {
                localStorage.removeItem('language');
                window.location.reload();
              }
            }}
            className="px-4 py-2 bg-red-500 text-white rounded"
          >
            Clear localStorage & Reload
          </button>
        </div>
        <div className="mt-8">
          <Link href="/" className="text-blue-500 hover:underline">Back to Home</Link>
        </div>
        </div>
      </div>
  );
}
