# StockPOS

Inventario, punto de venta, ponches y nómina para tiendas en Puerto Rico. Funciona en teléfono, tablet y computadora (iPhone, Android, Windows, Mac).

Hecho con **Vite + React + TypeScript + Tailwind CSS**. Se instala como app desde el navegador (PWA) y se puede empaquetar como app nativa de iOS/Android con **Capacitor**.

## Empezar

```bash
npm install
```

```bash
npm run dev
```

Abre la dirección que aparece. La primera vez te pide crear el administrador y la primera tienda. En **Configuración › Datos de ejemplo** puedes cargar 10 productos para probar la caja.

```bash
npm test
```

```bash
npm run build
```

## Qué hace

| Área | Qué incluye |
|---|---|
| **Inventario** | Escanear código de barras con la cámara (o escribirlo si falla), descripción, precio en el mercado (opcional), precio de venta, cantidad, categoría y foto (opcional). Entrada de mercancía. Funciona también con lectores USB/Bluetooth. |
| **Alertas** | El admin fija el umbral general de la tienda, por categoría y por producto. Avisos cuando una venta deja un producto bajo. |
| **Caja (POS)** | Carrito, subtotal, IVU configurable por tienda, total. Efectivo con cálculo de cambio y billetes rápidos. ATH Móvil y tarjeta. Cada venta resta del inventario. |
| **Sin cobros duplicados** | Cada venta lleva una llave de idempotencia: el doble toque, un reintento de red o una recarga nunca crean una segunda venta ni un segundo cargo. Una confirmación de ATH Móvil o de tarjeta no se puede usar en dos ventas. |
| **Turnos y cuadre** | El empleado abre turno con su fondo, y al cerrar cuenta el efectivo (con contador de billetes). Tarjetas y ATH se cuadran solos. Al cerrar, el admin recibe un reporte firmado con todas las transacciones y el inventario bajo. |
| **Ponches** | Sticker NFC (Android), QR fijo impreso o QR dinámico que cambia cada 30 s en una tablet del local (ideal para iPhone). Geocerca opcional. Cada ponche queda firmado y encadenado al anterior: si alguien lo altera, se detecta. Cada año la app pide guardar los ponches del año anterior en PDF y Excel. |
| **Horarios** | Fijos o rotativos cada 2–6 semanas, para uno, varios o todos los empleados. Cada empleado ve el suyo. |
| **Nómina** | Horas regulares y extra desde los ponches (reglas configurables: 8 h diarias / 40 h semanales, 1.5×). Paga por hora, extra y plan médico por empleado, editables en grupo. Seguro Social, Medicare, plan médico y deducciones propias (añadir, editar, quitar). Bonos por fecha. Talonarios firmados, enviados por email y descargables. |
| **Certificación de empleo** | El empleado la pide, el admin la aprueba y la carta firmada se envía por email. |
| **Reportes** | Ventas diarias, semanales, mensuales y anuales; por método de pago y por empleado; lo más vendido; **qué comprar más** según los últimos 30 días. PDF y Excel. |
| **Varias tiendas** | Cada tienda con su color, IVU, empleados y productos. Exportar productos a otra tienda: completos, solo la descripción, o transferir existencias. |
| **Acceso** | Empleados: correo + PIN o contraseña. Administradores: contraseña o Face ID / huella, y verificación **una vez al día** con Microsoft Authenticator o biometría. Bloqueo tras 5 intentos fallidos. |
| **Documentos verificables** | Talonarios, cartas, reportes y ponches llevan un código y un QR. En **Verificar documento** se comprueba que son auténticos y no fueron alterados (SHA-256 + firma ECDSA P-256). |

## Estado de las integraciones

La app funciona completa hoy en un solo dispositivo (los datos se guardan en el dispositivo, en IndexedDB). Estas piezas necesitan cuentas o configuración tuya:

| Pieza | Hoy | Para activarla |
|---|---|---|
| **Sincronizar entre dispositivos** (empleado poncha en su teléfono, admin ve en el suyo) | Cada dispositivo tiene sus propios datos. | Crear un proyecto en Supabase y aplicar `supabase/migrations/0001_stockpos.sql`. Falta conectar la capa de datos de la app a Supabase (siguiente paso). |
| **Emails** (talonarios, cartas, reportes de turno) | Se guardan en **Correos enviados** con su PDF; se pueden descargar o abrir en tu correo. | Desplegar `supabase/functions/send-email` con `RESEND_API_KEY` y `MAIL_FROM`, y poner `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. |
| **ATH Móvil** | Modo manual: el cliente paga a la cuenta ATH Business y el cajero escribe la referencia. | Poner `VITE_ATHM_PUBLIC_TOKEN` (ATH Business). La app envía el cobro al teléfono del cliente y adjunta la referencia sola. **Verifica los endpoints de `src/lib/payments/athmovil.ts` con la documentación vigente de ATH Business antes de producción.** |
| **Tarjetas contactless** | Se cobra en una terminal externa y se registra el número de autorización. | App nativa con Capacitor + plugin `@capacitor-community/stripe-terminal`, cuenta de Stripe, y desplegar `supabase/functions/stripe-terminal` con `STRIPE_SECRET_KEY`. Poner `VITE_STRIPE_TERMINAL_BACKEND`. |
| **Face ID / huella** | Funciona en el navegador con passkeys (WebAuthn). | En la app nativa, instalar `@capgo/capacitor-native-biometric`. |
| **NFC en iPhone** | iPhone usa el QR (Safari no lee NFC). | En la app nativa, un plugin NFC de Capacitor. |

Copia `.env.example` a `.env` y llena lo que vayas a usar.

## App nativa (iOS / Android)

```bash
npm run build
```

```bash
npx cap add ios
```

```bash
npx cap add android
```

```bash
npx cap sync
```

Luego abre el proyecto en Xcode o Android Studio. Necesitas una Mac con Xcode para iOS.

## Seguridad: qué es real y qué falta

- Contraseñas y PIN con PBKDF2-SHA256 (210 000 iteraciones). Nunca se guardan en claro.
- Microsoft Authenticator usa TOTP estándar (RFC 6238).
- Ponches y documentos firmados con ECDSA P-256 y encadenados con SHA-256.
- **Mientras todo sea local**, la llave de firma vive en el mismo dispositivo: protege contra cambios casuales, pero alguien con acceso técnico al dispositivo podría regenerarla. Con Supabase, la firma pasa al servidor (Edge Function) y los ponches quedan de solo-inserción en la base de datos (ver reglas en la migración). Ese es el modo para usar en producción.
- El sticker NFC o el QR fijo se pueden copiar. Por eso existe el QR dinámico y la geocerca; úsalos juntos.

## Estructura

```
src/lib/          lógica: ventas idempotentes, inventario, ponches, nómina, reportes, firmas
src/lib/payments  ATH Móvil y Stripe Terminal
src/pages/        pantallas
src/components/   componentes de interfaz
supabase/         esquema SQL y Edge Functions para el backend
```

## Antes de usarlo en producción

- La nómina calcula horas, extra, Seguro Social (6.2 %), Medicare (1.45 %) y las deducciones que configures. **No calcula la retención de contribución sobre ingresos de Hacienda ni otros impuestos** de forma automática: añádelos como deducción o valida con tu contador.
- Revisa las reglas de horas extra con la ley laboral que aplique a tu negocio.
