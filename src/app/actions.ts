"use server";

import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

export async function submitEnquiry(formData: FormData) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  );

  const { error } = await supabase.from("enquiries").insert({
    customer_name: formData.get("customer_name") as string,
    phone: formData.get("phone") as string,
    email: (formData.get("email") as string) || null,
    service_type: formData.get("service_type") as string,
    preferred_date: (formData.get("preferred_date") as string) || null,
    notes: (formData.get("notes") as string) || "",
    source: "form",
  });

  if (error) {
    throw new Error(error.message);
  }

  redirect("/thank-you");
}