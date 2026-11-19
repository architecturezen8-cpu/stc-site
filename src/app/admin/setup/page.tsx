import { redirect } from "next/navigation";
import { AdminAuthForm } from "@/components/admin/auth-form";
import { adminSetupAvailable, getAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminSetupPage() {
  if (await getAdminSession()) redirect("/admin");
  if (!(await adminSetupAvailable())) redirect("/admin/login");
  return (
    <main className="relative grid min-h-svh place-items-center overflow-hidden bg-[#090908] px-4 py-10 text-white">
      <div className="grain pointer-events-none absolute inset-0 opacity-70" />
      <span className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-[#ffd444]/10 blur-3xl" />
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl backdrop-blur-sm sm:p-9">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-[#ffd444] font-display text-xl font-semibold text-[#0b0b0a]">S</span>
          <div>
            <p className="font-display text-lg font-semibold">St. Thomas&apos; College</p>
            <p className="text-[8px] uppercase tracking-[0.32em] text-white/45">Admin Studio · First setup</p>
          </div>
        </div>
        <p className="text-[10px] uppercase tracking-[0.3em] text-[#ffd444]">One-time setup</p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-[-0.02em]">Create the first admin.</h1>
        <p className="mb-8 mt-2 text-[13.5px] leading-relaxed text-white/50">This screen closes permanently after the first account is created. Use a strong private password.</p>
        <AdminAuthForm mode="setup" />
      </div>
    </main>
  );
}
