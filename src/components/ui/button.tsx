import React from "react"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "ghost" | "outline"
  size?: "default" | "sm"
}

const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  default: "bg-indigo-600 text-white hover:bg-indigo-700",
  ghost: "bg-transparent hover:bg-gray-100 text-gray-700",
  outline: "border border-gray-300 bg-transparent hover:bg-gray-100 text-gray-700",
}

const sizeClasses: Record<NonNullable<ButtonProps["size"]>, string> = {
  default: "h-10 px-4 text-sm",
  sm: "h-8 px-3 text-xs",
}

export function Button({
  variant = "default",
  size = "default",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md transition-colors focus:outline-none disabled:opacity-50 disabled:pointer-events-none ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    />
  )
} 