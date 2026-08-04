"use client";
import { FormEvent, useState } from "react";

export function ContactForm(){
  const [state,setState]=useState<"idle"|"sending"|"sent"|"error">("idle");
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setState("sending");const form=new FormData(e.currentTarget);const body=Object.fromEntries(form.entries());const res=await fetch("/api/contact",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});setState(res.ok?"sent":"error");if(res.ok)e.currentTarget.reset();}
  const field="mt-2 w-full rounded-sm border border-ink/20 bg-white px-4 py-3 text-ink outline-none transition focus:border-gold";
  return <form onSubmit={submit} className="space-y-5">
    <div className="grid gap-5 md:grid-cols-2"><label className="text-sm text-secondary">Name<input className={field} name="name" required maxLength={120}/></label><label className="text-sm text-secondary">Email<input className={field} name="email" type="email" required maxLength={200}/></label></div>
    <label className="block text-sm text-secondary">Enquiry type<select className={field} name="type" required defaultValue=""><option value="" disabled>Select one</option><option>Consulting</option><option>Business partnership</option><option>Speaking and training</option><option>Education</option><option>Technology collaboration</option><option>Media</option><option>General</option></select></label>
    <label className="block text-sm text-secondary">Message<textarea className={field} name="message" required minLength={20} maxLength={5000} rows={7}/></label>
    <input name="company_website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true"/>
    <label className="flex gap-3 text-sm leading-6 text-secondary"><input type="checkbox" name="consent" required className="mt-1"/>I consent to my details being used to respond to this enquiry.</label>
    <button disabled={state==="sending"} className="rounded-full bg-ink px-7 py-3 text-sm font-medium text-ivory transition hover:bg-gold hover:text-ink disabled:opacity-50">{state==="sending"?"Sending…":"Send enquiry"}</button>
    <p aria-live="polite" className="text-sm text-secondary">{state==="sent"&&"Thank you. Your enquiry has been received."}{state==="error"&&"The enquiry could not be sent. Please try again later."}</p>
  </form>
}
