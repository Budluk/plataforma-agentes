import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

type BoundaryProps = { children: React.ReactNode };
type BoundaryState = { error: Error | null };

class ErrorBoundary extends React.Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Erro no app gerado:', error);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            padding: 24,
            fontFamily: 'system-ui, sans-serif',
            background: '#0b1020',
            color: '#e9eefb',
          }}
        >
          <div style={{ maxWidth: 560 }}>
            <h1 style={{ fontSize: 22, marginBottom: 12 }}>O app encontrou um erro</h1>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                color: '#fca5a5',
                fontSize: 13,
                background: '#121a2d',
                padding: 16,
                borderRadius: 12,
              }}
            >
              {this.state.error.message}
            </pre>
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: 16,
                padding: '10px 16px',
                borderRadius: 10,
                border: 0,
                background: '#7c9cff',
                color: '#08101f',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
