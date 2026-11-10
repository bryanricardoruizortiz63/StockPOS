---
name: StockPOS
description: POS, inventario, ponches y nómina para tiendas pequeñas de Puerto Rico, con piel de calle del Viejo San Juan.
colors:
  adoquin: "#2b3a52"
  adoquin-deep: "#1f2b3f"
  adoquin-soft: "#3b4c68"
  adoquin-line: "#4a5b78"
  on-adoquin: "#f6f4ef"
  on-adoquin-2: "#c4ccda"
  cal: "#f6f4ef"
  cal-2: "#ece8df"
  cal-3: "#e2ddd1"
  line: "#d6d0c3"
  surface: "#ffffff"
  ink: "#1d2433"
  ink-2: "#4a5468"
  ink-3: "#6b7486"
  bad: "#b42318"
  bad-deep: "#912018"
  bad-wash: "#fdecea"
  warn: "#a15c07"
  warn-wash: "#fdf3dc"
  good: "#1f7a4d"
  good-wash: "#e3f3ea"
  facade-coral: "#e58a70"
  facade-coral-deep: "#a8432c"
  facade-coral-wash: "#fbe9e3"
  facade-mango: "#f1b84a"
  facade-mango-deep: "#8a5a0b"
  facade-mango-wash: "#fdf1d8"
  facade-turquesa: "#57bdb6"
  facade-turquesa-deep: "#146b67"
  facade-turquesa-wash: "#def3f1"
  facade-verdemar: "#74bb8e"
  facade-verdemar-deep: "#2b6a43"
  facade-verdemar-wash: "#e2f2e7"
  facade-lila: "#b19bd8"
  facade-lila-deep: "#634994"
  facade-lila-wash: "#eee8f7"
  facade-rosa: "#ec9db0"
  facade-rosa-deep: "#9e3753"
  facade-rosa-wash: "#fae6eb"
typography:
  display:
    fontFamily: "Figtree Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "'tnum' 1"
  headline:
    fontFamily: "Figtree Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Figtree Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.4
  body:
    fontFamily: "Figtree Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Figtree Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
  figure:
    fontFamily: "Figtree Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.2
    fontFeature: "'tnum' 1"
rounded:
  sm: "8px"
  md: "12px"
  tile: "14px"
  lg: "16px"
  sheet: "24px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.adoquin}"
    textColor: "{colors.on-adoquin}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.adoquin-deep}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.cal-2}"
  button-ghost:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "36px"
  button-danger:
    backgroundColor: "{colors.bad}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "44px"
  button-danger-hover:
    backgroundColor: "{colors.bad-deep}"
  pay-button:
    backgroundColor: "{colors.adoquin}"
    textColor: "{colors.on-adoquin}"
    rounded: "{rounded.md}"
    height: "64px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "44px"
  chip-category:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "36px"
  chip-category-active:
    backgroundColor: "{colors.adoquin}"
    textColor: "{colors.on-adoquin}"
  badge-facade:
    backgroundColor: "{colors.facade-coral-wash}"
    textColor: "{colors.facade-coral-deep}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
  product-tile:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tile}"
    padding: "12px"
  sheet:
    backgroundColor: "{colors.cal}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
  rail:
    backgroundColor: "{colors.adoquin}"
    textColor: "{colors.on-adoquin-2}"
    width: "240px"
  rail-link-active:
    backgroundColor: "{colors.cal}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "40px"
  facade-band:
    backgroundColor: "{colors.facade-coral}"
    textColor: "{colors.ink}"
    height: "56px"
---

# Design System: StockPOS

## Overview

**Creative North Star: "Calle del Viejo San Juan"**

StockPOS se siente como una calle del Viejo San Juan sin disfrazarse de postal: el armazón es adoquín azul pizarra, el suelo es cal cálida, y cada tienda tiene su fachada de color. El color de fachada es identidad, no decoración: pinta la franja superior, la selección y los acentos de la tienda activa, y al cambiar de tienda la franja se repinta (520 ms, ease-out expo). El cajero sabe dónde está por el color antes de leer el nombre.

