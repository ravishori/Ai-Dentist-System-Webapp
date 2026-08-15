"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { loadAuthCapability, type AuthCapability } from "../lib/api";

const LINKS = [
  { href: "/dashboard", label: "Workspace" },
  { href: "/patients", label: "Patients" },
  { href: "/appointments", label: "Appointments" },
  { href: "/practitioners", label: "Practitioners" },
  { href: "/status", label: "Status" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const [auth, setAuth] = useState<AuthCapability | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadAuthCapability()
      .then((value) => {
        if (!cancelled) {
          setAuth(value);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAuth({
            session: null,
            authenticated: false,
            authConfigured: null,
            authMessage: "Session probe failed.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <header className="site-header">
      <div className="container">
        <div className="site-header-inner">
          <Link href="/" className="brand-mark" aria-label="DentalCare AI home">
            DentalCare <span>AI</span>
          </Link>
          <nav className="nav-links" aria-label="Primary">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={
                  pathname === link.href || pathname.startsWith(`${link.href}/`)
                    ? "page"
                    : undefined
                }
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="header-actions">
            {auth?.authenticated ? (
              <form action="/api/auth/logout" method="post">
                <button className="btn btn-ghost" type="submit">
                  Sign out
                </button>
              </form>
            ) : auth?.authConfigured ? (
              <a className="btn btn-primary" href="/api/auth/login">
                Sign in
              </a>
            ) : (
              <Link className="btn btn-secondary" href="/status">
                Auth unset
              </Link>
            )}
          </div>
        </div>
        <nav className="mobile-nav" aria-label="Mobile">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={
                pathname === link.href || pathname.startsWith(`${link.href}/`) ? "page" : undefined
              }
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container stack">
        <strong className="brand-mark">
          DentalCare <span>AI</span>
        </strong>
        <p className="muted" style={{ margin: 0 }}>
          Staging workspace for organization-scoped patient, appointment, and practitioner
          operations. Notifications remain fail-closed until explicitly enabled.
        </p>
      </div>
    </footer>
  );
}
