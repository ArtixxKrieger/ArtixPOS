## Packages
recharts | Beautiful analytics charts
date-fns | Date formatting and manipulation
lucide-react | Used for icons across the app
clsx | Class name merging
tailwind-merge | Class name merging

## Notes
- Tailwind config should extend fontFamily with `display` and `sans`
- API uses standard REST endpoints from @shared/routes
- Price fields in schema are `numeric` which come back as strings, needing parseFloat on the client
- Wouter used for routing
