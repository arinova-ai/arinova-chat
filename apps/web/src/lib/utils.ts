import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isGroupLike(type: string | undefined | null): boolean {
  return type === 'group' || type === 'community';
}
