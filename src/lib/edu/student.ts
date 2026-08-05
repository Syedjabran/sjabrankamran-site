import { createClient } from "@/lib/supabase/server";

/** The signed-in user's student record, or null. */
export async function getMyStudent() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("edu_students")
    .select("id, student_no, admission_status")
    .eq("profile_id", user.id)
    .maybeSingle();
  return data ?? null;
}
