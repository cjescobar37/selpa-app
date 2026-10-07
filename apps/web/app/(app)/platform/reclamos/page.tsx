import Link from 'next/link'
import PageHeader from '@/components/navigation/PageHeader'
import styles from '@/components/product/ProductFlow.module.css'

export default function PlatformReclamosPage() {
  return <main className={styles.page}><PageHeader backHref="/platform" title="Consultas de pagos" description="Revisá la facturación o contactá al usuario por Mensajes." /><section className={styles.panel}><p>SELPA todavía no tiene un sistema de tickets de reclamos. No se registrarán ni resolverán reclamos desde esta pantalla.</p><div className={styles.actions}><Link className={styles.button} href="/platform/facturacion">Ver facturación</Link><Link className={styles.link} href="/platform/mensajes">Abrir mensajes</Link></div></section></main>
}
