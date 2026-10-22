import styles from '@/components/player/CareerExperience.module.css'
export default function LoadingCareer() {
  return <main className={styles.shell} aria-busy="true" aria-label="Cargando identidad deportiva">
    <section className={styles.hero} aria-hidden="true"><div className={styles.cover}/><div className={styles.heroIntro}>
      <div className={styles.heroAvatar}/><div className={styles.heroName} style={{minHeight:106,width:'60%'}}><i className={styles.skeleton}/></div>
    </div></section>
    <div className={styles.metrics} aria-hidden="true">{['Posición','Puntos','Partidos'].map(label=><div key={label}><span>{label}</span><i className={styles.skeleton}/></div>)}</div>
  </main>
}
