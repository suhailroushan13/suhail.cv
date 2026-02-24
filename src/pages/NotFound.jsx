import React, { useEffect } from "react";
import { Link } from "react-router-dom";

export default function NotFound() {
  useEffect(() => {
    document.title = "404 - Page Not Found | Suhail Roushan";
    return () => {
      document.title = "Suhail Roushan | Software Engineer – Full Stack Developer";
    };
  }, []);
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#0f0f0f",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#fff",
        padding: 24,
      }}
    >
      <h1 style={{ fontSize: 120, fontWeight: 700, margin: 0, color: "rgba(255,255,255,0.9)" }}>
        404
      </h1>
      <p style={{ fontSize: 18, color: "rgba(255,255,255,0.6)", margin: "16px 0 32px" }}>
        Page not found. The receipt you're looking for doesn't exist.
      </p>
      <Link
        to="/"
        style={{
          padding: "12px 24px",
          fontSize: 16,
          fontWeight: 500,
          background: "#3b82f6",
          color: "#fff",
          textDecoration: "none",
          borderRadius: 8,
          transition: "background 0.2s",
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.background = "#2563eb";
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.background = "#3b82f6";
        }}
      >
        Back to Home
      </Link>
    </div>
  );
}
