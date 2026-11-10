import Dexie, { type Table } from 'dexie';
import type {
  Store, User, Product, Sale, PaymentAttempt, Shift, Punch, Schedule, DeductionType,
  Bonus, PayStub, CertRequest, SignedDoc, OutboxMail, Notice, Setting,
} from './types';

export class StockDB extends Dexie {
  stores!: Table<Store, string>;
  users!: Table<User, string>;
  products!: Table<Product, string>;
  sales!: Table<Sale, string>;
  payments!: Table<PaymentAttempt, string>;
  shifts!: Table<Shift, string>;
  punches!: Table<Punch, string>;
  schedules!: Table<Schedule, string>;
  deductions!: Table<DeductionType, string>;
  bonuses!: Table<Bonus, string>;
  payStubs!: Table<PayStub, string>;
  certRequests!: Table<CertRequest, string>;
  docs!: Table<SignedDoc, string>;
  outbox!: Table<OutboxMail, string>;
  notices!: Table<Notice, string>;
  settings!: Table<Setting, string>;

  constructor(name = 'stockpos') {
    super(name);
    this.version(1).stores({
      stores: 'id, name',
      users: 'id, &email, role, *storeIds',
      products: 'id, storeId, [storeId+barcode], description, category',
      sales: 'id, storeId, shiftId, employeeId, day, createdAt, [storeId+day], paymentRef',
      payments: 'idempotencyKey, status',
      shifts: 'id, storeId, employeeId, openedAt, closedAt, [employeeId+closedAt]',
      punches: 'id, &seq, storeId, employeeId, at, [employeeId+at]',
      schedules: 'id, employeeId, storeId',
      deductions: 'id',
      bonuses: 'id, employeeId, date, payStubId',
      payStubs: 'id, employeeId, periodEnd',
      certRequests: 'id, employeeId, status, storeId',
      docs: 'id, kind, employeeId, storeId, createdAt',
      outbox: 'id, status, createdAt',
      notices: 'id, forRole, userId, read, createdAt',
      settings: 'key',
    });
  }
}

export let db = new StockDB();

/** Solo para pruebas: usa una base de datos aislada. */
export function useTestDb(name: string) {
  db = new StockDB(name);
  return db;
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  return (await db.settings.get(key))?.value as T | undefined;
}
export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value });
}
