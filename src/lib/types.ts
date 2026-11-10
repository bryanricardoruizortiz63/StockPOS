export type Role = 'admin' | 'employee';
export type FacadeColor = 'coral' | 'mango' | 'turquesa' | 'verdemar' | 'lila' | 'rosa';
export type PayMethod = 'cash' | 'athmovil' | 'card';

export interface Store {
  id: string;
  name: string;
  color: FacadeColor;
  address?: string;
  /** Tasa de IVU como fracción, p. ej. 0.115 */
  ivuRate: number;
  /** Umbral de alerta por defecto (unidades). */
  defaultAlertThreshold: number;
  /** Reglas de alerta por categoría: categoría → umbral */
  categoryThresholds: Record<string, number>;
  /** Secreto base32 para stickers NFC y QR dinámico de ponches */
  punchSecret: string;
  geofence?: { lat: number; lng: number; radiusM: number };
  createdAt: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  storeIds: string[];
  position?: string;
  hireDate?: string;
  active: boolean;
  salt: string;
  passwordHash?: string;
  pinHash?: string;
  totpSecret?: string;
  passkeys: Passkey[];
  mfaVerifiedOn?: string;
  // Nómina
  hourlyRate: number; // centavos
  weeklyHours: number;
  overtimeRate?: number; // centavos por hora; si falta → 1.5x
  healthPlan?: number; // centavos por periodo
  deductionIds: string[];
  createdAt: number;
}

export interface Passkey {
  id: string; // base64url credential id
  publicKey: string; // base64 SPKI
  alg: number;
  label: string;
  createdAt: number;
}

export interface Product {
  id: string;
  storeId: string;
  barcode: string;
  description: string;
  category?: string;
  marketPrice?: number; // centavos
  salePrice: number; // centavos
  quantity: number;
  alertThreshold?: number;
  photo?: string; // data URL (JPEG comprimido)
  createdAt: number;
  updatedAt: number;
}

export interface SaleItem {
  productId: string;
  description: string;
  barcode: string;
  qty: number;
  unitPrice: number;
}

export interface Sale {
  /** El id ES la llave de idempotencia de la venta. */
  id: string;
  storeId: string;
  shiftId: string;
  employeeId: string;
  items: SaleItem[];
  subtotal: number;
  ivuRate: number;
  ivu: number;
  total: number;
  method: PayMethod;
  tendered?: number;
  change?: number;
  /** Ref. ATH Móvil, id de PaymentIntent de Stripe o autorización de terminal */
  paymentRef?: string;
  cardLast4?: string;
  status: 'completed' | 'voided';
  createdAt: number;
  day: string; // YYYY-MM-DD (hora de PR)
}

export interface PaymentAttempt {
  idempotencyKey: string;
  storeId: string;
  method: PayMethod;
  amount: number;
  status: 'pending' | 'succeeded' | 'failed';
  providerRef?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Shift {
  id: string;
  storeId: string;
  employeeId: string;
  openedAt: number;
  closedAt?: number;
  openingCash: number;
  countedCash?: number;
  expectedCash?: number;
  cashSales?: number;
  cardSales?: number;
  athSales?: number;
  salesCount?: number;
  difference?: number;
  notes?: string;
  reportDocId?: string;
  reviewedByAdmin?: boolean;
}

export type PunchMethod = 'nfc' | 'qr' | 'kiosk' | 'manual';
export interface Punch {
  id: string;
  seq: number;
  storeId: string;
  employeeId: string;
  type: 'in' | 'out';
  at: number;
  method: PunchMethod;
  location?: { lat: number; lng: number; accuracy: number };
  distanceM?: number;
  note?: string;
  prevHash: string;
  hash: string;
  signature: string;
}

export interface ScheduleBlock {
  week: number; // 0..cycleWeeks-1
  weekday: number; // 0=domingo
  start: string; // HH:MM
  end: string;
}
export interface Schedule {
  id: string;
  employeeId: string;
  storeId: string;
  kind: 'fixed' | 'rotation';
  cycleWeeks: number;
  startDate: string; // YYYY-MM-DD, inicio del ciclo
  blocks: ScheduleBlock[];
  updatedAt: number;
}

export interface DeductionType {
  id: string;
  name: string;
  kind: 'percent' | 'fixed' | 'healthPlan';
  value: number; // percent como fracción; fixed en centavos
  active: boolean;
  builtin?: boolean;
}

export interface Bonus {
  id: string;
  employeeId: string;
  amount: number;
  date: string;
  description: string;
  payStubId?: string;
}

export interface PayStubLine { label: string; amount: number }
export interface PayStub {
  id: string;
  employeeId: string;
  storeId: string;
  periodStart: string;
  periodEnd: string;
  regularHours: number;
  overtimeHours: number;
  hourlyRate: number;
  overtimeRate: number;
  regularPay: number;
  overtimePay: number;
  bonuses: PayStubLine[];
  gross: number;
  deductions: PayStubLine[];
  net: number;
  docId: string;
  createdAt: number;
}

export interface CertRequest {
  id: string;
  employeeId: string;
  storeId: string;
  addressee: string;
  purpose: string;
  includeSalary: boolean;
  status: 'pending' | 'approved' | 'denied';
  requestedAt: number;
  decidedAt?: number;
  decisionNote?: string;
  docId?: string;
}

export type DocKind = 'shift-report' | 'pay-stub' | 'certification' | 'punch-archive' | 'punch-export' | 'sales-report';
export interface SignedDoc {
  id: string;
  kind: DocKind;
  title: string;
  storeId?: string;
  employeeId?: string;
  payload: unknown;
  hash: string;
  signature: string;
  createdAt: number;
}

export interface OutboxMail {
  id: string;
  to: string;
  subject: string;
  body: string;
  attachmentName?: string;
  attachment?: Blob;
  docId?: string;
  status: 'queued' | 'sent' | 'failed';
  createdAt: number;
}

export interface Notice {
  id: string;
  forRole: Role;
  userId?: string;
  storeId?: string;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: number;
}

export interface Setting { key: string; value: unknown }
