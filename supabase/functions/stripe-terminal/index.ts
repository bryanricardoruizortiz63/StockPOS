// Edge Function para Stripe Terminal (Tap to Pay).
// Rutas: /connection-token, /payment-intents, /capture. Secreto: STRIPE_SECRET_KEY.
// El Idempotency-Key de la venta se pasa a Stripe: un reintento nunca crea un segundo cargo.
const SK = Deno.env.get('STRIPE_SECRET_KEY')!;

async function stripe(path: string, body: Record<string, string>, idem?: string) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SK}`, 'Content-Type': 'application/x-www-form-urlencoded', ...(idem ? { 'Idempotency-Key': idem } : {}) },
    body: new URLSearchParams(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? 'Stripe error');
  return json;
}

Deno.serve(async (req) => {
  const path = new URL(req.url).pathname.split('/').pop();
  const idem = req.headers.get('Idempotency-Key') ?? undefined;
  try {
    if (path === 'connection-token') return Response.json(await stripe('terminal/connection_tokens', {}));
    const body = await req.json();
    if (path === 'payment-intents') {
      if (!idem) return new Response('Idempotency-Key requerido', { status: 400 });
      const pi = await stripe('payment_intents', {
        amount: String(body.amount), currency: body.currency ?? 'usd', description: body.description ?? '',
        'payment_method_types[]': 'card_present', capture_method: 'manual',
      }, idem);
      return Response.json({ id: pi.id, client_secret: pi.client_secret, status: pi.status });
    }
    if (path === 'capture') {
      const pi = await stripe(`payment_intents/${body.id}/capture`, {}, idem);
      const card = pi.latest_charge ? (await (await fetch(`https://api.stripe.com/v1/charges/${pi.latest_charge}`, { headers: { Authorization: `Bearer ${SK}` } })).json()).payment_method_details?.card_present : undefined;
      return Response.json({ id: pi.id, status: pi.status, last4: card?.last4 });
    }
    return new Response('Not found', { status: 404 });
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
});
