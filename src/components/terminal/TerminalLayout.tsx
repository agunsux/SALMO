'use client';

import React, { useState } from 'react';
import { TerminalSidebar } from '@/components/terminal/TerminalSidebar';
import { TopUtilityBar } from '@/components/terminal/TopUtilityBar';
import { TerminalFooter } from '@/components/terminal/TerminalFooter';

interface TerminalLayoutProps {
  children: React.ReactNode;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  selectedLeague?: string;
  onLeagueChange?: (league: string) => void;
  selectedDate?: string;
  onDateChange?: (date: string) => void;
  showFilters?: boolean;
}

export const TerminalLayout: React.FC<TerminalLayoutProps> = ({
  children,
  searchQuery,
  onSearchChange,
  selectedLeague,
  onLeagueChange,
  selectedDate,
  onDateChange,
  showFilters = true
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-terminal-canvas text-terminal-textPrimary flex">
      {/* Desktop & Mobile Sidebar */}
      <TerminalSidebar
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Main Terminal Viewport */}
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden pb-16 md:pb-0">
        <TopUtilityBar
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          selectedLeague={selectedLeague}
          onLeagueChange={onLeagueChange}
          selectedDate={selectedDate}
          onDateChange={onDateChange}
          onToggleMobileMenu={() => setMobileMenuOpen(true)}
          showFilters={showFilters}
        />

        <main className="flex-1 px-3 sm:px-6 py-5 max-w-7xl mx-auto w-full">
          {children}
        </main>

        <TerminalFooter />
      </div>
    </div>
  );
};
