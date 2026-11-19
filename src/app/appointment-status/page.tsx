import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "@/components/eyebrow";
import { AppointmentStatusChecker } from "@/components/contact/appointment-status-checker";

/* v2.8.83.0 — public appointment status lookup (owner-approved option 3).
   A visitor enters the APT reference + the booking email and sees the
   office's current status — no phone call needed to know where things
   stand. Paired with the automatic confirmation email the office now
   sends on confirm/cancel. */

export const metadata: Metadata = {
  title: "Appointment Status — St. Thomas' College",
  description:
    "Check the status of a booked appointment with St. Thomas' College, Matale using your reference code and email address.",
};

export default function AppointmentStatusPage() {
  return (
    <main className="relative bg-surface text-fg">
      <Navbar />

      {/* Slim hero */}
      <section className="relative overflow-hidden bg-ink py-16 text-white md:py-20">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(60% 80% at 70% 20%, rgba(212,175,55,0.12), transparent 60%)",
          }}
        />
        <div className="relative mx-auto max-w-7xl px-5 md:px-8">
          <Reveal>
            <Eyebrow>Visitor Services</Eyebrow>
          </Reveal>
          <Reveal delay={120}>
            <h1 className="mt-6 max-w-2xl font-display text-4xl font-semibold leading-[1.1] tracking-[-0.02em] md:text-5xl">
              Appointment status
            </h1>
          </Reveal>
          <Reveal delay={200}>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-white/60">
              Booked a department visit? Track it here — the office confirms
              every appointment by phone or email, and this page always shows
              the current state of your booking.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Checker */}
      <section className="bg-surface py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <Reveal>
            <AppointmentStatusChecker />
          </Reveal>
          <Reveal delay={140}>
            <p className="mt-8 text-center text-[13.5px] text-fg/55">
              No booking yet?{" "}
              <Link
                href="/contact"
                className="font-semibold text-gold underline-offset-4 transition-colors hover:underline"
              >
                Book an appointment on the Contact page →
              </Link>
            </p>
          </Reveal>
        </div>
      </section>

      <Footer />
    </main>
  );
}
