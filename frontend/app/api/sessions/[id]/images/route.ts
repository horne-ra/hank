import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const formData = await request.formData();
    const res = await fetch(`${BACKEND_URL}/sessions/${id}/images`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      let body: unknown = text;
      try {
        body = text ? JSON.parse(text) : { detail: text };
      } catch {
        body = { detail: text || res.statusText };
      }
      return NextResponse.json(body, { status: res.status });
    }

    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      return NextResponse.json(
        { error: "Backend returned invalid JSON" },
        { status: 502 }
      );
    }
    return NextResponse.json(data);
  } catch (err) {
    const message =
      err instanceof DOMException && err.name === "AbortError"
        ? "Upload request timed out"
        : `Failed to reach backend: ${err}`;
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
