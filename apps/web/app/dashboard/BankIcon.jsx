"use client";
import { Wallet } from "lucide-react";
import { findBankBrand, bankIconPath } from "../../lib/bank-brands";

export default function BankIcon({ name, size = 36, className = "" }) {
  const brand = findBankBrand(name);
  if (!brand) {
    return (
      <span
        className={`bank-placeholder-badge ${className}`.trim()}
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <Wallet size={Math.round(size * 0.5)} />
      </span>
    );
  }
  return (
    <img
      src={bankIconPath(brand)}
      alt={brand.name}
      width={size}
      height={size}
      className={`bank-logo-img ${className}`.trim()}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
    />
  );
}
