// Switch to @supabase/ssr createBrowserClient so sessions are stored in cookies
// AND localStorage — this enables the middleware to read the session server-side.
// All existing imports of `supabase` from this file continue to work unchanged.
import { createBrowserClient } from "@supabase/ssr";

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
