import Link from 'next/link'
import PageHeader from '@/components/navigation/PageHeader'
import styles from '@/components/product/ProductFlow.module.css'

export default function TorneosReglamentoPage() {
  return (
    <main className={styles.page}>
      <PageHeader backHref="/torneos" title="Reglamento" description="Consultá las reglas del club organizador antes de inscribirte." />

      <div className="px-card px-cardTopAccent px-sectionCard">
        <h2 className="px-cardTitle">Reglamento general</h2>
        <p className="px-muted" style={{ marginTop: 8 }}>
          El reglamento de cada torneo lo publica su club organizador. Entrá al perfil público del club para consultar el documento disponible o sus datos de contacto. Si no hay un documento publicado, consultá al club antes de inscribirte.
        </p>
        <div className="px-pageActions">
          <Link className={styles.button} href="/clubes">Buscar club organizador</Link>
          <Link className={styles.link} href="/torneos">Ver torneos</Link>
        </div>
      </div>
    </main>
  )
}
