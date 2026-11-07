/**
 * @file src/components/SearchBar.jsx
 * @version 1.1.0
 * Shared accent-insensitive multi-token search bar with 120ms input debounce and '+ Lyrics' toggle pill.
 */
import React, { useEffect, useState } from 'react';

export const __version__ = '1.1.0';

export default function SearchBar({
    value,
    onChange,
    onClear,
    placeholder = 'Search...',
    showLyricsToggle = false,
    searchInLyrics = false,
    onToggleLyrics = null,
}) {
    const [localValue, setLocalValue] = useState(value);

    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    useEffect(() => {
        if (localValue === value) {
            return;
        }
        // Clear immediately when emptied, otherwise debounce 120ms for smooth 60fps typing
        if (localValue === '') {
            onChange('');
            return;
        }
        const timer = setTimeout(() => {
            onChange(localValue);
        }, 120);
        return () => clearTimeout(timer);
    }, [localValue, value, onChange]);

    const handleClear = () => {
        setLocalValue('');
        if (onClear) {
            onClear();
        } else {
            onChange('');
        }
    };

    return (
        <div className="search-bar" style={{ gap: 8 }}>
            <input
                className="search-input"
                autoFocus
                placeholder={placeholder}
                value={localValue}
                onChange={(e) => setLocalValue(e.target.value)}
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
            <button className="icon-btn" title="Clear search" onClick={handleClear}>
                x
            </button>
        </div>
    );
}
