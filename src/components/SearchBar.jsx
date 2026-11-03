/**
 * @file src/components/SearchBar.jsx
 * @version 1.0.0
 * Shared accent-insensitive multi-token search bar with optional '+ Lyrics' toggle pill.
 */
import React from 'react';

export const __version__ = '1.0.0';

export default function SearchBar({
    value,
    onChange,
    onClear,
    placeholder = 'Search...',
    showLyricsToggle = false,
    searchInLyrics = false,
    onToggleLyrics = null,
}) {
    return (
        <div className="search-bar" style={{ gap: 8 }}>
            <input
                className="search-input"
                autoFocus
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />
            {showLyricsToggle && onToggleLyrics && (
                <button
                    type="button"
                    onClick={onToggleLyrics}
                    title="Also search inside song lyrics"
                    style={{
                        padding: '4px 9px',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        borderRadius: 999,
                        border: searchInLyrics
                            ? '1px solid #2563eb'
                            : '1px solid var(--border-color)',
                        backgroundColor: searchInLyrics ? '#2563eb' : 'transparent',
                        color: searchInLyrics ? '#ffffff' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                    }}>
                    + Lyrics
                </button>
            )}
            <button className="icon-btn" title="Clear search" onClick={onClear}>
                x
            </button>
        </div>
    );
}
