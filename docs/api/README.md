# API Documentation

Generate Swagger/OpenAPI specifications directly from the NestJS project.

```bash
(cd backend && npm run swagger:export > ../docs/api/openapi.json)
```

- The CLI command synthesises route metadata from the `CoreModule` and writes `openapi.json` under `docs/api/`.
- Serve the docs locally via `npm run start:dev` and visit `http://localhost:3000/docs`.
- Commit regenerated specs whenever you add or modify controllers, DTOs, or guards that change the API surface.
