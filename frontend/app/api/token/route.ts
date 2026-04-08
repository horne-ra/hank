import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function POST(request: Request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const body = await request.json().catch(() => ({}));
    const res = await fetch(`${BACKEND_URL}/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const status = res.status >= 400 && res.status < 600 ? res.status : 502;
      return NextResponse.json(
        { error: `Token server returned ${res.status}`, detail: text },
        { status }
      );
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      return NextResponse.json(
        { error: "Token server returned invalid JSON" },
        { status: 502 }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    const message =
      err instanceof DOMException && err.name === "AbortError"
        ? "Token server request timed out"
        : `Failed to reach token server: ${err}`;
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