Es una herramienta de mostrador en modo operación: densidad media, objetivos táctiles de 44 px o más, cifras tabulares grandes y un TOTAL que se lee desde un paso atrás. Rechaza el gris con un solo acento típico de la categoría; el contraste viene del par adoquín/cal, no de bordes ni sombras. Rojo, ámbar y verde existen solo para decir algo (agotado, bajo alerta, cambio a devolver), nunca como adorno.

**Key Characteristics:**
- Rail y botones de acción en adoquín; lienzo en cal; superficies de trabajo en blanco con un anillo de línea fino.
- Seis fachadas por tienda (coral, mango, turquesa, verde mar, lila, rosa) que cambian el acento entero vía `data-facade` en `<html>`.
- Una sola familia, Figtree Variable, con cifras tabulares en todo número de dinero o cantidad.
- Plano por defecto; sombra solo para lo que flota (hoja, barra de carrito, toast) o responde al hover.
- Movimiento corto y firme (150-520 ms, `cubic-bezier(0.16, 1, 0.3, 1)`), anulado con reduced motion.

## Colors

Pizarra y cal como estructura fija, una fachada cálida o fresca por tienda como única voz, y un trío de estado reservado al significado.

### Primary
- **Adoquín Pizarra** (adoquin): rail lateral, barra inferior móvil, botón primario, botones de pago (Efectivo / ATH Móvil / Tarjeta), chip de categoría activo y la tarjeta del total en Cobrar. Es el color de "hacer".
- **Adoquín Hondo** (adoquin-deep): hover/active de todo lo adoquín; base del velo de los diálogos.
- **Adoquín Suave** (adoquin-soft) y **Junta de Adoquín** (adoquin-line): hover de enlaces del rail y divisor del pie del rail / barra de desplazamiento dentro del rail.

### Secondary: la fachada de la tienda
Cada tienda define un trío fill / deep / wash; la app lee siempre `--facade`, `--facade-deep`, `--facade-wash` y el tema cambia con `data-facade`. Coral es el valor por defecto.

- **Fachada (fill)** (facade-coral, -mango, -turquesa, -verdemar, -lila, -rosa): franja superior, anillo de selección (3 px) de productos en el carrito y del método de pago elegido, contador del producto, avatar, barras de reportes, top 3 del ranking, `::selection`, ítem activo de la barra inferior sobre adoquín. Texto encima siempre en tinta, nunca blanco.
- **Fachada Honda** (facade-*-deep): anillo de foco (2.5 px), caret, foco de inputs, y acento pequeño: iconos de encabezado de panel, "Hoy", enlaces de texto secundarios, icono activo del rail, texto de badge/banner de fachada.
- **Fachada Lavada** (facade-*-wash): fondo de badges y banners de fachada, contenedor de icono en estados vacíos, fondo del método de pago seleccionado, bloques de horario.

### Tertiary: estado
- **Rojo Alerta** (bad / bad-wash; hover de peligro bad-deep): agotado, errores, contador de avisos sin leer, acción destructiva.
- **Ámbar Bajo** (warn / warn-wash): producto en o bajo su alerta, falta de precio, turno sin abrir.
- **Verde Cuadre** (good / good-wash): cambio a devolver, venta completada, turno abierto.

### Neutral
- **Cal** (cal): fondo de la app, hoja de diálogo, ítem activo del rail, texto sobre adoquín (on-adoquin comparte valor).
- **Cal Gastada** (cal-2) y **Cal Vieja** (cal-3): pistas de segmentado y barras, stepper de cantidad, hover de secundarios, estado deshabilitado, barra de desplazamiento.
- **Junta** (line): anillos de inputs, paneles (al 70%) y tiles; divisores de tabla (al 60%).
- **Blanco Mostrador** (surface): paneles, tiles de producto, inputs, columna del carrito.
- **Tinta** (ink), **Tinta 2** (ink-2), **Tinta 3** (ink-3): texto principal, secundario/descripciones, terciario/placeholder/metadatos.
- **Cal en Adoquín 2** (on-adoquin-2): texto inactivo y etiquetas de grupo en el rail.

