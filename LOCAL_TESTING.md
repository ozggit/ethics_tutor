Local Docker Test Flow

Prereqs
- Docker Desktop running
- .env populated with real credentials

Run
1) Build + start:
   docker compose -f docker-compose.local.yml up --build

2) Open:
   http://localhost:3000
   http://localhost:3000/admin

Quick checks
- Greeting: "שלום!" should return a welcome and examples.
- Content question: ask a topic from the course; should return a grounded answer with citations.
- Admin: click "Start sync" and verify status "completed".

Reset local data (optional)
- Stop and remove containers + volume:
  docker compose -f docker-compose.local.yml down -v
