import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const schema=z.object({name:z.string().trim().min(2).max(120),email:z.string().email().max(200),type:z.enum(["Consulting","Business partnership","Speaking and training","Education","Technology collaboration","Media","General"]),message:z.string().trim().min(20).max(5000),consent:z.union([z.literal("on"),z.literal(true)]),company_website:z.string().max(0).optional().default("")});
export async function POST(request:Request){
  try{const raw=await request.json();const parsed=schema.safeParse(raw);if(!parsed.success)return NextResponse.json({error:"Invalid enquiry"},{status:400});
    const supabase=createAdminClient();const {error}=await supabase.from("contact_enquiries").insert({name:parsed.data.name,email:parsed.data.email,enquiry_type:parsed.data.type,message:parsed.data.message,consent:true,status:"new"});
    if(error){console.error("Contact storage failed",error.code);return NextResponse.json({error:"Storage unavailable"},{status:503});}
    return NextResponse.json({ok:true},{status:201});
  }catch{return NextResponse.json({error:"Invalid request"},{status:400});}
}