### Named Rules
**The Fill-Selects, Deep-Points Rule.** Selección y estado activo usan el relleno de fachada (`ring-facade`, `bg-facade` con texto tinta). La fachada honda queda para foco, caret y texto o icono de acento pequeño; nunca como relleno de selección, porque los tonos hondos (terracota, ocre, verde botella) se confunden con rojo, ámbar y verde de estado.

**The Status-Means-Something Rule.** Rojo, ámbar y verde solo aparecen cuando hay un estado que comunicar. Nunca como color de categoría, decoración ni segunda marca.

**The One Facade Rule.** En pantalla solo vive la fachada de la tienda activa. Nada hardcodea un hex de fachada; todo lee las variables para que el cambio de tienda repinte la app completa.

## Typography

**Display Font:** Figtree Variable (con ui-sans-serif, system-ui), autoalojada vía @fontsource.
**Body Font:** Figtree Variable.

**Character:** Una sans geométrica amable y legible a distancia, con peso 600-700 para todo lo que se toca o se cobra. La jerarquía sale del tamaño y del peso, no de cambiar de familia.

### Hierarchy
- **Display** (700, 48 px en el carrito, 44 px en Cobrar, 64 px para el cambio; interlineado 1; tracking -0.02 a -0.03em; tabular): solo cifras de dinero que deciden la venta: TOTAL y cambio.
- **Headline** (700, 24 px móvil / 28 px desde sm, tracking -0.01em, text-balance): título de página.
- **Title** (700, 18 px en hojas y "Venta actual"; 16 px en encabezados de panel): encabezados de contenedor.
- **Body** (400, 15 px, 1.5): texto de la app; descripciones limitadas a 65ch (vacíos 46ch).
- **Label** (600, 14 px): etiquetas de campo, chips, segmentado, encabezados de tabla; badges a 12 px 600. Sin mayúsculas forzadas ni tracking ancho.
- **Figure** (700, 20-24 px, tabular): precio del tile (20 px), estadísticas de reporte (24 px), cantidad de inventario (18 px).

### Named Rules
**The Tabular Money Rule.** Todo número de dinero, cantidad, porcentaje, código o referencia lleva la clase `.num` (`font-variant-numeric: tabular-nums`). Las columnas de cifras se alinean a la derecha.

**The Big Total Rule.** La cifra que el cajero dice en voz alta (TOTAL, cambio) es el elemento tipográfico más grande de la pantalla; nada compite con ella.

## Layout

Shell de tres piezas: rail adoquín a la izquierda (desde lg, 1024 px), franja de fachada fija arriba (56 px, sticky) y contenido sobre cal. El rail mide 76 px solo-iconos entre lg y xl y 240 px con etiquetas desde xl (1280 px). Por debajo de lg el rail se convierte en barra inferior adoquín de 64 px con cuatro destinos más "Más", que abre una hoja con el rail completo.

- **Páginas de gestión:** columna centrada de máx. 1152 px, padding 16 px (24 px desde sm), arriba 24-32 px; encabezado de página con acciones a la derecha que envuelven.
- **Vender (POS):** sangrado completo. Grilla de productos (2 / 3 / 4 columnas en base / sm / xl, gap 12 px) más columna de carrito blanca fija de 380 px (420 px en xl) con borde izquierdo. En teléfono el carrito pasa a una barra flotante tinta sobre la barra inferior y se abre en hoja.
- **Ritmo:** múltiplos de 4 px; 12 px entre tiles y filas, 16-20 px de padding interno de panel, 24 px entre bloques de página.
- **Alcance del pulgar:** acción principal abajo (botones de pago, "Completar venta" de ancho completo en el pie de la hoja). Áreas seguras respetadas con `env(safe-area-inset-*)`.

## Elevation & Depth

Plano por defecto: la profundidad se construye por tono (cal → blanco → anillo de junta) y por el contraste adoquín/cal. Las sombras existen solo para lo que flota sobre el contenido o como respuesta al hover.

