import { type NextRequest, NextResponse } from "next/server";

/**
 * Optional HTTP basic auth for the whole dashboard. Set DASHBOARD_PASSWORD to turn it on
 * (username "admin"). The admin API token itself never leaves the server.
 */
export function proxy(request: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.next();

  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const [user, pass] = atob(header.slice(6)).split(":");
    if (user === "admin" && pass === password) return NextResponse.next();
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="VoiceDesk"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
