import SelpaLoader from '@/components/SelpaLoader'
import styles from './PublicPageLoading.module.css'

export default function PublicPageLoading({ title = 'Cargando SELPA...', subtitle = 'Buscando torneos y clubes' }: { title?: string; subtitle?: string }) {
  return <div className="px-wrap px-publicFrame"><div className={styles.frame}><SelpaLoader title={title} subtitle={subtitle} /></div></div>
}
