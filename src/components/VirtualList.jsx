/**
 * @file src/components/VirtualList.jsx
 * @version 2.4.0
 */
import React, { useEffect, useRef, useState } from 'react';

export const __version__ = '2.4.0';

export default function VirtualList({ items, itemHeight = 68, overscan = 8, renderItem }) {
    const containerRef = useRef(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(800);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) {
            return;
        }
        setViewportHeight(el.clientHeight || 800);

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setViewportHeight(entry.contentRect.height);
            }
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    // Reset scroll position when the dataset changes drastically (e.g., tab switch)
    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.scrollTop = 0;
            setScrollTop(0);
        }
    }, [items]);

    const totalHeight = items.length * itemHeight;
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
        items.length - 1,
        Math.ceil((scrollTop + viewportHeight) / itemHeight) + overscan
    );

    const visibleItems = [];
    for (let i = startIndex; i <= endIndex; i++) {
        visibleItems.push(
            <div
                key={items[i].id ?? i}
                style={{
                    position: 'absolute',
                    top: i * itemHeight,
                    left: 0,
                    right: 0,
                    height: itemHeight,
                }}>
                {renderItem(items[i], i)}
            </div>
        );
    }

    return (
        <main
            ref={containerRef}
            className="content-scroll"
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            style={{ position: 'relative' }}>
            <div style={{ height: totalHeight, position: 'relative', width: '100%' }}>
                {visibleItems}
            </div>
        </main>
    );
}
