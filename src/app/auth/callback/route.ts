import { NextResponse } from "next/server";
import { createClient } from "@/core/db/server";

/** Completes the OAuth flow: exchanges the code for a session, then routes by status. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      let dest = "/pending";
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("status")
          .eq("id", user.id)
          .maybeSingle();
        if (profile?.status === "active") dest = "/";
        else if (profile?.status === "inactive") dest = "/login";
      }
      return NextResponse.redirect(`${origin}${dest}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
