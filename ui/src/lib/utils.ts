import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Resolve a public asset path relative to the Vite base URL. */
export function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL ?? "/";
  // Strip leading slash from path to avoid double-slash
  const clean = path.startsWith("/") ? path.slice(1) : path;
  return `${base}${clean}`;
}
