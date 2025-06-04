import React from "react"

export interface SeparatorProps {
  orientation?: "horizontal" | "vertical"
  className?: string
}

export function Separator({ orientation = "horizontal", className = "" }: SeparatorProps) {
  return (
    <div
      className={`${
        orientation === "vertical" ? "w-px h-full" : "h-px w-full"
      } bg-gray-200 ${className}`}
    />
  )
} 