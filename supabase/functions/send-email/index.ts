// Edge Function: envía talonarios, certificaciones y reportes por email (Resend).
// Secretos: RESEND_API_KEY, MAIL_FROM. Idempotente por el header Idempotency-Key.
const seen = new Set<string>();

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const key = req.headers.get('Idempotency-Key') ?? crypto.randomUUID();
  if (seen.has(key)) return Response.json({ ok: true, duplicate: true });
  const { to, subject, text, attachment } = await req.json();
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({ from: Deno.env.get('MAIL_FROM'), to, subject, text, attachments: attachment ? [attachment] : undefined }),
  });
  if (res.ok) seen.add(key);
  return new Response(await res.text(), { status: res.status });
});
