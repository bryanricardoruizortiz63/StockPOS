# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(Web app installable como PWA y empaquetada con Capacitor para iOS/Android. El lenguaje visual es uno solo, no adaptativo por OS.)

## Stack

Vite + React + TypeScript + Tailwind CSS (pedido por el usuario). Datos local-first en IndexedDB (Dexie) detrás de una capa de repositorio, con esquema Supabase incluido para conectar después (decisión del usuario: "Local + Supabase luego"). Capacitor para NFC, biometría y Tap to Pay. Tarjetas: Stripe Terminal (decisión del usuario).

## Users

- **Administrador / dueño**: maneja una o varias tiendas en Puerto Rico. Configura IVU, alertas de inventario, empleados, horarios, nómina, deducciones y bonos; aprueba certificaciones de empleo; revisa reportes de turno y de ventas. Usa teléfono, tablet o computadora.
- **Empleado / cajero**: cobra en el mostrador (efectivo, ATH Móvil, tarjeta), añade productos escaneando códigos de barras, cuadra caja al cerrar turno, poncha entrada/salida con su teléfono, ve su horario y sus talonarios, solicita certificación de empleo.

## Product Purpose

Una sola herramienta para inventario, punto de venta, ponches y nómina de tiendas pequeñas en Puerto Rico. Éxito: cada venta descuenta inventario, cada turno cuadra, cada ponche y talonario es verificable, y el dueño sabe qué comprar más.

## Positioning

Une POS + inventario + reloj de ponches + nómina con evidencia autenticada (registros firmados y encadenados, verificables), pensado para el IVU y ATH Móvil de Puerto Rico.

## Operating Context

- Mostrador de tienda, a menudo con luz fuerte y prisa; el cajero usa la app de pie, con una mano, en teléfono o tablet.
- Pago en efectivo con cálculo de cambio; ATH Móvil con número de referencia; tarjeta contactless vía Stripe Terminal.
- Ponche con sticker NFC en el local (Android) o código QR (iPhone/otros), más geolocalización.
- Cierre de turno con cuadre de efectivo; reporte al admin.
- Exportes PDF y Excel; envío de talonarios y cartas por email.

## Capabilities and Constraints

- Idioma: español (Puerto Rico). Moneda USD.
- IVU configurable por el admin en cualquier momento (por tienda).
- Cobro idempotente: una venta = una transacción, nunca duplicada.
- Admin requiere MFA una vez al día (TOTP compatible con Microsoft Authenticator y/o passkey con Face ID/huella).
- Multi-tienda; exportar productos entre tiendas, completos o solo descripción.
- Sin backend aún: emails quedan en una bandeja de salida hasta conectar Supabase.

## Brand Commitments

Nombre: **StockPOS**. No hay logo, colores ni voz definidos.

## Evidence on Hand

Ninguna. No inventar clientes, testimonios ni cifras.

## Product Principles

1. El cobro nunca se duplica y nunca se pierde.
2. Cada registro que afecta dinero o tiempo es verificable.
3. La acción principal de cada pantalla se alcanza con el pulgar.
4. El admin configura reglas; la app las aplica sin pedirle más.

## Accessibility & Inclusion

Objetivos táctiles grandes (mínimo 44px), contraste alto para luz de tienda, números tabulares legibles.
