import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId || !/^\d+$/.test(sessionId)) {
    return NextResponse.json(
      { error: "Missing or invalid sessionId" },
      { status: 400 }
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(
      `${BACKEND_URL}/sessions/${sessionId}/summary`,
      { signal: controller.signal }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const status = res.status >= 400 && res.status < 600 ? res.status : 502;
      return NextResponse.json(
        { error: `Backend returned ${res.status}`, detail: text },
        { status }
      );
    }

    let data: unknown;
    try {
      data = await res.json();
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
        ? "Summary request timed out"
        : `Failed to reach backend: ${err}`;
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
