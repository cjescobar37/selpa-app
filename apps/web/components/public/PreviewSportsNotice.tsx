import Link from 'next/link'
import styles from './PreviewSportsNotice.module.css'
export default function PreviewSportsNotice({demo=false}:{demo?:boolean}){
  return <aside role="note" data-preview-demo={demo?'active':'available'} className={styles.notice}>
    <strong>{demo?'DEMO · DATOS FICTICIOS':'PREVIEW · Lectura deportiva pendiente'}</strong>
    <p>{demo?'Vista de muestra sin datos reales, consultas a Supabase ni operaciones deportivas.':'Sin ejecutar las migraciones pendientes no se publican datos deportivos privados. Podés revisar el diseño en una DEMO separada.'}</p>
    <nav aria-label="Demostración deportiva">
      <Link href="/preview/demo">{demo?'Ranking DEMO':'Ver DEMO deportiva'}</Link>
      {demo?<><Link href="/preview/demo?view=profile">Perfil DEMO</Link><Link href="/ranking">Salir de DEMO</Link></>:null}
    </nav>
  </aside>
}
