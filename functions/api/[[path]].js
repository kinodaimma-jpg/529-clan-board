import { handler } from "../../netlify/functions/api.mjs";

export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);

  const event = {
    path: url.pathname,
    httpMethod: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    body: ["GET", "HEAD"].includes(request.method) ? null : await request.text()
  };

  const result = await handler(event, context.env);

  return new Response(result.body ?? null, {
    status: result.statusCode ?? 200,
    headers: result.headers ?? {}
  });
}
