import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function POST(request: Request) {
  const secret = process.env.TOKEN_AUTH_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        error:
          "TOKEN_AUTH_SECRET is not set (required to call the token server)",
      },
      { status: 500 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const res = await fetch(`${BACKEND_URL}/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Token server returned ${res.status}` },
        { status: 502 }
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to reach token server: ${err}` },
      { status: 502 }
    );
  }
}
