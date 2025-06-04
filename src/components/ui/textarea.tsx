import React from "react"

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

// Using forwardRef so that parent components can attach refs
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = "", ...props }, ref) => (
    <textarea
      ref={ref}
      className={`w-full rounded-md border border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 shadow-sm ${className}`}
      {...props}
    />
  ),
)

Textarea.displayName = "Textarea" 