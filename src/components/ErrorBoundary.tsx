import { Component, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

interface State {
  error: Error | null
}

class Boundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('Fallo al mostrar la pantalla', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="page">
        <div className="card pad stack" role="alert">
          <h2>Algo ha fallado en esta pantalla</h2>
          <span className="small muted">El resto de la app sigue funcionando. Puedes volver al inicio o recargar.</span>
          <code className="xs" style={{ color: 'var(--danger)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {error.message}
          </code>
          <div className="row wrap">
            <button className="btn primary" onClick={() => this.setState({ error: null })}>
              Reintentar
            </button>
            <a className="btn" href="#/">
              Ir a Hoy
            </a>
            <button className="btn ghost" onClick={() => location.reload()}>
              Recargar
            </button>
          </div>
        </div>
      </div>
    )
  }
}

/** Un fallo al pintar una pantalla ya no deja la app en negro: se muestra un aviso y la barra lateral sigue. */
export function ErrorBoundary({ children }: { children: ReactNode }) {
  const loc = useLocation()
  // Al cambiar de pantalla se vuelve a intentar.
  return <Boundary key={loc.pathname + loc.search}>{children}</Boundary>
}
