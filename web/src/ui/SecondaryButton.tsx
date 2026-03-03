"use client";

import * as React from "react";
import Link from "next/link";

type BaseProps = {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

type ButtonProps = BaseProps & {
  as?: "button";
  href?: never;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
};

type LinkProps = BaseProps & {
  as: "link";
  href: string;
  type?: never;
  disabled?: never;
  onClick?: never;
};

export function SecondaryButton(props: ButtonProps | LinkProps) {
  const { children, className = "", style = {} } = props;
  const baseStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    padding: "12px 24px",
    borderRadius: "var(--r-lg)",
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
    fontSize: 16,
    fontWeight: 700,
    textDecoration: "none",
    cursor: "pointer",
    transition: "background 150ms, border-color 150ms",
  };

  if (props.as === "link" && props.href) {
  return (
    <Link
      href={props.href}
      className={`secondary-btn ${className}`.trim()}
      style={{
          ...baseStyle,
          ...style,
        }}
      >
        {children}
      </Link>
    );
  }

  const { type = "button", disabled, onClick } = props as ButtonProps;
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`secondary-btn ${className}`.trim()}
      style={{
        ...baseStyle,
        ...style,
        ...(disabled ? { opacity: 0.6, cursor: "not-allowed" } : {}),
      }}
    >
      {children}
    </button>
  );
}
