# Rule: Server Component first

Default to React Server Components. Add `"use client"` only when needed.

Needs `"use client"`:
- useState, useEffect, useReducer, useContext
- onClick, onChange, onSubmit and other event handlers
- Browser APIs (window, document, localStorage)
- Third-party client-only libraries

Does NOT need `"use client"`:
- Data fetching (async/await in component)
- Static rendering
- shadcn/ui components that don't use hooks