### Shadow Vocabulary
- **Lift** (`box-shadow: 0 1px 2px rgb(29 36 51 / 0.06), 0 6px 18px -8px rgb(29 36 51 / 0.18)`): hover de tile de producto, barra flotante del carrito, toasts, tarjeta del kiosko.
- **Sheet** (`box-shadow: 0 -8px 40px -12px rgb(29 36 51 / 0.35)`): hojas de diálogo, sobre un velo adoquín hondo al 45% con desenfoque de 2 px.
- **Segment thumb** (sombra pequeña de Tailwind `shadow-sm`): solo la pastilla blanca del segmentado y el contador del tile.

### Named Rules
**The Flat-At-Rest Rule.** Paneles, inputs y tiles en reposo no llevan sombra; un anillo de 1 px en junta basta. La sombra aparece solo al flotar o al hover.

## Shapes

Esquinas generosas y consistentes, nunca filosas: 8 px para enlaces del rail y opciones del segmentado, 12 px para botones, inputs, banners y botones de pago, 14 px para el tile de producto, 16 px para paneles y bloques de resumen, 24 px para hojas (solo arriba en móvil), pastilla completa para chips, badges, contadores y el estado de turno. Los bordes son anillos (`ring-1`) más que bordes; el anillo de selección sube a 3 px.

Forma firma: el **toldo de fachada**, una franja de 6 px en color de fachada sobre cada tile de producto sin foto, y su versión vertical (barra de 6 × 36 px redondeada) junto a cada producto en Inventario.

## Components

### Buttons
Firmes y táctiles: peso 600, presión `scale(0.98)`, 150 ms.
- **Shape:** esquinas de 12 px; tamaños 36 / 44 / 56 px de alto (sm / md / lg).
- **Primary:** adoquín con texto cal; hover y active adoquín hondo.
- **Secondary:** blanco con anillo de junta y texto tinta; hover cal gastada. Para acciones de encabezado (PDF, Excel, Alertas, Exportar).
- **Ghost:** texto tinta 2, sin fondo; hover cal gastada. Para "Vaciar", "Añadir sin escanear".
- **Danger:** rojo alerta con texto blanco; hover rojo hondo.
- **Disabled:** opacidad 45%, sin escala. **Busy:** spinner en lugar del icono.

### Pay Buttons
Tres botones adoquín de 64 px en fila (Efectivo / ATH Móvil / Tarjeta), icono sobre etiqueta, radio 12 px. En Cobrar se convierten en pestañas: la elegida toma fondo de fachada lavada, texto tinta y anillo de 3 px de fachada; las demás, blancas con anillo de junta.

### Chips
- **Category chip:** pastilla de 36 px, blanca con anillo de junta y texto tinta 2; la activa es adoquín con texto cal. Fila con scroll horizontal.
- **Quick tender:** botón de 44 px, radio 12 px, cifra tabular; el elegido es tinta con texto cal.
- **Badge:** pastilla 12 px 600 con fondo lavado y texto del tono (neutral, bad, warn, good, facade).

### Cards / Containers
- **Panel:** blanco, radio 16 px, anillo de junta al 70%, sin sombra. Encabezado opcional (título 16 px bold, divisor de junta) con padding 20 × 14 px.
- **Banner:** radio 12 px, fondo lavado del tono, texto del tono a 14 px 500, acción a la derecha.
- **Empty state:** icono en cuadro lavado de fachada de 56 px, título 18 px bold, texto tinta 2 a 46ch, acción primaria.

### Inputs / Fields
- **Style:** 44 px de alto (56 px para montos de efectivo, a 24 px bold), blanco, radio 12 px, anillo de junta, placeholder tinta 3. El buscador del POS sube a 48 px con icono a la izquierda.
- **Focus:** anillo de 2 px en fachada honda, sin outline nativo. Caret en fachada honda.
- **Field:** etiqueta 14 px 600 arriba ("(opcional)" en tinta 3), pista en tinta 2 o error en rojo con `role="alert"`.
- **Money input:** prefijo "$" en tinta 3, valor tabular.
- **Disabled:** fondo cal gastada.

