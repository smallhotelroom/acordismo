/**
 * @file src/main.jsx
 * @version 2.2.0
 */
import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

export const __version__ = '2.2.0';

// 1. Catch fatal module/window errors that happen outside React
function showFatalErrorOverlay(title, detail) {
    const rootEl = document.getElementById('root');
    if (!rootEl) {
        return;
    }
    rootEl.innerHTML = `
        <div style="padding: 20px; font-family: monospace; background: #fff1f2; color: #881337; height: 100vh; overflow: auto;">
            <h2 style="margin-top: 0;">${title}</h2>
            <pre style="white-space: pre-wrap; word-break: break-word; background: #ffe4e6; padding: 12px; border-radius: 6px;">${detail}</pre>
        </div>
    `;
}

window.addEventListener('error', (event) => {
    showFatalErrorOverlay(
        'Uncaught Runtime / Module Error',
        `${event.message}\nAt: ${event.filename}:${event.lineno}:${event.colno}\n\n${event.error?.stack || ''}`
    );
});

window.addEventListener('unhandledrejection', (event) => {
    showFatalErrorOverlay(
        'Unhandled Promise Rejection',
        `${event.reason?.stack || event.reason || 'Unknown async error'}`
    );
});

// 2. React Error Boundary for component render crashes
class RootErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('React ErrorBoundary caught:', error, errorInfo);
    }

    render() {
        if (this.state.error) {
            return (
                <div
                    style={{
                        padding: 20,
                        fontFamily: 'monospace',
                        background: '#fff1f2',
                        color: '#881337',
                        height: '100vh',
                        overflow: 'auto',
                    }}>
                    <h2 style={{ marginTop: 0 }}>React Render Error</h2>
                    <pre
                        style={{
                            whiteSpace: 'pre-wrap',
                            background: '#ffe4e6',
                            padding: 12,
                            borderRadius: 6,
                        }}>
                        {this.state.error?.stack || String(this.state.error)}
                    </pre>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            padding: '8px 16px',
                            background: '#be123c',
                            color: 'white',
                            border: 'none',
                            borderRadius: 4,
                            cursor: 'pointer',
                        }}>
                        Reload App
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <RootErrorBoundary>
            <App />
        </RootErrorBoundary>
    </StrictMode>
);
