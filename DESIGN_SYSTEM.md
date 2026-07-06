# DESIGN SYSTEM

## Filosofía

SELPA es una app deportiva/social para jugadores de pádel. No debe sentirse como un sistema administrativo adaptado a celular.

La experiencia se diseña primero para mobile y después se expande a desktop.

Regla principal:

> Si un jugador parado al costado de la cancha usa SELPA con una mano durante menos de 20 segundos, debe entender qué pasa y qué puede hacer.

## Jerarquía Visual

- Una pantalla debe tener un protagonista.
- La acción principal debe ser evidente.
- El primer pantallazo debe responder: dónde estoy, qué importa ahora y qué hago.
- Los datos secundarios acompañan, no compiten.
- Evitar múltiples botones con el mismo peso visual.

## Densidad de Información

- Compacto no significa chico: significa más valor con menos ruido.
- Mostrar primero lo importante.
- Usar información progresiva para detalles.
- Evitar cards gigantes, paddings excesivos y bloques con poco valor.

## Espaciados

- Mobile: paddings compactos, generalmente `8px` a `16px`.
- Desktop: aprovechar espacio sin inflar componentes.
- Mantener gaps consistentes entre grupos relacionados.
- Separar secciones con aire, no con contenedores innecesarios.

## Tipografía

- Títulos fuertes, compactos y con buena jerarquía.
- Texto de apoyo corto, gris/azulado y legible.
- Labels en peso medio/alto, sin exceso de uppercase.
- Evitar hero text gigante salvo en landing pública.
- No usar letter spacing negativo.

## Colores Oficiales

- Navy principal: base premium para fondos oscuros y botones principales.
- Cyan SELPA: acento, líneas, foco y estados positivos.
- Magenta SELPA: acento secundario, gradientes sutiles y detalles.
- Blanco/gris claro: superficies principales.
- Gris azulado oscuro: navbar/footer.

Regla: cyan y magenta son acentos. No usar grandes superficies saturadas.

## Glass

- Usar glass con moderación.
- Fondos translúcidos sobre navy o superficies claras.
- Blur sutil.
- Bordes suaves con baja opacidad.
- Evitar efecto neón o gamer.

## Botones

- Botón principal: navy/oscuro, texto blanco, radio alto, hover suave.
- Botón secundario: claro, borde sutil, texto navy.
- CTA mobile: cómodo para tocar, no gigante.
- Hover: leve elevación, sombra suave, flecha con desplazamiento corto.
- No animar opacity en botones principales si genera parpadeos.

## Cards

- Fondo blanco o neutral.
- Border suave.
- Radius moderado.
- Sombra liviana.
- Acentos con línea fina, badge o glow sutil.
- En mobile deben ser compactas y escaneables.
- No usar degradados pastel grandes ni estética infantil.

## Formularios

- Inputs de altura cómoda.
- Labels claros: `Email`, `Contraseña`, etc.
- Focus con borde/glow cyan sutil.
- Mensajes de ayuda breves.
- Formularios mobile más compactos que desktop.
- Evitar layouts largos si se puede agrupar.

## Sombras y Bordes

- Sombras suaves, más cercanas a producto premium que a dashboard pesado.
- Bordes de baja opacidad.
- Radius común entre `12px` y `20px` según jerarquía.
- Cards repetidas: radius más contenido.
- Modales/paneles: radius mayor, pero sin exagerar.

## Iconografía

- Usar iconos simples y reconocibles.
- Preferir `lucide-react` o el set existente.
- Iconos solos necesitan contexto o aria-label.
- En mobile los iconos no deben competir con texto clave.

## Animaciones

- Transiciones cortas: `160ms` a `240ms`.
- Hover/focus suave.
- Movimiento mínimo: lift, desplazamiento de flecha, carga de línea.
- Evitar animaciones decorativas grandes.
- Nada de efectos neón, rebotes o movimiento infantil.

## Skeletons y Loading

- Cargas discretas.
- Preferir skeletons compactos sobre textos largos.
- Mantener espacio estable para evitar saltos.
- Si la pantalla requiere sesión, el estado debe ser claro y breve.

## Estados Vacíos

- Mensaje corto.
- Explicar qué falta y cuál es el próximo paso.
- No mostrar placeholders falsos en producción.
- En home pública, ocultar secciones vacías cuando corresponda.

## Responsive

- Mobile first real: 360px, 390px y 430px son obligatorios.
- Tablet: dos columnas solo si respira.
- Desktop: usar ancho máximo ordenado.
- Evitar scroll horizontal.
- Botones full width solo cuando mejora el uso con una mano.
- Navbar mobile debe sentirse como app, no como web comprimida.

## Accesibilidad

- Contraste suficiente.
- Targets táctiles cómodos.
- Estados focus visibles.
- Aria-label en iconos/botones sin texto.
- No depender solo del color para comunicar estado.
- Texto sin truncar cuando la comprensión dependa de él.

## Qué NO Hacer

- No diseñar primero desktop y luego achicar.
- No crear pantallas tipo formulario administrativo si el usuario es jugador.
- No usar grandes manchas cyan/magenta.
- No usar degradados pastel infantiles.
- No agregar features durante sprints de UX.
- No tocar backend, queries, rutas ni Supabase durante polish visual.
- No duplicar navegación fuera de `lib/navConfig.ts`.
- No avanzar a otra pantalla sin validación del usuario.
