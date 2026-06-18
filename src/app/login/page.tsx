"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./login.module.css";

type Status = "idle" | "loading" | "error" | "success";

export default function LoginPage() {
  const [passphrase, setPassphrase] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase.trim() || status === "loading") return;
    setStatus("loading");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase }),
      });

      if (res.ok) {
        setStatus("success");
      } else {
        setStatus("error");
        setTimeout(() => setStatus("idle"), 1800);
      }
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 1800);
    }
  };

  if (status === "success") {
    return <SuccessView />;
  }

  const isError = status === "error";
  const isActive = passphrase.trim().length > 0;

  return (
    <div className={styles.page}>
      <Link href="/" className={styles.backLink}>
        &larr; Back to the blog
      </Link>
      <div className={`${styles.card} ${isError ? styles.cardError : ""} ${isError ? styles.shake : ""}`}>
        <div className={styles.logo}>
          Daily<strong style={{ color: "#C96820" }}>bit</strong>
        </div>
        <p className={styles.subtitle}>
          <LockIcon />
          author access only
        </p>
        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            type="password"
            className={`${styles.input} ${isError ? styles.inputError : ""}`}
            placeholder="passphrase"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            autoFocus
            autoComplete="current-password"
            disabled={status === "loading"}
          />
          <button
            type="submit"
            className={styles.button}
            disabled={!isActive || status === "loading"}
            style={{ background: isActive ? "#C96820" : "#e0d6c4" }}
          >
            {status === "loading" ? "Verifying..." : "Enter"}
          </button>
        </form>
        {isError && (
          <p className={styles.errorText}>Incorrect passphrase. Try again.</p>
        )}
        <p className={styles.footer}>
          Only the author can post. Readers don&apos;t need to sign in.
        </p>
      </div>
    </div>
  );
}

function SuccessView() {
  return (
    <div className={styles.page}>
      <div className={`${styles.card} ${styles.successCard}`}>
        <div className={styles.checkmark}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <p className={styles.successText}>Welcome back, Irin</p>
        <Link href="/" className={styles.successLink}>
          Go to the blog &rarr;
        </Link>
      </div>
    </div>
  );
}

function LockIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