### Navigation
- **Rail:** adoquín, logotipo y "StockPOS" en 18 px bold arriba, grupos (Tienda, Personal, Sistema) con etiqueta 12 px 600 en on-adoquin-2 al 80%. Enlaces de 40 px, 15 px 500, texto on-adoquin-2; hover adoquín suave con texto cal. **Activo:** fondo cal, texto tinta, icono en fachada honda. Pie con avatar circular en fachada y cierre de sesión.
- **Bottom bar (móvil):** adoquín de 64 px, icono sobre etiqueta 11 px 600; activo en fachada (relleno) sobre adoquín.
- **Facade band:** franja de 56 px en fachada, texto tinta: icono de tienda, selector de tienda en negrita, IVU, pastilla de turno (blanco al 55% con punto verde si abierto; tinta con punto de fachada si no) y campana con contador rojo.

### Segmented control
Pista cal gastada de radio 12 px con padding 4 px; opciones de 36 px; la elegida es una pastilla blanca con texto tinta y sombra pequeña. Para periodos de reporte (Día / Semana / Mes / Año).

### Product Tile (signature)
Botón blanco de radio 14 px y anillo de junta al 70%, con toldo de fachada de 6 px (o foto 5:3). Nombre 15 px 600 a dos líneas, precio 20 px bold tabular abajo a la izquierda, existencias 12 px 600 abajo a la derecha (tinta 3, ámbar si bajo, rojo "Agotado"). En el carrito: anillo de fachada de 3 px y contador en pastilla de fachada con texto tinta que hace "pop" (240 ms). Hover: sombra lift. Agotado: deshabilitado al 50%.

### Sheet
`<dialog>` modal: desde abajo en móvil (radio 24 px arriba, máx. 92dvh), centrado desde sm (512 px; 768 px el ancho). Fondo cal, encabezado con título 18 px bold y botón cerrar circular de 40 px, pie blanco translúcido con la acción principal a ancho completo. Entrada `sheet-in` de 260 ms.

### Total block
El total del carrito vive en un pie cal sobre la columna blanca: subtotal e IVU a 15 px en tinta 2, TOTAL a 48 px bold. En Cobrar, el mismo total va en una tarjeta adoquín (radio 16 px) a 44 px; el cambio, en un bloque verde lavado a 40 px, y la confirmación en verde a 64 px.

## Do's and Don'ts

### Do:
- **Do** leer el acento siempre de `--facade`, `--facade-deep` y `--facade-wash`; una pantalla nueva debe verse bien en las seis fachadas.
- **Do** marcar selección con relleno de fachada (anillo de 3 px o fondo de fachada con texto tinta) y foco con un anillo de 2-2.5 px en fachada honda.
- **Do** poner `.num` en toda cifra y alinear a la derecha las columnas de dinero y cantidad.
- **Do** usar adoquín para la acción principal y para los botones de pago; blanco con anillo de junta para acciones secundarias.
- **Do** mantener objetivos táctiles de 44 px o más (40 px en navegación densa) y la acción principal al alcance del pulgar.
- **Do** construir profundidad con tono (cal, blanco, anillo de junta) y reservar las sombras lift y sheet para lo que flota.

### Don't:
- **Don't** usar la fachada honda como relleno de selección, de botón o de bloque grande; se confunde con rojo, ámbar y verde de estado.
- **Don't** usar rojo, ámbar o verde sin un estado detrás (agotado, bajo alerta, error, cambio, turno abierto).
- **Don't** poner texto blanco sobre el relleno de fachada; mango y turquesa no lo sostienen. Texto tinta siempre.
- **Don't** hardcodear un hex de fachada ni mezclar dos fachadas en la misma pantalla.
- **Don't** añadir una segunda familia tipográfica ni etiquetas en mayúsculas con tracking ancho; la jerarquía es tamaño y peso de Figtree.
- **Don't** dar sombra a paneles, inputs o tiles en reposo.
