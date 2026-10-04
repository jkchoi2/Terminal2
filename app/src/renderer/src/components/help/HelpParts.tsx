import type { ReactNode } from 'react'

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }): JSX.Element {
  return (
    <section id={`help-${id}`} className="help-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

/** Simple table; cells are plain text rendered in monospace when they look like code. */
export function Table({ head, rows }: { head?: string[]; rows: string[][] }): JSX.Element {
  return (
    <table className="help-table">
      {head && (
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j} className={j === 0 && head ? 'mono' : j === 0 ? 'key' : ''}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
