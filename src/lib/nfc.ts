/** Web NFC: solo Chrome en Android. En iPhone se usa el QR (o la app nativa con plugin NFC). */
interface NdefRecord { recordType: string; data?: DataView; encoding?: string }
interface NdefReader {
  scan(o?: { signal?: AbortSignal }): Promise<void>;
  write(m: { records: { recordType: string; data: string }[] }, o?: { signal?: AbortSignal }): Promise<void>;
  addEventListener(t: 'reading', cb: (e: { message: { records: NdefRecord[] } }) => void, o?: { once?: boolean }): void;
  addEventListener(t: 'readingerror', cb: () => void): void;
}
type NdefCtor = new () => NdefReader;
const Ctor = () => (window as unknown as { NDEFReader?: NdefCtor }).NDEFReader;

export const nfcSupported = () => !!Ctor();

export function readTag(signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const C = Ctor();
    if (!C) return reject(new Error('Este dispositivo no lee NFC desde el navegador. Usa el QR.'));
    const r = new C();
    r.addEventListener('reading', ({ message }) => {
      for (const rec of message.records) {
        if ((rec.recordType === 'text' || rec.recordType === 'url') && rec.data) {
          return resolve(new TextDecoder(rec.encoding || 'utf-8').decode(rec.data));
        }
      }
      reject(new Error('El sticker no tiene un código de StockPOS.'));
    }, { once: true });
    r.addEventListener('readingerror', () => reject(new Error('No se pudo leer el sticker. Acércalo de nuevo.')));
    r.scan({ signal }).catch(() => reject(new Error('Permite el acceso a NFC para ponchar.')));
  });
}

export async function writeTag(text: string, signal: AbortSignal) {
  const C = Ctor();
  if (!C) throw new Error('Para programar stickers usa Chrome en un Android con NFC.');
  await new C().write({ records: [{ recordType: 'text', data: text }] }, { signal });
}
